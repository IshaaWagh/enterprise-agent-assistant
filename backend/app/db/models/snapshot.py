from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectSnapshot(Base):
    """Saved output of the Project Analysis Agent. Downstream agents read the latest one."""

    __tablename__ = "project_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    state: Mapped[dict] = mapped_column(JSON)  # computed stats, graph analysis, risk
    summary: Mapped[dict | None] = mapped_column(JSON)  # LLM briefing (None if LLM failed)
    llm_model: Mapped[str | None] = mapped_column(String(100))
    llm_error: Mapped[str | None] = mapped_column(Text)