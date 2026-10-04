from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Commit(Base):
    """A Git commit. Used for activity/velocity stats and knowledge-graph edges."""

    __tablename__ = "commits"
    __table_args__ = (UniqueConstraint("project_id", "sha", name="uq_commit_project_sha"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    sha: Mapped[str] = mapped_column(String(40))
    author_login: Mapped[str | None] = mapped_column(String(100), index=True)
    author_name: Mapped[str | None] = mapped_column(String(200))
    author_email: Mapped[str | None] = mapped_column(String(320))
    person_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    message: Mapped[str] = mapped_column(Text)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    additions: Mapped[int] = mapped_column(default=0)
    deletions: Mapped[int] = mapped_column(default=0)
    files_changed: Mapped[int] = mapped_column(default=0)
    ticket_key: Mapped[str | None] = mapped_column(String(30), index=True)