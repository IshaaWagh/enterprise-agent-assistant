"""Thin Jira Cloud REST client for the endpoints the `jira` library doesn't cover well.

Search uses /rest/api/2/search/jql (the old /search endpoint was removed from Jira Cloud).
"""
from collections.abc import Iterator

import requests

from app.core.config import get_settings

STORY_POINT_FIELD_NAMES = ("story point estimate", "story points", "story point")


class JiraConfigError(Exception):
    """Raised when Jira settings are missing from .env."""


def _session() -> tuple[requests.Session, str]:
    s = get_settings()
    if not (s.jira_base_url and s.jira_email and s.jira_api_token and s.jira_project_key):
        raise JiraConfigError("JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN and JIRA_PROJECT_KEY must be set")
    session = requests.Session()
    session.auth = (s.jira_email, s.jira_api_token.get_secret_value())
    session.headers.update({"Accept": "application/json"})
    return session, s.jira_base_url.rstrip("/")


def search_issues(jql: str, fields: list[str], page_size: int = 100) -> Iterator[dict]:
    """Yield every issue matching the JQL, following nextPageToken pagination.

    NOTE: the endpoint returns only issue ids unless `fields` is given explicitly.
    """
    session, base = _session()
    token: str | None = None
    while True:
        params = {"jql": jql, "fields": ",".join(fields), "maxResults": page_size}
        if token:
            params["nextPageToken"] = token
        response = session.get(f"{base}/rest/api/2/search/jql", params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        yield from data.get("issues", [])
        token = data.get("nextPageToken")
        if not token or data.get("isLast"):
            break


def find_field_id(names: tuple[str, ...]) -> str | None:
    """Find a custom field id (e.g. 'customfield_10016') by display name."""
    session, base = _session()
    response = session.get(f"{base}/rest/api/2/field", timeout=30)
    response.raise_for_status()
    wanted = {n.lower() for n in names}
    for field in response.json():
        if field.get("name", "").lower() in wanted:
            return field["id"]
    return None