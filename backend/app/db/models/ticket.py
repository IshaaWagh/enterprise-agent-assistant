from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Ticket(Base):
    """A Jira ticket. Core input for risk features, workload, and the knowledge graph."""

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(30), unique=True, index=True)  # e.g. "SHOP-42"
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    ticket_type: Mapped[str] = mapped_column(String(30), default="Task")  # Story/Bug/Task
    status: Mapped[str] = mapped_column(String(30), default="To Do", index=True)
    status_category: Mapped[str | None] = mapped_column(String(20), index=True)  # new|indeterminate|done
    priority: Mapped[str] = mapped_column(String(20), default="Medium")
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    story_points: Mapped[int | None] = mapped_column()
    sprint: Mapped[str | None] = mapped_column(String(100))
    reopen_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped["Project"] = relationship(back_populates="tickets")
    assignee: Mapped["Person | None"] = relationship(back_populates="tickets")


class TicketLink(Base):
    """A directed relation between tickets, e.g. A 'blocks' B. Used for root-cause tracing."""

    __tablename__ = "ticket_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    target_ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    link_type: Mapped[str] = mapped_column(String(30), default="blocks")


from app.db.models.person import Person  # noqa: E402,F401
from app.db.models.project import Project  # noqa: E402,F401