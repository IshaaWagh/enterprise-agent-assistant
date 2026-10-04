import logging

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api import projects, sync, tickets
from app.db.session import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Enterprise Multi-Agent AI Assistant",
    version="0.1.0",
    description="Backend API for the multi-agent project-management assistant.",
)

app.include_router(sync.router)
app.include_router(projects.router)
app.include_router(tickets.router)


@app.get("/api/health", tags=["system"])
def health_check() -> dict:
    """Liveness check: is the API process up?"""
    return {"status": "ok", "service": "backend", "version": app.version}


@app.get("/api/health/db", tags=["system"])
def database_health_check(db: Session = Depends(get_db)) -> dict:
    """Readiness check: can the API reach PostgreSQL?"""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "database": "connected"}