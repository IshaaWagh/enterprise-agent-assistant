"""LangGraph multi-agent pipeline orchestrating all five specialized AI agents:

  collect_data (Analysis)
    -> build_knowledge_graph (Analysis)
    -> score_risk (Risk Prediction Agent)
    -> analyze_resources (Resource Management Agent)
    -> assemble_state
    -> generate_summary (Analysis LLM)
    -> make_decision (Decision Agent)
    -> process_actions (Autonomous Action Agent)
    -> save_snapshot
"""
import functools
import json
import logging
import operator
import time
from datetime import date, datetime, timezone
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.actions.engine import create_action_from_decision
from app.agents.analysis import (
    SYSTEM_PROMPT, AnalysisSummary, baseline_health, baseline_risk, build_llm_input,
)
from app.api.projects import project_summary
from app.api.tickets import _load, tickets_summary
from app.core.config import get_settings
from app.db.models import Decision, PredictionLog, Project, ProjectSnapshot
from app.decision.engine import generate_decision
from app.graph.builder import analyze_dependencies, build_graph, graph_stats
from app.llm.gemini import LLMError, generate_json
from app.resources.workload import get_team_workload
from app.risk.model import score_tickets

logger = logging.getLogger(__name__)


class PipelineState(TypedDict, total=False):
    """Data flowing through the graph. Each node returns only the keys it changes."""

    github: dict
    tickets: list
    ticket_stats: dict
    graph_info: dict
    at_risk: list
    health: str
    resources: dict
    decision: dict | None
    action_item: dict | None
    project_state: dict
    summary: dict | None
    llm_model: str | None
    llm_error: str | None
    snapshot_id: int
    risk_method: str
    # Reducer: every node's trace entry is appended instead of overwriting.
    trace: Annotated[list[dict], operator.add]


def traced(step_id: str, label: str):
    """Time a node and append a trace entry. A node can report {"_status": "degraded"}."""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(state: PipelineState) -> dict:
            started = time.perf_counter()
            update = fn(state)
            status = update.pop("_status", "ok")
            ms = round((time.perf_counter() - started) * 1000)
            update["trace"] = [{"id": step_id, "label": label, "status": status, "ms": ms}]
            return update

        return wrapper

    return decorator


