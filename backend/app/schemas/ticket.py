from datetime import date

from pydantic import BaseModel


class TicketOut(BaseModel):
    key: str
    title: str
    ticket_type: str
    status: str
    status_category: str | None
    priority: str
    assignee: str | None
    story_points: int | None
    due_date: date | None
    is_overdue: bool
    blocked_by: list[str]  # keys of tickets blocking this one
    blocks: list[str]  # keys of tickets this one blocks