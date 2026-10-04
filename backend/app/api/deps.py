"""Reusable FastAPI dependencies for authentication and authorization."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.models import ProjectAccess, User
from app.db.session import get_db


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Authenticate from the httpOnly session cookie. 401 if missing, invalid, or disabled."""
    token = request.cookies.get(get_settings().cookie_name)
    user_id = decode_access_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_project_access(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Router-level guard: any route with a {project_id} path parameter is checked automatically.

    Returns 404 (not 403) when the user has no access, so project ids can't be probed.
    Routes without a project_id (e.g. the project list) only require authentication.
    """
    raw = request.path_params.get("project_id")
    if raw is None:
        return
    try:
        project_id = int(raw)
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found")
    if db.get(ProjectAccess, (user.id, project_id)) is None:
        raise HTTPException(status_code=404, detail="Project not found")