"""Resource Management Agent: workload analysis, cross-project allocation, and rebalancing recommendations."""
import json
import logging
from collections import defaultdict
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Person, Project, ProjectMember, Ticket
from app.llm.gemini import LLMError, generate_json

logger = logging.getLogger(__name__)

OVERLOAD_THRESHOLD = 1.3
UNDERLOAD_THRESHOLD = 0.7


class ResourceLLMRecommendation(BaseModel):
    summary: str = Field(description="High-level evaluation of team capacity and workload balance")
    bottlenecks: list[str] = Field(description="Identified capacity bottlenecks or overloaded individuals")
    rebalancing_plan: list[str] = Field(description="Concrete suggestions for rebalancing tickets or cross-project staffing")


def get_team_workload(db: Session, project_id: int) -> dict[str, Any]:
    """Calculate per-person workload for a project and across all projects they are on."""
    # Find all project members or assignees
    memberships = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    member_person_ids = {m.person_id for m in memberships}

    # Also include any person currently assigned a ticket in this project
    ticket_assignee_ids = {
        t.assignee_id
        for t in db.query(Ticket.assignee_id)
        .filter(Ticket.project_id == project_id, Ticket.assignee_id.isnot(None))
        .distinct()
    }
    all_person_ids = member_person_ids | ticket_assignee_ids

    # If project memberships are mapped, use them; otherwise pull active team roster (excluding 'unknown')
    if memberships:
        all_people = db.query(Person).filter(Person.id.in_(all_person_ids)).all()
    else:
        all_people = db.query(Person).filter(Person.name.isnot(None), Person.name != "unknown").all()

    # Query all tickets in this project
    project_tickets = (
        db.query(Ticket)
        .filter(Ticket.project_id == project_id)
        .all()
    )

    unassigned_tickets = [
        {
            "id": t.id,
            "key": t.key,
            "title": t.title,
            "priority": t.priority,
            "status": t.status,
            "story_points": t.story_points or 1,
        }
        for t in project_tickets
        if t.assignee_id is None and t.status_category != "done"
    ]

    # Pre-fetch all open tickets across all projects for cross-project arbitrage
    all_open_tickets = (
        db.query(Ticket)
        .filter(Ticket.status_category != "done", Ticket.assignee_id.isnot(None))
        .all()
    )
    cross_project_tickets_by_person = defaultdict(list)
    for t in all_open_tickets:
        cross_project_tickets_by_person[t.assignee_id].append(t)

    # Pre-fetch project names
    all_projects = {p.id: p.name for p in db.query(Project).all()}

    # Compute member metrics
    member_data = []
    total_project_open_tickets = 0
    total_project_points = 0

    for person in all_people:
        ptickets = [t for t in project_tickets if t.assignee_id == person.id]
        open_ptickets = [t for t in ptickets if t.status_category != "done"]
        done_ptickets = [t for t in ptickets if t.status_category == "done"]
        in_prog_ptickets = [t for t in open_ptickets if t.status.lower() in ("in progress", "doing", "active")]
        
        project_points = sum((t.story_points or 1) for t in open_ptickets)
        total_project_open_tickets += len(open_ptickets)
        total_project_points += project_points

        # Cross project calculation
        cross_tickets = cross_project_tickets_by_person.get(person.id, [])
        cross_proj_ids = list({t.project_id for t in cross_tickets})
        cross_proj_names = [all_projects.get(pid, f"Project {pid}") for pid in cross_proj_ids if pid != project_id]
        cross_open_count = len(cross_tickets)
        cross_points = sum((t.story_points or 1) for t in cross_tickets)

        member_data.append({
            "id": person.id,
            "name": person.name,
            "email": person.email,
            "role": person.role or "Team Contributor",
            "skills": person.skills or [],
            "open_tickets_count": len(open_ptickets),
            "done_tickets_count": len(done_ptickets),
            "in_progress_count": len(in_prog_ptickets),
            "story_points": project_points,
            "open_tickets": [
                {
                    "id": t.id,
                    "key": t.key,
                    "title": t.title,
                    "priority": t.priority,
                    "status": t.status,
                    "story_points": t.story_points or 1,
                }
                for t in open_ptickets
            ],
            "cross_project": {
                "total_open_tickets": cross_open_count,
                "total_story_points": cross_points,
                "other_projects": cross_proj_names,
                "project_count": len(cross_proj_ids) if cross_proj_ids else 1,
            },
        })

    num_people = max(len(member_data), 1)
    avg_tickets = total_project_open_tickets / num_people
    avg_points = total_project_points / num_people

    # Calculate load ratios and flags
    for m in member_data:
        m["load_ratio"] = round(m["open_tickets_count"] / max(avg_tickets, 0.5), 2)
        if m["load_ratio"] >= OVERLOAD_THRESHOLD:
            m["status"] = "overloaded"
        elif m["load_ratio"] <= UNDERLOAD_THRESHOLD:
            m["status"] = "underloaded"
        else:
            m["status"] = "balanced"

    # Identify suggestions for reassignment
    suggestions = compute_reassignment_suggestions(member_data, unassigned_tickets, avg_tickets)

    return {
        "team_size": len(member_data),
        "total_open_tickets": total_project_open_tickets,
        "total_story_points": total_project_points,
        "average_tickets_per_person": round(avg_tickets, 1),
        "average_points_per_person": round(avg_points, 1),
        "overloaded_count": sum(1 for m in member_data if m["status"] == "overloaded"),
        "underloaded_count": sum(1 for m in member_data if m["status"] == "underloaded"),
        "balanced_count": sum(1 for m in member_data if m["status"] == "balanced"),
        "members": sorted(member_data, key=lambda m: -m["open_tickets_count"]),
        "unassigned_tickets": unassigned_tickets,
        "suggestions": suggestions,
    }


