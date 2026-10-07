from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AutonomySetting(Base):
    """The trust dial: configures how autonomously the Action Agent can execute."""

    __tablename__ = "autonomy_settings"

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[str] = mapped_column(String(30), default="approve_first")  # suggest_only, approve_first, fully_autonomous
    auto_execute_confidence: Mapped[str] = mapped_column(String(20), default="high")  # only auto-execute if >= this confidence
    notify_slack: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ActionItem(Base):
    """An action queued, approved, executed or suggested by the Autonomous Action Agent."""

    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    decision_id: Mapped[int | None] = mapped_column(ForeignKey("decisions.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(String(50), default="reassign_ticket")  # reassign_ticket, create_jira_issue, send_slack_alert, escalate_blocker
    target_system: Mapped[str] = mapped_column(String(30), default="jira")  # jira, slack, system
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    autonomy_level: Mapped[str] = mapped_column(String(30), default="approve_first")
    status: Mapped[str] = mapped_column(String(30), default="pending_approval")  # pending_approval, approved, rejected, executed, suggested_only
    execution_log: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(String(100))

    decision: Mapped["Decision | None"] = relationship(back_populates="actions")


from app.db.models.decision import Decision  # noqa: E402,F401

