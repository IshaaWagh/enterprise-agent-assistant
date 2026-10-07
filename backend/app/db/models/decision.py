from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Decision(Base):
    """Output of the Decision Agent. Synthesizes Analysis, Risk, Resources, and Graph into one recommendation."""

    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    issue: Mapped[str] = mapped_column(String(500))
    root_cause: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(50), default="reassign")  # reassign, unblock, reprioritize, alert
    target_ticket_key: Mapped[str | None] = mapped_column(String(50))
    target_person_name: Mapped[str | None] = mapped_column(String(200))
    reasoning: Mapped[str] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(String(20))  # high, medium, low
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="proposed")  # proposed, sent_to_action_agent, dismissed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    actions: Mapped[list["ActionItem"]] = relationship(back_populates="decision", cascade="all, delete-orphan")


from app.db.models.action import ActionItem  # noqa: E402,F401

