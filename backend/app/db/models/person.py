from datetime import datetime

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Person(Base):
    """A team member. Links GitHub commit authors and Jira assignees to one identity."""

    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    role: Mapped[str | None] = mapped_column(String(100))  # e.g. "Backend Developer"
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)  # e.g. ["python", "sql"]
    github_login: Mapped[str | None] = mapped_column(String(100), index=True)
    jira_account_id: Mapped[str | None] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="assignee")
    memberships: Mapped[list["ProjectMember"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )


from app.db.models.project import ProjectMember  # noqa: E402,F401
from app.db.models.ticket import Ticket  # noqa: E402,F401