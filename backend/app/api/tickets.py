from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.projects import _project_or_404
from app.db.models import Ticket, TicketLink
from app.db.session import get_db
from app.schemas.ticket import TicketOut

router = APIRouter(prefix="/api/projects", tags=["tickets"])


def _load(db: Session, project_id: int) -> list[TicketOut]:
    tickets = db.scalars(
        select(Ticket)
        .where(Ticket.project_id == project_id)
        .options(selectinload(Ticket.assignee))
        .order_by(Ticket.id)
    ).all()
    by_id = {t.id: t for t in tickets}
    blocked_by: dict[str, list[str]] = {t.key: [] for t in tickets}
    blocks: dict[str, list[str]] = {t.key: [] for t in tickets}
    links = db.scalars(select(TicketLink).where(TicketLink.source_ticket_id.in_(by_id))).all()
    for link in links:
        blocker, blocked = by_id.get(link.source_ticket_id), by_id.get(link.target_ticket_id)
        if blocker and blocked:
            blocks[blocker.key].append(blocked.key)
            blocked_by[blocked.key].append(blocker.key)

    today = date.today()
    return [
        TicketOut(
            key=t.key,
            title=t.title,
            ticket_type=t.ticket_type,
            status=t.status,
            status_category=t.status_category,
            priority=t.priority,
            assignee=t.assignee.name if t.assignee else None,
            story_points=t.story_points,
            due_date=t.due_date,
            is_overdue=bool(t.due_date and t.due_date < today and t.status_category != "done"),
            blocked_by=blocked_by[t.key],
            blocks=blocks[t.key],
        )
        for t in tickets
    ]


@router.get("/{project_id}/tickets", response_model=list[TicketOut])
def list_tickets(
    project_id: int,
    status_category: str | None = Query(None, pattern="^(new|indeterminate|done)$"),
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    tickets = _load(db, project_id)
    if status_category:
        tickets = [t for t in tickets if t.status_category == status_category]
    return tickets


@router.get("/{project_id}/tickets/summary")
def tickets_summary(project_id: int, db: Session = Depends(get_db)) -> dict:
    _project_or_404(db, project_id)
    tickets = _load(db, project_id)
    by_key = {t.key: t for t in tickets}
    open_tickets = [t for t in tickets if t.status_category != "done"]
    # "Blocked" = still open AND at least one of its blockers is still open.
    blocked = [
        t for t in open_tickets
        if any(by_key[k].status_category != "done" for k in t.blocked_by if k in by_key)
    ]
    return {
        "total": len(tickets),
        "to_do": sum(t.status_category == "new" for t in tickets),
        "in_progress": sum(t.status_category == "indeterminate" for t in tickets),
        "done": sum(t.status_category == "done" for t in tickets),
        "overdue": sum(t.is_overdue for t in tickets),
        "blocked": len(blocked),
        "unassigned": sum(t.assignee is None for t in open_tickets),
    }