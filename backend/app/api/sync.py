import logging

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from github.GithubException import GithubException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.models import Project, ProjectAccess, User
from app.db.session import get_db
from app.ingestion.github_ingest import IngestionConfigError, sync_github
from app.ingestion.jira_client import JiraConfigError
from app.ingestion.jira_ingest import sync_jira

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])


def _configured_project(db: Session) -> Project | None:
    s = get_settings()
    project = None
    if s.github_repo:
        project = db.scalar(select(Project).where(Project.github_repo == s.github_repo))
    if project is None and s.jira_project_key:
        project = db.scalar(select(Project).where(Project.jira_project_key == s.jira_project_key))
    return project


def _guard(db: Session, user: User) -> None:
    """If the configured project already exists, the caller must have access to it."""
    project = _configured_project(db)
    if project is not None and db.get(ProjectAccess, (user.id, project.id)) is None:
        raise HTTPException(status_code=404, detail="Project not found")


def _claim_if_unowned(db: Session, user: User, project_id: int) -> None:
    """A project created by a sync belongs to the person who created it."""
    has_owner = db.scalar(select(ProjectAccess.user_id).where(ProjectAccess.project_id == project_id).limit(1))
    if has_owner is None:
        db.add(ProjectAccess(user_id=user.id, project_id=project_id, role="owner"))
        db.commit()


@router.post("/github")
def sync_github_endpoint(
    max_commits: int = Query(300, ge=1, le=1000),
    max_prs: int = Query(200, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Pull the configured repo's commits and PRs from GitHub into the database."""
    _guard(db, user)
    try:
        result = sync_github(db, max_commits=max_commits, max_prs=max_prs)
    except IngestionConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GithubException:
        logger.exception("GitHub sync failed")
        raise HTTPException(status_code=502, detail="GitHub request failed")
    _claim_if_unowned(db, user, result["project_id"])
    return result


@router.post("/jira")
def sync_jira_endpoint(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Pull the configured Jira project's tickets and dependency links into the database."""
    _guard(db, user)
    try:
        result = sync_jira(db)
    except (JiraConfigError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except requests.RequestException:
        logger.exception("Jira sync failed")
        raise HTTPException(status_code=502, detail="Jira request failed")
    _claim_if_unowned(db, user, result["project_id"])
    return result