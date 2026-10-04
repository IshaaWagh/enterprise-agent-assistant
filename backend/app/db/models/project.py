from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Project(Base):
    """A software project tracked by the assistant (one GitHub repo + one Jira project)."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    github_repo: Mapped[str | None] = mapped_column(String(200))  # e.g. "owner/repo"
    jira_project_key: Mapped[str | None] = mapped_column(String(20))  # e.g. "SHOP"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    tickets: Mapped[list["Ticket"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectMember(Base):
    """Links a person to a project (many-to-many). Enables cross-project workload later."""

    __tablename__ = "project_members"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), primary_key=True
    )

    project: Mapped["Project"] = relationship(back_populates="members")
    person: Mapped["Person"] = relationship(back_populates="memberships")


from app.db.models.person import Person  # noqa: E402,F401
from app.db.models.ticket import Ticket  # noqa: E402,F401