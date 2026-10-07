from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_project_access
from app.api.projects import _project_or_404
from app.db.session import get_db
from app.graph.builder import build_graph
from app.risk.model import load_artifact, score_tickets

from app.db.models import PredictionLog

router = APIRouter(prefix="/api/projects", tags=["risk"], dependencies=[Depends(require_project_access)])


@router.get("/{project_id}/risk")
def get_risk(project_id: int, db: Session = Depends(get_db)) -> dict:
    """ML lateness probability for every open ticket, with the top contributing factors."""
    _project_or_404(db, project_id)
    art = load_artifact()
    if art is None:
        raise HTTPException(status_code=503, detail="Risk model not trained. Run: python -m scripts.train_risk_model")
    tickets = score_tickets(build_graph(db, project_id), date.today())
    
    logged_count = db.query(PredictionLog).filter(PredictionLog.project_id == project_id).count()
    recent_logs = (
        db.query(PredictionLog)
        .filter(PredictionLog.project_id == project_id)
        .order_by(PredictionLog.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "model": {"version": art["version"], "data_source": art["data_source"], "metrics": art["metrics"]},
        "tickets": tickets,
        "calibration": {
            "logged_predictions": logged_count,
            "brier_score": art["metrics"].get("brier"),
            "base_rate_brier": art["metrics"].get("brier_always_base_rate"),
            "roc_auc": art["metrics"].get("roc_auc"),
            "accuracy": art["metrics"].get("accuracy"),
        },
        "recent_logs": [
            {
                "id": log.id,
                "ticket_key": log.ticket_key,
                "probability": log.probability,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "outcome_late": log.outcome_late,
            }
            for log in recent_logs
        ],
    }