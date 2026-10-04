"""LangGraph pipeline for the Project Analysis Agent.

  collect_data -> build_knowledge_graph -> score_risk -> assemble_state
               -> generate_summary -> save_snapshot

The four remaining agents (Risk Prediction, Resource Management, Decision, Autonomous Action)
will be added as further nodes in this graph.
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

from app.agents.analysis import (
    SYSTEM_PROMPT, AnalysisSummary, baseline_health, baseline_risk, build_llm_input,
)
from app.api.projects import project_summary  # NOTE: reuse; moves to a services/ layer later
from app.api.tickets import _load, tickets_summary
from app.core.config import get_settings
from app.db.models import Project, ProjectSnapshot
from app.graph.builder import analyze_dependencies, build_graph, graph_stats
from app.llm.gemini import LLMError, generate_json

logger = logging.getLogger(__name__)


class PipelineState(TypedDict, total=False):
    """Data flowing through the graph. Each node returns only the keys it changes."""

    github: dict
    tickets: list
    ticket_stats: dict
    graph_info: dict
    at_risk: list
    health: str
    project_state: dict
    summary: dict | None
    llm_model: str | None
    llm_error: str | None
    snapshot_id: int
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
        G = build_graph(db, project.id)
        return {"graph_info": {**graph_stats(G), **analyze_dependencies(G)}}

    @traced("score_risk", "Score risk (baseline)")
    def score_risk(state: PipelineState) -> dict:
        at_risk = baseline_risk(state["tickets"], date.today())
        return {"at_risk": at_risk, "health": baseline_health(at_risk, state["ticket_stats"])}

    @traced("assemble_state", "Assemble project state")
    def assemble_state(state: PipelineState) -> dict:
        return {
            "project_state": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "project": {
                    "id": project.id, "name": project.name,
                    "github_repo": project.github_repo, "jira_project_key": project.jira_project_key,
                },
                "github": state["github"],
                "tickets": state["ticket_stats"],
                "graph": state["graph_info"],
                "at_risk_tickets": state["at_risk"],
                "health": {
                    "status": state["health"],
                    "method": "baseline heuristic (replaced by the ML risk model later)",
                },
            }
        }

    @traced("generate_summary", "Generate AI summary")
    def generate_summary(state: PipelineState) -> dict:
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

    @traced("save_snapshot", "Save snapshot")
    def save_snapshot(state: PipelineState) -> dict:
        final_state = {
            **state["project_state"],
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
    graph.add_node("assemble_state", assemble_state)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("save_snapshot", save_snapshot)

    graph.add_edge(START, "collect_data")
    graph.add_edge("collect_data", "build_knowledge_graph")
    graph.add_edge("build_knowledge_graph", "score_risk")
    graph.add_edge("score_risk", "assemble_state")
    graph.add_edge("assemble_state", "generate_summary")
    graph.add_edge("generate_summary", "save_snapshot")
    graph.add_edge("save_snapshot", END)
    return graph.compile()


def run_pipeline(db: Session, project: Project) -> ProjectSnapshot:
    result = build_pipeline(db, project).invoke({"trace": []})
    return db.get(ProjectSnapshot, result["snapshot_id"])