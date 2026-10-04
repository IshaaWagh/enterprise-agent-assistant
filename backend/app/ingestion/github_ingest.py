"""Pull commits and pull requests from GitHub into PostgreSQL (idempotent)."""
import logging
import re
from itertools import islice

from github import Auth, Github
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Commit, Person, Project, PullRequest

logger = logging.getLogger(__name__)

# Matches Jira-style keys such as FIN-12 in commit messages, PR titles, branch names.
TICKET_RE = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")


class IngestionConfigError(Exception):
    """Raised when required credentials/settings are missing."""


def extract_ticket_key(*texts: str | None) -> str | None:
    for text in texts:
        if text and (match := TICKET_RE.search(text)):
            return match.group(1)
    return None


def _get_or_create_project(db: Session, full_name: str, description: str | None) -> Project:
    project = db.scalar(select(Project).where(Project.github_repo == full_name))
    if project is None:
        project = Project(
            name=full_name.split("/")[-1],
            description=description,
            github_repo=full_name,
            jira_project_key=get_settings().jira_project_key,
        )
        db.add(project)
        db.flush()  # session has autoflush off, so flush to get the id
    return project


def _get_or_create_person(
    db: Session, cache: dict[str, Person], login: str, name: str | None, email: str | None
) -> Person:
    if login in cache:
        return cache[login]
    person = db.scalar(select(Person).where(Person.github_login == login))
    if person is None:
        person = Person(name=name or login, email=email, github_login=login)
        db.add(person)
        db.flush()
    cache[login] = person
    return person


def sync_github(db: Session, max_commits: int = 300, max_prs: int = 200) -> dict:
    s = get_settings()
    if not (s.github_token and s.github_repo):
        raise IngestionConfigError("GITHUB_TOKEN and GITHUB_REPO must be set in .env")

    gh = Github(auth=Auth.Token(s.github_token.get_secret_value()))
    repo = gh.get_repo(s.github_repo)
    project = _get_or_create_project(db, repo.full_name, repo.description)
    people: dict[str, Person] = {}

    # ---- Commits (immutable, so existing SHAs are skipped) ----
    existing_shas = set(db.scalars(select(Commit.sha).where(Commit.project_id == project.id)))
    new_commits = 0
    for c in islice(repo.get_commits(), max_commits):
        if c.sha in existing_shas:
            continue
        git_author = c.commit.author
        login = c.author.login if c.author else None
        person = (
            _get_or_create_person(db, people, login, git_author.name, git_author.email)
            if login
            else None
        )
        stats = c.stats  # triggers one extra API call per commit
        db.add(
            Commit(
                project_id=project.id,
                sha=c.sha,
                author_login=login,
                author_name=git_author.name,
                author_email=git_author.email,
                person_id=person.id if person else None,
                message=c.commit.message,
                committed_at=git_author.date,
                additions=stats.additions,
                deletions=stats.deletions,
                files_changed=sum(1 for _ in c.files),
                ticket_key=extract_ticket_key(c.commit.message),
            )
        )
        new_commits += 1

    # ---- Pull requests (mutable, so existing ones are updated) ----
    existing_prs = {
        pr.number: pr
        for pr in db.scalars(select(PullRequest).where(PullRequest.project_id == project.id))
    }
    new_prs = updated_prs = 0
    for pr in islice(repo.get_pulls(state="all", sort="created", direction="desc"), max_prs):
        login = pr.user.login if pr.user else None
        person = _get_or_create_person(db, people, login, None, None) if login else None
        values = dict(
            title=pr.title,
            state="merged" if pr.merged else pr.state,
            author_login=login,
            person_id=person.id if person else None,
            created_at=pr.created_at,
            merged_at=pr.merged_at,
            closed_at=pr.closed_at,
            additions=pr.additions,
            deletions=pr.deletions,
            changed_files=pr.changed_files,
            review_comments=pr.review_comments,
            comments=pr.comments,
            ticket_key=extract_ticket_key(pr.title, pr.head.ref, pr.body),
        )
        if pr.number in existing_prs:
            for field, value in values.items():
                setattr(existing_prs[pr.number], field, value)
            updated_prs += 1
        else:
            db.add(PullRequest(project_id=project.id, number=pr.number, **values))
            new_prs += 1

    db.commit()
    result = {
        "project_id": project.id,
        "repo": repo.full_name,
        "new_commits": new_commits,
        "new_pull_requests": new_prs,
        "updated_pull_requests": updated_prs,
        "people_seen": len(people),
    }
    logger.info("GitHub sync complete: %s", result)
    return result
