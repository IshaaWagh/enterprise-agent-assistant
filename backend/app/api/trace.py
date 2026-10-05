from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from app.api.deps import require_project_access
from app.api.projects import _project_or_404
from app.db.session import get_db
from app.graph.builder import build_graph
from app.graph.trace import TicketNotFound, trace_root_cause

router = APIRouter(
    prefix="/api/projects", tags=["trace"], dependencies=[Depends(require_project_access)]
)


@router.get("/{project_id}/trace/{ticket_key}")
def trace_ticket(
    project_id: int,
    ticket_key: str = Path(pattern=r"^[A-Z][A-Z0-9_]*-\d+$"),
    db: Session = Depends(get_db),
) -> dict:
    """Root-cause trace for a ticket, computed from the project knowledge graph."""
    _project_or_404(db, project_id)
    G = build_graph(db, project_id)
    try:
        return trace_root_cause(G, ticket_key, date.today())
    except TicketNotFound:
        raise HTTPException(status_code=404, detail="Ticket not found")