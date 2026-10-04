from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None
    github_repo: str | None
    jira_project_key: str | None


class CommitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sha: str
    author_login: str | None
    author_name: str | None
    message: str
    committed_at: datetime
    additions: int
    deletions: int
    files_changed: int
    ticket_key: str | None


class PullRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    number: int
    title: str
    state: str
    author_login: str | None
    created_at: datetime
    merged_at: datetime | None
    additions: int
    deletions: int
    changed_files: int
    review_comments: int
    ticket_key: str | None