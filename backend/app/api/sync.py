import logging

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from github.GithubException import GithubException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.ingestion.github_ingest import IngestionConfigError, sync_github
from app.ingestion.jira_client import JiraConfigError
from app.ingestion.jira_ingest import sync_jira

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/github")
def sync_github_endpoint(
    max_commits: int = Query(300, ge=1, le=1000),
    max_prs: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    """Pull the configured repo's commits and PRs from GitHub into the database."""
    try:
        return sync_github(db, max_commits=max_commits, max_prs=max_prs)
    except IngestionConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GithubException:
        logger.exception("GitHub sync failed")
        raise HTTPException(status_code=502, detail="GitHub request failed")


@router.post("/jira")
def sync_jira_endpoint(db: Session = Depends(get_db)) -> dict:
    """Pull the configured Jira project's tickets and dependency links into the database."""
    try:
        return sync_jira(db)
    except (JiraConfigError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except requests.RequestException:
        logger.exception("Jira sync failed")
        raise HTTPException(status_code=502, detail="Jira request failed")