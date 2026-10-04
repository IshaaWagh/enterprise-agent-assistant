from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Commit, Project, PullRequest
from app.db.session import get_db
from app.schemas.project import CommitOut, ProjectOut, PullRequestOut
from datetime import timedelta

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_or_404(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.scalars(select(Project).order_by(Project.id)).all()


@router.get("/{project_id}/commits", response_model=list[CommitOut])
def list_commits(
    project_id: int, limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    stmt = (
        select(Commit)
        .where(Commit.project_id == project_id)
        .order_by(Commit.committed_at.desc())
        .limit(limit)
    )
    return db.scalars(stmt).all()


@router.get("/{project_id}/pull-requests", response_model=list[PullRequestOut])
def list_pull_requests(
    project_id: int, limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    stmt = (
        select(PullRequest)
        .where(PullRequest.project_id == project_id)
        .order_by(PullRequest.created_at.desc())
        .limit(limit)
    )
    return db.scalars(stmt).all()


@router.get("/{project_id}/summary")
def project_summary(project_id: int, db: Session = Depends(get_db)) -> dict:
    """Aggregate GitHub activity stats (the start of the Project Analysis Agent's input)."""
    project = _project_or_404(db, project_id)

    commit_count, last_commit = db.execute(
        select(func.count(Commit.id), func.max(Commit.committed_at)).where(
            Commit.project_id == project_id
        )
    ).one()
    pr_states = dict(
        db.execute(
            select(PullRequest.state, func.count())
            .where(PullRequest.project_id == project_id)
            .group_by(PullRequest.state)
        ).all()
    )
    avg_merge_seconds = db.scalar(
        select(func.avg(func.extract("epoch", PullRequest.merged_at - PullRequest.created_at)))
        .where(PullRequest.project_id == project_id, PullRequest.merged_at.is_not(None))
    )
    top_contributors = db.execute(
        select(Commit.author_login, func.count().label("commits"))
        .where(Commit.project_id == project_id, Commit.author_login.is_not(None))
        .group_by(Commit.author_login)
        .order_by(func.count().desc())
        .limit(5)
    ).all()

    return {
        "project": project.name,
        "commits": commit_count,
        "last_commit_at": last_commit,
        "pull_requests": pr_states,
        "avg_hours_to_merge": round(float(avg_merge_seconds) / 3600, 1)
        if avg_merge_seconds is not None
        else None,
        "top_contributors": [{"login": login, "commits": n} for login, n in top_contributors],
    }

@router.get("/{project_id}/activity")
def commit_activity(
    project_id: int, weeks: int = Query(12, ge=1, le=104), db: Session = Depends(get_db)
) -> list[dict]:
    """Commits per week for the last N weeks. Empty weeks are filled with 0."""
    _project_or_404(db, project_id)
    week = func.date_trunc("week", Commit.committed_at).label("week")
    rows = db.execute(
        select(week, func.count().label("commits"))
        .where(Commit.project_id == project_id)
        .group_by(week)
        .order_by(week)
    ).all()
    if not rows:
        return []

    counts = {w.date(): n for w, n in rows}
    current, last = min(counts), max(counts)
    series = []
    while current <= last:
        series.append({"week": current.isoformat(), "commits": counts.get(current, 0)})
        current += timedelta(days=7)
    return series[-weeks:]