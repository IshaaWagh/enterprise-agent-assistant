from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PredictionLog(Base):
    """Every risk prediction, so accuracy can be measured later against what really happened."""

    __tablename__ = "prediction_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    ticket_key: Mapped[str] = mapped_column(String(50), index=True)
    probability: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(40))
    features: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    outcome_late: Mapped[bool | None] = mapped_column(default=None)  # filled in when the ticket closes
    outcome_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)