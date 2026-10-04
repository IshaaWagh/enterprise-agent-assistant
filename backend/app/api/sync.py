import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from github.GithubException import GithubException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.ingestion.github_ingest import IngestionConfigError, sync_github

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