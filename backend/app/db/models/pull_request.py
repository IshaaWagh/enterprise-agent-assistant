from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PullRequest(Base):
    """A GitHub pull request. Time-to-merge and review load feed the risk model."""

    __tablename__ = "pull_requests"
    __table_args__ = (UniqueConstraint("project_id", "number", name="uq_pr_project_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(500))
    state: Mapped[str] = mapped_column(String(20), index=True)  # open / closed / merged
    author_login: Mapped[str | None] = mapped_column(String(100), index=True)
    person_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    additions: Mapped[int] = mapped_column(default=0)
    deletions: Mapped[int] = mapped_column(default=0)
    changed_files: Mapped[int] = mapped_column(default=0)
    review_comments: Mapped[int] = mapped_column(default=0)
    comments: Mapped[int] = mapped_column(default=0)
    ticket_key: Mapped[str | None] = mapped_column(String(30), index=True)