def compute_reassignment_suggestions(
    members: list[dict], unassigned: list[dict], avg_tickets: float
) -> list[dict]:
    """Suggest rebalancing from overloaded -> underloaded members, and assigning unassigned tickets."""
    suggestions = []
    overloaded = [m for m in members if m["status"] == "overloaded"]
    underloaded = sorted([m for m in members if m["status"] == "underloaded"], key=lambda m: m["open_tickets_count"])

    # 1. Reassignments from overloaded to underloaded
    for o in overloaded:
        if not underloaded:
            break
        # Take candidate tickets from overloaded person
        movable = sorted(o["open_tickets"], key=lambda t: t.get("story_points", 1))
        for ticket in movable[:2]:
            target = underloaded[0]
            curr_o_ratio = o["load_ratio"]
            new_o_ratio = round((o["open_tickets_count"] - 1) / max(avg_tickets, 0.5), 2)
            new_t_ratio = round((target["open_tickets_count"] + 1) / max(avg_tickets, 0.5), 2)

            suggestions.append({
                "type": "rebalance",
                "ticket_key": ticket["key"],
                "ticket_title": ticket["title"],
                "priority": ticket["priority"],
                "from_person": {"id": o["id"], "name": o["name"], "role": o["role"]},
                "to_person": {"id": target["id"], "name": target["name"], "role": target["role"]},
                "rationale": (
                    f"{o['name']} is overloaded ({curr_o_ratio}x team average). Reassigning {ticket['key']} "
                    f"to {target['name']} brings {o['name']} down to {new_o_ratio}x and utilizes {target['name']}'s available capacity."
                ),
                "impact": f"{o['name']} ({curr_o_ratio}x -> {new_o_ratio}x) | {target['name']} ({target['load_ratio']}x -> {new_t_ratio}x)",
            })

    # 2. Assign unassigned tickets to underloaded members
    for u in unassigned[:3]:
        if underloaded:
            best_target = underloaded[0]
            suggestions.append({
                "type": "unassigned",
                "ticket_key": u["key"],
                "ticket_title": u["title"],
                "priority": u["priority"],
                "from_person": None,
                "to_person": {"id": best_target["id"], "name": best_target["name"], "role": best_target["role"]},
                "rationale": f"Unassigned ticket {u['key']} should be picked up by {best_target['name']} who currently has spare capacity.",
                "impact": f"Assign to {best_target['name']} (spare capacity)",
            })

    return suggestions


