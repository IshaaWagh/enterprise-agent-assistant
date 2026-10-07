# Import every model here so Alembic's autogenerate can see all tables.
from app.db.models.commit import Commit
from app.db.models.person import Person
from app.db.models.project import Project, ProjectMember
from app.db.models.pull_request import PullRequest
from app.db.models.snapshot import ProjectSnapshot
from app.db.models.ticket import Ticket, TicketLink
from app.db.models.user import ProjectAccess, User
from app.db.models.prediction_log import PredictionLog
from app.db.models.decision import Decision
from app.db.models.action import ActionItem, AutonomySetting

__all__ = [
    "Commit", "Person", "Project", "ProjectAccess", "ProjectMember",
    "ProjectSnapshot", "PullRequest", "Ticket", "TicketLink", "User", "PredictionLog",
    "Decision", "ActionItem", "AutonomySetting",
]