# Import every model here so Alembic's autogenerate can see all tables.
from app.db.models.commit import Commit
from app.db.models.person import Person
from app.db.models.project import Project, ProjectMember
from app.db.models.pull_request import PullRequest
from app.db.models.ticket import Ticket, TicketLink

__all__ = [
    "Commit",
    "Person",
    "Project",
    "ProjectMember",
    "PullRequest",
    "Ticket",
    "TicketLink",
]