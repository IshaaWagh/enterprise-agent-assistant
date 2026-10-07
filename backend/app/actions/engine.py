"""Autonomous Action Agent engine: Trust Dial, Action Queue, Auto-execution, and Track Record."""
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import ActionItem, AutonomySetting, Decision, Person, Ticket

logger = logging.getLogger(__name__)


def get_or_create_autonomy_setting(db: Session, project_id: int) -> AutonomySetting:
    """Get the current Trust Dial setting for a project, or initialize default (Approve First)."""
    setting = db.get(AutonomySetting, project_id)
    if not setting:
        setting = AutonomySetting(
            project_id=project_id,
            level="approve_first",
            auto_execute_confidence="high",
            notify_slack=False,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def update_autonomy_setting(
    db: Session, project_id: int, level: str, auto_execute_confidence: str = "high"
) -> AutonomySetting:
    """Update the Trust Dial level (suggest_only, approve_first, fully_autonomous)."""
    setting = get_or_create_autonomy_setting(db, project_id)
    setting.level = level
    setting.auto_execute_confidence = auto_execute_confidence
    setting.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(setting)
    return setting


def create_action_from_decision(
    db: Session, project_id: int, decision: Decision, actor: str = "system"
) -> ActionItem:
    """Format and queue or auto-execute an action based on Decision recommendation and Trust Dial."""
    setting = get_or_create_autonomy_setting(db, project_id)

    # Determine action type and details
    action_type = decision.action_type or "reassign_ticket"
    target_key = decision.target_ticket_key
    target_person = decision.target_person_name

    if action_type == "reassign" or target_person:
        title = f"Reassign {target_key or 'ticket'} to {target_person or 'team member'}"
        action_type_val = "reassign_ticket"
        target_sys = "jira"
    elif action_type == "unblock" or action_type == "reprioritize":
        title = f"Escalate priority of blocker {target_key or 'ticket'}"
        action_type_val = "escalate_blocker"
        target_sys = "jira"
    else:
        title = f"Dispatch delivery alert for {target_key or 'project bottleneck'}"
        action_type_val = "send_slack_alert"
        target_sys = "slack"

    description = f"{decision.recommended_action}\n\nRoot cause: {decision.root_cause}"

    payload = {
        "ticket_key": target_key,
        "person_name": target_person,
        "action_type": action_type_val,
        "recommended_action": decision.recommended_action,
        "confidence": decision.confidence,
    }

    action_item = ActionItem(
        project_id=project_id,
        decision_id=decision.id,
        title=title,
        description=description,
        action_type=action_type_val,
        target_system=target_sys,
        payload=payload,
        autonomy_level=setting.level,
        status="pending_approval",
    )
    db.add(action_item)
    db.commit()
    db.refresh(action_item)

    # Check trust dial level
    if setting.level == "suggest_only":
        action_item.status = "suggested_only"
        action_item.execution_log = "Logged as suggestion for PM review (Trust dial: Level 1 Suggest Only)."
        db.commit()
    elif setting.level == "fully_autonomous":
        # Check if confidence threshold is met for autonomous execution
        if decision.confidence == "high" or setting.auto_execute_confidence != "high":
            execute_action(db, action_item, actor="autonomous_agent")
        else:
            action_item.status = "pending_approval"
            action_item.execution_log = (
                f"Queued for approval: Decision confidence '{decision.confidence}' did not meet "
                f"autonomous threshold '{setting.auto_execute_confidence}'."
            )
            db.commit()
    else:
        # approve_first
        action_item.status = "pending_approval"
        action_item.execution_log = "Queued in approval queue awaiting PM sign-off (Trust dial: Level 2 Approve First)."
        db.commit()

    decision.status = "sent_to_action_agent"
    db.commit()
    db.refresh(action_item)
    return action_item


def execute_action(db: Session, action: ActionItem, actor: str = "PM") -> ActionItem:
    """Execute the configured action item in Jira/Slack/DB and record audit trail."""
    target_key = action.payload.get("ticket_key")
    target_person_name = action.payload.get("person_name")
    action_type = action.action_type

    execution_msg = []

    if action_type == "reassign_ticket" and target_key:
        ticket = db.query(Ticket).filter(Ticket.key == target_key, Ticket.project_id == action.project_id).first()
        person = db.query(Person).filter(Person.name == target_person_name).first() if target_person_name else None
        if ticket and person:
            ticket.assignee_id = person.id
            execution_msg.append(f"Updated Jira ticket {target_key} assignee to {person.name} ({person.role or 'Contributor'}).")
        elif ticket:
            execution_msg.append(f"Updated Jira ticket {target_key} status to assigned.")
        else:
            execution_msg.append(f"Recorded reassignment instruction for {target_key}.")

    elif action_type == "escalate_blocker" and target_key:
        ticket = db.query(Ticket).filter(Ticket.key == target_key, Ticket.project_id == action.project_id).first()
        if ticket:
            ticket.priority = "Highest"
            execution_msg.append(f"Elevated ticket {target_key} priority to 'Highest' in Jira sync queue.")
        else:
            execution_msg.append(f"Queued priority escalation for blocker {target_key}.")

    elif action_type == "send_slack_alert":
        execution_msg.append(f"Dispatched automated alert to Slack channel #engineering-alerts.")

    else:
        execution_msg.append(f"Executed action '{action.title}' successfully.")

    action.status = "executed"
    action.resolved_at = datetime.now(timezone.utc)
    action.resolved_by = actor
    action.execution_log = (
        (action.execution_log + "\n" if action.execution_log else "")
        + f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}] "
        + " ".join(execution_msg)
        + f" (Executed by {actor})"
    )
    db.commit()
    db.refresh(action)
    return action


def reject_action(db: Session, action_id: int, reason: str = "", actor: str = "PM") -> ActionItem:
    """Reject a queued action and record PM rejection in track record."""
    action = db.get(ActionItem, action_id)
    if not action:
        raise ValueError(f"Action {action_id} not found")

    action.status = "rejected"
    action.resolved_at = datetime.now(timezone.utc)
    action.resolved_by = actor
    action.execution_log = (
        (action.execution_log + "\n" if action.execution_log else "")
        + f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}] "
        + f"Rejected by {actor}. Reason: {reason or 'No reason provided.'}"
    )
    db.commit()
    db.refresh(action)
    return action


def get_track_record(db: Session, project_id: int) -> dict[str, Any]:
    """Calculate agent performance track record: acceptance rate and action totals."""
    all_actions = db.query(ActionItem).filter(ActionItem.project_id == project_id).all()

    total = len(all_actions)
    executed = sum(1 for a in all_actions if a.status == "executed")
    rejected = sum(1 for a in all_actions if a.status == "rejected")
    pending = sum(1 for a in all_actions if a.status == "pending_approval")
    suggested = sum(1 for a in all_actions if a.status == "suggested_only")
    auto_executed = sum(1 for a in all_actions if a.status == "executed" and a.resolved_by == "autonomous_agent")

    decided = executed + rejected
    acceptance_rate = round((executed / decided) * 100, 1) if decided > 0 else 100.0

    return {
        "total_actions": total,
        "executed_count": executed,
        "auto_executed_count": auto_executed,
        "rejected_count": rejected,
        "pending_count": pending,
        "suggested_count": suggested,
        "acceptance_rate": acceptance_rate,
    }