def simulate_reassignment(
    db: Session, project_id: int, ticket_key: str, target_person_id: int | None
) -> dict:
    """What-if simulation: simulate moving a ticket without mutating the database."""
    base = get_team_workload(db, project_id)
    ticket = db.query(Ticket).filter(Ticket.key == ticket_key, Ticket.project_id == project_id).first()
    if not ticket:
        return {"error": f"Ticket {ticket_key} not found"}

    target_person = db.query(Person).filter(Person.id == target_person_id).first() if target_person_id else None
    source_person_id = ticket.assignee_id

    avg_tickets = base["average_tickets_per_person"]

    simulated_members = []
    for m in base["members"]:
        open_count = m["open_tickets_count"]
        if m["id"] == source_person_id:
            open_count = max(0, open_count - 1)
        elif m["id"] == target_person_id:
            open_count += 1
        
        sim_ratio = round(open_count / max(avg_tickets, 0.5), 2)
        sim_status = "overloaded" if sim_ratio >= OVERLOAD_THRESHOLD else "underloaded" if sim_ratio <= UNDERLOAD_THRESHOLD else "balanced"
        simulated_members.append({
            "id": m["id"],
            "name": m["name"],
            "before_count": m["open_tickets_count"],
            "after_count": open_count,
            "before_ratio": m["load_ratio"],
            "after_ratio": sim_ratio,
            "before_status": m["status"],
            "after_status": sim_status,
        })

    return {
        "ticket_key": ticket_key,
        "from_person_id": source_person_id,
        "to_person": {"id": target_person.id, "name": target_person.name} if target_person else None,
        "simulated_members": simulated_members,
        "summary": (
            f"Moving {ticket_key} to {target_person.name if target_person else 'Unassigned'} "
            f"recalculates workloads across all {len(simulated_members)} team members."
        ),
    }


def generate_llm_resource_summary(workload_data: dict) -> dict:
    """Generate natural-language resource management briefing using Gemini."""
    system_prompt = (
        "You are an expert technical program and resource manager. "
        "Analyze team workloads, detect overload risks, and propose balanced workload distribution. "
        "Be concise, clear, and action-oriented."
    )

    clean_input = {
        "team_size": workload_data["team_size"],
        "total_open_tickets": workload_data["total_open_tickets"],
        "average_tickets_per_person": workload_data["average_tickets_per_person"],
        "overloaded_count": workload_data["overloaded_count"],
        "underloaded_count": workload_data["underloaded_count"],
        "members": [
            {
                "name": m["name"],
                "role": m["role"],
                "open_tickets": m["open_tickets_count"],
                "load_ratio": m["load_ratio"],
                "status": m["status"],
                "cross_project_tickets": m["cross_project"]["total_open_tickets"],
            }
            for m in workload_data["members"]
        ],
        "suggestions": [s["rationale"] for s in workload_data["suggestions"][:3]],
    }

    try:
        res = generate_json(
            prompt="Team workload data:\n" + json.dumps(clean_input, indent=2),
            system=system_prompt,
            schema=ResourceLLMRecommendation,
        )
        return {
            "summary": res.summary,
            "bottlenecks": res.bottlenecks,
            "rebalancing_plan": res.rebalancing_plan,
            "model": get_settings().gemini_model,
        }
    except LLMError as e:
        logger.warning("Resource LLM briefing unavailable: %s", e)
        # Rule-based fallback
        overloaded_names = [m["name"] for m in workload_data["members"] if m["status"] == "overloaded"]
        underloaded_names = [m["name"] for m in workload_data["members"] if m["status"] == "underloaded"]
        return {
            "summary": (
                f"Team of {workload_data['team_size']} has {workload_data['total_open_tickets']} open tickets. "
                f"{len(overloaded_names)} overloaded and {len(underloaded_names)} with spare capacity."
            ),
            "bottlenecks": [f"{name} is carrying significantly more than team average." for name in overloaded_names] or ["Workload is reasonably distributed."],
            "rebalancing_plan": [s["rationale"] for s in workload_data["suggestions"][:2]] or ["Maintain current ticket allocations."],
            "model": None,
        }
