"""Project Analysis Agent: shared pieces (output schema, prompt, baseline scoring).

The steps are orchestrated by the LangGraph pipeline in pipeline.py.
Numbers are computed in code; the LLM only narrates them.
"""
from datetime import date

from pydantic import BaseModel


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

# ---- TEMPORARY baseline risk (replaced by the trained ML model in Phase 12 of the roadmap) ----
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


def build_llm_input(state: dict) -> dict:
    """The compact, factual subset of the project state that the LLM is allowed to see."""
    return {
        "project": state["project"]["name"],
        "github": state["github"],
        "tickets": state["tickets"],
        "graph_counts": {"nodes": state["graph"]["nodes"], "edges": state["graph"]["edges"]},
        "root_blockers": state["graph"]["root_blockers"][:3],
        "at_risk_tickets": state["at_risk_tickets"][:6],
        "health": state["health"]["status"],
    }