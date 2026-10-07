"""Decision Agent reasoning engine: synthesizes signals from Analysis, Risk, Resources, and Knowledge Graph."""
import json
import logging
from datetime import date
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.projects import project_summary
from app.api.tickets import _load, tickets_summary
from app.db.models import Decision, Project
from app.graph.builder import analyze_dependencies, build_graph
from app.llm.gemini import LLMError, generate_json
from app.resources.workload import get_team_workload
from app.risk.model import score_tickets

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Decision Agent in an enterprise multi-agent project assistant.
You sit directly above the Project Analysis Agent, Risk Prediction Agent, and Resource Management Agent.

Your responsibilities:
1. Synthesize all upstream signals: commit frequency, overdue tickets, ML risk probabilities, team workload ratios, and knowledge graph root blockers.
2. Identify the SINGLE most critical issue facing the project.
3. Identify the true ROOT CAUSE by following the knowledge graph dependency trace (e.g. what earliest blocker is holding up downstream work).
4. Recommend ONE concrete, decisive action (e.g. reassign a blocker ticket, reprioritize an upstream dependency, or unblock a critical path).
5. Explain your reasoning thoroughly, citing the specific numbers, risk scores, and evidence from the data.
6. Rate your confidence as 'high', 'medium', or 'low'. High confidence requires convergence of graph blockers, ML risk, and workload data.
7. Return a clean structured JSON adhering strictly to the schema.
"""


class DecisionSchema(BaseModel):
    issue: str = Field(description="The single most important delivery issue facing the project")
    root_cause: str = Field(description="Root cause identified from knowledge graph blocker chains")
    recommended_action: str = Field(description="One concrete recommended action with specific tickets/assignees")
    action_type: str = Field(description="Category of action: reassign, unblock, reprioritize, or alert")
    target_ticket_key: str | None = Field(default=None, description="Primary ticket key involved")
    target_person_name: str | None = Field(default=None, description="Person involved")
    reasoning: str = Field(description="Detailed justification directly referencing numbers and facts")
    confidence: str = Field(description="Confidence rating: high, medium, or low")
    evidence: dict[str, list[str]] = Field(
        description="Dictionary mapping sources (github, jira, risk, resources, graph) to bullet points of evidence"
    )


def collect_decision_context(db: Session, project_id: int) -> dict[str, Any]:
    """Gather all upstream agent outputs for the project."""
    project = db.get(Project, project_id)
    gh = project_summary(project_id, db)
    t_summary = tickets_summary(project_id, db)
    tickets = _load(db, project_id)

    G = build_graph(db, project_id)
    deps = analyze_dependencies(G)

    # Scored risk tickets from ML model
    scored_risk = score_tickets(G, date.today()) or []
    high_risk_tickets = [t for t in scored_risk if t["level"] == "high"]

    # Resource workload
    resources = get_team_workload(db, project_id)
    overloaded = [m for m in resources["members"] if m["status"] == "overloaded"]
    underloaded = [m for m in resources["members"] if m["status"] == "underloaded"]

    return {
        "project": {"id": project.id, "name": project.name},
        "github": {
            "commits_total": gh.get("commits", 0),
            "open_prs": gh.get("pull_requests", {}).get("open", 0),
            "avg_hours_to_merge": gh.get("avg_hours_to_merge"),
        },
        "tickets": {
            "total": t_summary.get("total", 0),
            "open": t_summary.get("total", 0) - t_summary.get("done", 0),
            "overdue": t_summary.get("overdue", 0),
            "blocked": t_summary.get("blocked", 0),
        },
        "knowledge_graph": {
            "root_blockers": deps.get("root_blockers", []),
            "cycles_detected": deps.get("has_cycles", False),
        },
        "risk_prediction": {
            "high_risk_count": len(high_risk_tickets),
            "top_flagged_tickets": [
                {
                    "key": t["key"],
                    "title": t["title"],
                    "probability": t["probability"],
                    "reasons": t["reasons"],
                    "blocks_count": t["blocks_count"],
                }
                for t in scored_risk[:4]
            ],
        },
        "resources": {
            "overloaded_members": [
                {"name": m["name"], "open_tickets": m["open_tickets_count"], "load_ratio": m["load_ratio"]}
                for m in overloaded
            ],
            "underloaded_members": [
                {"name": m["name"], "open_tickets": m["open_tickets_count"], "load_ratio": m["load_ratio"]}
                for m in underloaded
            ],
            "suggested_reassignments": [
                s["rationale"] for s in resources.get("suggestions", [])[:3]
            ],
        },
    }


def generate_decision(db: Session, project_id: int) -> Decision:
    """Run the Decision Agent: synthesize context, call LLM with fallback, and save Decision in DB."""
    context = collect_decision_context(db, project_id)

    prompt = (
        f"Synthesize the following multi-agent delivery signals for project '{context['project']['name']}':\n"
        f"{json.dumps(context, indent=2)}\n\n"
        "Identify the most pressing bottleneck, determine the root cause, and formulate ONE concrete action with confidence."
    )

    try:
        output: DecisionSchema = generate_json(prompt, SYSTEM_PROMPT, DecisionSchema)
        decision = Decision(
            project_id=project_id,
            issue=output.issue,
            root_cause=output.root_cause,
            recommended_action=output.recommended_action,
            action_type=output.action_type.lower(),
            target_ticket_key=output.target_ticket_key,
            target_person_name=output.target_person_name,
            reasoning=output.reasoning,
            confidence=output.confidence.lower(),
            evidence=output.evidence,
            status="proposed",
        )
    except Exception as e:
        logger.warning("Decision LLM failed, using structured heuristic synthesis: %s", e)
        decision = _heuristic_decision_fallback(project_id, context)

    db.add(decision)
    db.commit()
    db.refresh(decision)
    return decision


def _heuristic_decision_fallback(project_id: int, context: dict) -> Decision:
    """Deterministic fallback if language model is unreachable."""
    root_blockers = context["knowledge_graph"]["root_blockers"]
    top_risk = context["risk_prediction"]["top_flagged_tickets"]
    overloaded = context["resources"]["overloaded_members"]
    underloaded = context["resources"]["underloaded_members"]

    target_key = None
    target_person = underloaded[0]["name"] if underloaded else None
    action_type = "unblock"

    if root_blockers:
        rb = root_blockers[0]
        target_key = rb["key"]
        issue = f"Root blocker {rb['key']} is obstructing downstream delivery"
        root_cause = f"{rb['key']} blocks {rb['blocks_open_count']} open tickets along chain: {' -> '.join(rb.get('longest_chain', [rb['key']]))}."
        if overloaded and underloaded:
            recommended_action = f"Reassign blocker {rb['key']} to {underloaded[0]['name']} to eliminate critical-path bottleneck."
            action_type = "reassign"
        else:
            recommended_action = f"Prioritize immediate completion of {rb['key']} to unblock dependent tickets."
            action_type = "unblock"
        confidence = "high"
    elif top_risk:
        tr = top_risk[0]
        target_key = tr["key"]
        issue = f"High-risk ticket {tr['key']} has {round(tr['probability'] * 100)}% lateness probability"
        root_cause = f"Identified risk factors: {', '.join(tr.get('reasons', ['lateness patterns']))}."
        recommended_action = f"Review requirements and allocate additional support to deliver {tr['key']}."
        action_type = "reprioritize"
        confidence = "medium"
    else:
        issue = "Delivery velocity requires active monitoring"
        root_cause = "No blocking dependencies or high-risk tickets detected in current backlog."
        recommended_action = "Maintain current sprint pace and monitor team capacity."
        action_type = "alert"
        confidence = "low"

    reasoning = (
        f"Upstream signals show {context['tickets']['open']} open tickets ({context['tickets']['overdue']} overdue). "
        f"The Risk Agent flagged {context['risk_prediction']['high_risk_count']} high-risk tickets. "
        f"Resource analysis identified {len(overloaded)} overloaded team members."
    )

    evidence = {
        "jira": [f"{context['tickets']['open']} open tickets", f"{context['tickets']['overdue']} overdue"],
        "graph": [f"{len(root_blockers)} root blockers identified"],
        "risk": [f"{context['risk_prediction']['high_risk_count']} tickets flagged with >= 60% probability"],
        "resources": [f"{len(overloaded)} team members carrying > 1.3x average load"],
    }

    return Decision(
        project_id=project_id,
        issue=issue,
        root_cause=root_cause,
        recommended_action=recommended_action,
        action_type=action_type,
        target_ticket_key=target_key,
        target_person_name=target_person,
        reasoning=reasoning,
        confidence=confidence,
        evidence=evidence,
        status="proposed",
    )