def build_pipeline(db: Session, project: Project):
    """Create and compile the graph. Node functions close over the DB session and project."""

    @traced("collect_data", "Collect GitHub and Jira data")
    def collect_data(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"github": {}, "tickets": [], "ticket_stats": {}}
        github = project_summary(project.id, db)
        if github.get("last_commit_at"):
            github["last_commit_at"] = github["last_commit_at"].isoformat()
        return {
            "github": github,
            "tickets": _load(db, project.id),
            "ticket_stats": tickets_summary(project.id, db),
        }

    @traced("build_knowledge_graph", "Build knowledge graph")
    def build_knowledge_graph(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"graph_info": {}}
        G = build_graph(db, project.id)
        return {"graph_info": {**graph_stats(G), **analyze_dependencies(G)}}

    @traced("score_risk", "Score risk (Risk Prediction Agent)")
    def score_risk(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"at_risk": [], "health": "green", "risk_method": "baseline"}
        scored = score_tickets(build_graph(db, project.id), date.today())
        if scored is None:  # model not trained yet: fall back to the baseline
            at_risk = baseline_risk(state.get("tickets", []), date.today())
            return {
                "at_risk": at_risk,
                "health": baseline_health(at_risk, state.get("ticket_stats", {})),
                "risk_method": "baseline heuristic (ML model not trained)",
                "_status": "degraded",
            }
        db.add_all(
            PredictionLog(
                project_id=project.id,
                ticket_key=r["key"],
                probability=r["probability"],
                model_version=r["model_version"],
                features=r["features"],
            )
            for r in scored
        )
        at_risk = [
            {k: r[k] for k in ("key", "title", "score", "level", "reasons", "probability", "blocks_count")}
            for r in scored
            if r["score"] >= 20
        ][:8]
        return {
            "at_risk": at_risk,
            "health": baseline_health(at_risk, state.get("ticket_stats", {})),
            "risk_method": "gradient boosting model, trained on synthetic data",
        }

    @traced("analyze_resources", "Analyze resources (Resource Management Agent)")
    def analyze_resources(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"resources": {}}
        res = get_team_workload(db, project.id)
        return {
            "resources": {
                "team_size": res["team_size"],
                "average_tickets": res["average_tickets_per_person"],
                "overloaded": res["overloaded_count"],
                "underloaded": res["underloaded_count"],
                "suggestions_count": len(res.get("suggestions", [])),
                "members": [
                    {
                        "name": m["name"],
                        "role": m["role"],
                        "open_tickets": m["open_tickets_count"],
                        "load_ratio": m["load_ratio"],
                        "status": m["status"],
                    }
                    for m in res["members"]
                ],
            }
        }

    @traced("assemble_state", "Assemble project state")
    def assemble_state(state: PipelineState) -> dict:
        return {
            "project_state": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "project": {
                    "id": project.id if project else 0,
                    "name": project.name if project else "",
                    "github_repo": project.github_repo if project else None,
                    "jira_project_key": project.jira_project_key if project else None,
                },
                "github": state.get("github", {}),
                "tickets": state.get("ticket_stats", {}),
                "graph": state.get("graph_info", {}),
                "at_risk_tickets": state.get("at_risk", []),
                "resources": state.get("resources", {}),
                "health": {
                    "status": state.get("health", "green"),
                    "method": state.get("risk_method", "gradient boosting model"),
                },
            }
        }

    @traced("generate_summary", "Generate AI summary")
    def generate_summary(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"summary": None, "llm_model": None, "llm_error": None}
        try:
            result = generate_json(
                prompt="Project data:\n" + json.dumps(build_llm_input(state["project_state"]), indent=2),
                system=SYSTEM_PROMPT,
                schema=AnalysisSummary,
            )
            return {"summary": result.model_dump(), "llm_model": get_settings().gemini_model, "llm_error": None}
        except LLMError as e:
            logger.warning("LLM summary unavailable: %s", e)
            return {"summary": None, "llm_model": None, "llm_error": str(e)[:300], "_status": "degraded"}

    @traced("make_decision", "Make decision (Decision Agent)")
    def make_decision(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"decision": None}
        try:
            decision = generate_decision(db, project.id)
            return {
                "decision": {
                    "id": decision.id,
                    "issue": decision.issue,
                    "root_cause": decision.root_cause,
                    "recommended_action": decision.recommended_action,
                    "action_type": decision.action_type,
                    "confidence": decision.confidence,
                }
            }
        except Exception as e:
            logger.warning("Decision Agent execution failed: %s", e)
            return {"decision": None, "_status": "degraded"}

    @traced("process_actions", "Process action (Autonomous Action Agent)")
    def process_actions(state: PipelineState) -> dict:
        if not db or not project or not project.id or not state.get("decision"):
            return {"action_item": None}
        try:
            dec_id = state["decision"].get("id")
            dec = db.get(Decision, dec_id) if dec_id else None
            if not dec:
                return {"action_item": None}
            action = create_action_from_decision(db, project.id, dec)
            return {
                "action_item": {
                    "id": action.id,
                    "title": action.title,
                    "status": action.status,
                    "autonomy_level": action.autonomy_level,
                }
            }
        except Exception as e:
            logger.warning("Action Agent execution failed: %s", e)
            return {"action_item": None, "_status": "degraded"}

    @traced("save_snapshot", "Save snapshot")
    def save_snapshot(state: PipelineState) -> dict:
        if not db or not project or not project.id:
            return {"snapshot_id": 0}
        final_state = {
            **state["project_state"],
            "decision": state.get("decision"),
            "action_item": state.get("action_item"),
            "pipeline": {"engine": "langgraph", "steps": state["trace"]},
        }
        snapshot = ProjectSnapshot(
            project_id=project.id,
            state=final_state,
            summary=state.get("summary"),
            llm_model=state.get("llm_model"),
            llm_error=state.get("llm_error"),
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return {"snapshot_id": snapshot.id}

    graph = StateGraph(PipelineState)
    graph.add_node("collect_data", collect_data)
    graph.add_node("build_knowledge_graph", build_knowledge_graph)
    graph.add_node("score_risk", score_risk)
    graph.add_node("analyze_resources", analyze_resources)
    graph.add_node("assemble_state", assemble_state)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("make_decision", make_decision)
    graph.add_node("process_actions", process_actions)
    graph.add_node("save_snapshot", save_snapshot)

    graph.add_edge(START, "collect_data")
    graph.add_edge("collect_data", "build_knowledge_graph")
    graph.add_edge("build_knowledge_graph", "score_risk")
    graph.add_edge("score_risk", "analyze_resources")
    graph.add_edge("analyze_resources", "assemble_state")
    graph.add_edge("assemble_state", "generate_summary")
    graph.add_edge("generate_summary", "make_decision")
    graph.add_edge("make_decision", "process_actions")
    graph.add_edge("process_actions", "save_snapshot")
    graph.add_edge("save_snapshot", END)
    return graph.compile()


def run_pipeline(db: Session, project: Project) -> ProjectSnapshot:
    result = build_pipeline(db, project).invoke({"trace": []})
    return db.get(ProjectSnapshot, result["snapshot_id"])