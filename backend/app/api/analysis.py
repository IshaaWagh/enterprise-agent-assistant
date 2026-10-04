from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.analysis import run_analysis
from app.api.projects import _project_or_404
from app.db.models import ProjectSnapshot
from app.db.session import get_db
from app.api.deps import require_project_access

router = APIRouter(
    prefix="/api/projects", tags=["analysis"], dependencies=[Depends(require_project_access)]
)

def _out(s: ProjectSnapshot) -> dict:
    return {
        "id": s.id,
        "created_at": s.created_at,
        "state": s.state,
        "summary": s.summary,
        "llm_model": s.llm_model,
        "llm_error": s.llm_error,
    }


@router.post("/{project_id}/analyze")
def analyze(project_id: int, db: Session = Depends(get_db)) -> dict:
    """Run the Project Analysis Agent and save the result as a new snapshot."""
    project = _project_or_404(db, project_id)
    return _out(run_analysis(db, project))


@router.get("/{project_id}/analysis/latest")
def latest_analysis(project_id: int, db: Session = Depends(get_db)) -> dict | None:
    """Most recent saved analysis, or null if none has been run yet."""
    _project_or_404(db, project_id)
    snapshot = db.scalar(
        select(ProjectSnapshot)
        .where(ProjectSnapshot.project_id == project_id)
        .order_by(ProjectSnapshot.created_at.desc())
        .limit(1)
    )
    return _out(snapshot) if snapshot else None