"""Project Analysis Agent: stats + knowledge graph + baseline risk + LLM briefing.

Numbers are computed in code; the LLM only narrates them.
"""
import json
import logging
from datetime import date, datetime, timezone

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.projects import project_summary  # NOTE: reuse; moves to a services/ layer later
from app.api.tickets import _load, tickets_summary
from app.core.config import get_settings
from app.db.models import Project, ProjectSnapshot
from app.graph.builder import analyze_dependencies, build_graph, graph_stats
from app.llm.gemini import LLMError, generate_json

logger = logging.getLogger(__name__)


class AnalysisSummary(BaseModel):
    headline: str
    key_concerns: list[str]
    positives: list[str]
    watch_next: str


SYSTEM_PROMPT = """You are the Project Analysis Agent of an engineering project-management assistant.
Write a factual briefing for a project manager using ONLY the JSON data provided.
Rules:
- Never invent numbers, ticket keys, people or dates. Every claim must come from the data.
- Cite ticket keys (e.g. AGT-3) when you mention a specific ticket.
- If a field is empty or missing, say the data is unavailable instead of guessing.
- Be concise and direct.
Return JSON with exactly these keys:
  "headline": one sentence on overall project health,
  "key_concerns": up to 4 short strings, most serious first,
  "positives": up to 2 short strings (may be empty),
  "watch_next": one sentence on what the manager should look at first."""

# ---- TEMPORARY baseline risk (replaced by the trained ML model in Phase 12) ----
PRIORITY_WEIGHT = {"Highest": 15, "High": 10, "Medium": 5}


def baseline_risk(tickets: list, today: date) -> list[dict]:
    by_key = {t.key: t for t in tickets}
    scored = []
    for t in tickets:
        if t.status_category == "done":
            continue
        score, reasons = 0, []
        if t.is_overdue:
            days = (today - t.due_date).days
            score += 40
            reasons.append(f"overdue by {days} day{'s' if days != 1 else ''}")
        open_blockers = [k for k in t.blocked_by if k in by_key and by_key[k].status_category != "done"]
        if open_blockers:
            score += 25
            reasons.append("blocked by " + ", ".join(open_blockers))
        if t.assignee is None:
            score += 15
            reasons.append("unassigned")
        if t.due_date and not t.is_overdue and (t.due_date - today).days <= 3 and t.status_category == "new":
            score += 10
            reasons.append("due within 3 days but not started")
        if score > 0:
            weight = PRIORITY_WEIGHT.get(t.priority, 0)
            score += weight
            if weight >= 10:
                reasons.append(f"{t.priority} priority")
        if score:
            score = min(score, 100)
            level = "high" if score >= 60 else "medium" if score >= 30 else "low"
            scored.append({"key": t.key, "title": t.title, "score": score, "level": level, "reasons": reasons})
    return sorted(scored, key=lambda r: -r["score"])[:8]


def baseline_health(at_risk: list[dict], ticket_stats: dict) -> str:
    high = sum(r["level"] == "high" for r in at_risk)
    if high >= 2 or ticket_stats["overdue"] >= 3:
        return "red"
    if ticket_stats["overdue"] or ticket_stats["blocked"] or high:
        return "amber"
    return "green"


def compute_project_state(db: Session, project: Project) -> dict:
    today = date.today()

    github = project_summary(project.id, db)
    if github.get("last_commit_at"):
        github["last_commit_at"] = github["last_commit_at"].isoformat()

    tickets = _load(db, project.id)
    ticket_stats = tickets_summary(project.id, db)

    graph = build_graph(db, project.id)
    dependencies = analyze_dependencies(graph)
    at_risk = baseline_risk(tickets, today)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": {
            "id": project.id, "name": project.name,
            "github_repo": project.github_repo, "jira_project_key": project.jira_project_key,
        },
        "github": github,
        "tickets": ticket_stats,
        "graph": {**graph_stats(graph), **dependencies},
        "at_risk_tickets": at_risk,
        "health": {
            "status": baseline_health(at_risk, ticket_stats),
            "method": "baseline heuristic (replaced by the ML risk model later)",
        },
    }


def run_analysis(db: Session, project: Project) -> ProjectSnapshot:
    state = compute_project_state(db, project)

    llm_input = {
        "project": state["project"]["name"],
        "github": state["github"],
        "tickets": state["tickets"],
        "graph_counts": {"nodes": state["graph"]["nodes"], "edges": state["graph"]["edges"]},
        "root_blockers": state["graph"]["root_blockers"][:3],
        "at_risk_tickets": state["at_risk_tickets"][:6],
        "health": state["health"]["status"],
    }

    summary, model, error = None, None, None
    try:
        result = generate_json(
            prompt="Project data:\n" + json.dumps(llm_input, indent=2),
            system=SYSTEM_PROMPT,
            schema=AnalysisSummary,
        )
        summary, model = result.model_dump(), get_settings().gemini_model
    except LLMError as e:
        logger.warning("LLM summary unavailable: %s", e)
        error = str(e)[:300]

    snapshot = ProjectSnapshot(
        project_id=project.id, state=state, summary=summary, llm_model=model, llm_error=error
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot