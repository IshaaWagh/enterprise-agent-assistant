"""API endpoints for Resource Management Agent."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require_project_access
from app.api.projects import _project_or_404
from app.db.models import Person, Ticket
from app.db.session import get_db
from app.resources.workload import (
    generate_llm_resource_summary,
    get_team_workload,
    simulate_reassignment,
)

router = APIRouter(prefix="/api/projects", tags=["resources"], dependencies=[Depends(require_project_access)])


class SimulateRequest(BaseModel):
    ticket_key: str
    target_person_id: int | None = None


class ReassignRequest(BaseModel):
    ticket_key: str
    target_person_id: int | None = None


@router.get("/{project_id}/resources")
def get_resources(project_id: int, db: Session = Depends(get_db)) -> dict:
    """Team workload, cross-project allocation, overloaded/underloaded indicators, and AI rebalancing suggestions."""
    _project_or_404(db, project_id)
    workload = get_team_workload(db, project_id)
    ai_summary = generate_llm_resource_summary(workload)
    return {
        "workload": workload,
        "ai_summary": ai_summary,
    }


@router.post("/{project_id}/resources/simulate")
def simulate(project_id: int, req: SimulateRequest, db: Session = Depends(get_db)) -> dict:
    """Interactive What-if simulation: simulate workload impact of reassigning a ticket."""
    _project_or_404(db, project_id)
    result = simulate_reassignment(db, project_id, req.ticket_key, req.target_person_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/{project_id}/resources/reassign")
def reassign(project_id: int, req: ReassignRequest, db: Session = Depends(get_db)) -> dict:
    """Execute reassignment of a ticket to a target team member."""
    _project_or_404(db, project_id)
    ticket = db.query(Ticket).filter(Ticket.key == req.ticket_key, Ticket.project_id == project_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {req.ticket_key} not found")

    old_assignee_id = ticket.assignee_id
    ticket.assignee_id = req.target_person_id
    db.commit()
    db.refresh(ticket)

    target_person = db.query(Person).filter(Person.id == req.target_person_id).first() if req.target_person_id else None

    return {
        "success": True,
        "ticket_key": ticket.key,
        "previous_assignee_id": old_assignee_id,
        "new_assignee": {"id": target_person.id, "name": target_person.name} if target_person else None,
        "message": f"Reassigned {ticket.key} to {target_person.name if target_person else 'Unassigned'}",
    }

