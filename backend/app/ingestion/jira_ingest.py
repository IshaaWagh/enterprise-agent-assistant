"""Pull Jira issues and their 'blocks' links into PostgreSQL (idempotent)."""
import logging
import re
from datetime import date, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Person, Project, Ticket, TicketLink
from app.ingestion.jira_client import STORY_POINT_FIELD_NAMES, find_field_id, search_issues

logger = logging.getLogger(__name__)

BASE_FIELDS = [
    "summary", "description", "issuetype", "status", "priority", "assignee",
    "created", "updated", "duedate", "resolutiondate", "issuelinks",
]


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return datetime.fromisoformat(value)


def _get_project(db: Session) -> Project:
    s = get_settings()
    project = None
    if s.github_repo:
        project = db.scalar(select(Project).where(Project.github_repo == s.github_repo))
    if project is None:
        project = db.scalar(select(Project).where(Project.jira_project_key == s.jira_project_key))
    if project is None:
        project = Project(name=s.jira_project_key, jira_project_key=s.jira_project_key)
        db.add(project)
    if project.jira_project_key != s.jira_project_key:
        project.jira_project_key = s.jira_project_key
    db.flush()
    return project


def _resolve_person(db: Session, cache: dict[str, Person], assignee: dict | None) -> Person | None:
    if not assignee:
        return None
    account_id = assignee["accountId"]
    if account_id in cache:
        return cache[account_id]
    name = assignee.get("displayName") or account_id
    person = db.scalar(select(Person).where(Person.jira_account_id == account_id))
    if person is None:
        # Same human may already exist from GitHub: match by name, then attach the Jira id.
        person = db.scalar(select(Person).where(func.lower(Person.name) == name.lower()))
        if person is not None:
            person.jira_account_id = account_id
    if person is None:
        person = Person(name=name, email=assignee.get("emailAddress"), jira_account_id=account_id)
        db.add(person)
    db.flush()
    cache[account_id] = person
    return person


def sync_jira(db: Session) -> dict:
    s = get_settings()
    key = s.jira_project_key
    if not key or not re.fullmatch(r"[A-Z][A-Z0-9_]+", key):
        raise ValueError("JIRA_PROJECT_KEY must look like 'AGT' (uppercase letters/digits)")

    story_point_field = find_field_id(STORY_POINT_FIELD_NAMES)
    fields = BASE_FIELDS + ([story_point_field] if story_point_field else [])
    issues = list(search_issues(f'project = "{key}" ORDER BY created ASC', fields))

    project = _get_project(db)
    people: dict[str, Person] = {}
    existing = {t.key: t for t in db.scalars(select(Ticket).where(Ticket.project_id == project.id))}
    new_count = updated_count = 0

    for issue in issues:
        f = issue["fields"]
        person = _resolve_person(db, people, f.get("assignee"))
        points = f.get(story_point_field) if story_point_field else None
        status = f.get("status") or {}
        values = dict(
            title=f.get("summary") or "(no title)",
            description=f.get("description"),
            ticket_type=(f.get("issuetype") or {}).get("name", "Task"),
            status=status.get("name", "Unknown"),
            status_category=(status.get("statusCategory") or {}).get("key"),
            priority=(f.get("priority") or {}).get("name", "Medium"),
            assignee_id=person.id if person else None,
            story_points=int(points) if points is not None else None,
            created_at=_parse_dt(f.get("created")),
            updated_at=_parse_dt(f.get("updated")),
            due_date=date.fromisoformat(f["duedate"]) if f.get("duedate") else None,
            resolved_at=_parse_dt(f.get("resolutiondate")),
        )
        ticket = existing.get(issue["key"])
        if ticket is None:
            ticket = Ticket(project_id=project.id, key=issue["key"], **values)
            db.add(ticket)
            existing[issue["key"]] = ticket
            new_count += 1
        else:
            for name, value in values.items():
                setattr(ticket, name, value)
            updated_count += 1
    db.flush()

    # Links: rebuild from scratch each sync so links removed in Jira disappear here too.
    # A "Blocks" link appears on both issues; only the blocker carries `outwardIssue`,
    # so reading just that direction records each link exactly once.
    ids = {k: t.id for k, t in existing.items()}
    db.execute(delete(TicketLink).where(TicketLink.source_ticket_id.in_(ids.values())))
    link_count = 0
    for issue in issues:
        for link in issue["fields"].get("issuelinks") or []:
            target = (link.get("outwardIssue") or {}).get("key")
            if link["type"]["name"] == "Blocks" and target in ids:
                db.add(
                    TicketLink(
                        source_ticket_id=ids[issue["key"]],
                        target_ticket_id=ids[target],
                        link_type="blocks",
                    )
                )
                link_count += 1

    db.commit()
    result = {
        "project_id": project.id,
        "jira_project": key,
        "new_tickets": new_count,
        "updated_tickets": updated_count,
        "blocks_links": link_count,
        "story_points_field": story_point_field,
    }
    logger.info("Jira sync complete: %s", result)
    return result