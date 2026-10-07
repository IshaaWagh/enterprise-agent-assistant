"""API endpoints for Autonomous Action Agent."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.actions.engine import (
    create_action_from_decision,
    execute_action,
    get_or_create_autonomy_setting,
    get_track_record,
    reject_action,
    update_autonomy_setting,
)
from app.api.deps import require_project_access
from app.api.projects import _project_or_404
from app.db.models import ActionItem, Decision
from app.db.session import get_db

router = APIRouter(prefix="/api/projects", tags=["actions"], dependencies=[Depends(require_project_access)])


class UpdateSettingsRequest(BaseModel):
    level: str  # suggest_only, approve_first, fully_autonomous
    auto_execute_confidence: str = "high"


class RejectRequest(BaseModel):
    reason: str = ""


class CreateFromDecisionRequest(BaseModel):
    decision_id: int


@router.get("/{project_id}/actions/settings")
def get_settings_endpoint(project_id: int, db: Session = Depends(get_db)) -> dict:
    """Get the Trust Dial setting for the project."""
    _project_or_404(db, project_id)
    s = get_or_create_autonomy_setting(db, project_id)
    return {
        "level": s.level,
        "auto_execute_confidence": s.auto_execute_confidence,
        "notify_slack": s.notify_slack,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.put("/{project_id}/actions/settings")
def update_settings_endpoint(
    project_id: int, req: UpdateSettingsRequest, db: Session = Depends(get_db)
) -> dict:
    """Update the Trust Dial autonomy level."""
    _project_or_404(db, project_id)
    if req.level not in ("suggest_only", "approve_first", "fully_autonomous"):
        raise HTTPException(status_code=400, detail="Invalid autonomy level")
    s = update_autonomy_setting(db, project_id, req.level, req.auto_execute_confidence)
    return {
        "level": s.level,
        "auto_execute_confidence": s.auto_execute_confidence,
        "notify_slack": s.notify_slack,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/{project_id}/actions/queue")
def get_queue(project_id: int, db: Session = Depends(get_db)) -> dict:
    """List pending actions awaiting PM approval."""
    _project_or_404(db, project_id)
    items = (
        db.query(ActionItem)
        .filter(ActionItem.project_id == project_id, ActionItem.status == "pending_approval")
        .order_by(ActionItem.created_at.desc())
        .all()
    )
    return {
        "queue": [
            {
                "id": a.id,
                "decision_id": a.decision_id,
                "title": a.title,
                "description": a.description,
                "action_type": a.action_type,
                "target_system": a.target_system,
                "payload": a.payload,
                "autonomy_level": a.autonomy_level,
                "status": a.status,
                "execution_log": a.execution_log,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in items
        ]
    }


@router.get("/{project_id}/actions/history")
def get_history(project_id: int, db: Session = Depends(get_db)) -> dict:
    """List action history and performance track record."""
    _project_or_404(db, project_id)
    items = (
        db.query(ActionItem)
        .filter(ActionItem.project_id == project_id)
        .order_by(ActionItem.created_at.desc())
        .limit(30)
        .all()
    )
    track_record = get_track_record(db, project_id)
    return {
        "track_record": track_record,
        "history": [
            {
                "id": a.id,
                "title": a.title,
                "description": a.description,
                "action_type": a.action_type,
                "target_system": a.target_system,
                "status": a.status,
                "autonomy_level": a.autonomy_level,
                "execution_log": a.execution_log,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
                "resolved_by": a.resolved_by,
            }
            for a in items
        ],
    }


@router.post("/{project_id}/actions/{action_id}/approve")
def approve_action(project_id: int, action_id: int, db: Session = Depends(get_db)) -> dict:
    """Approve and execute a queued action."""
    _project_or_404(db, project_id)
    action = db.get(ActionItem, action_id)
    if not action or action.project_id != project_id:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Action cannot be approved from status '{action.status}'")

    updated = execute_action(db, action, actor="PM (Manual Approval)")
    return {
        "success": True,
        "action": {
            "id": updated.id,
            "status": updated.status,
            "resolved_at": updated.resolved_at.isoformat() if updated.resolved_at else None,
            "execution_log": updated.execution_log,
        },
    }


@router.post("/{project_id}/actions/{action_id}/reject")
def reject_action_endpoint(
    project_id: int, action_id: int, req: RejectRequest, db: Session = Depends(get_db)
) -> dict:
    """Reject a queued action."""
    _project_or_404(db, project_id)
    try:
        updated = reject_action(db, action_id, reason=req.reason, actor="PM")
        return {
            "success": True,
            "action": {
                "id": updated.id,
                "status": updated.status,
                "resolved_at": updated.resolved_at.isoformat() if updated.resolved_at else None,
                "execution_log": updated.execution_log,
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{project_id}/actions/from-decision")
def queue_from_decision(
    project_id: int, req: CreateFromDecisionRequest, db: Session = Depends(get_db)
) -> dict:
    """Queue an action directly from a generated Decision recommendation."""
    _project_or_404(db, project_id)
    decision = db.get(Decision, req.decision_id)
    if not decision or decision.project_id != project_id:
        raise HTTPException(status_code=404, detail="Decision not found")

    action = create_action_from_decision(db, project_id, decision)
    return {
        "success": True,
        "action": {
            "id": action.id,
            "title": action.title,
            "status": action.status,
            "autonomy_level": action.autonomy_level,
            "execution_log": action.execution_log,
        },
    }

