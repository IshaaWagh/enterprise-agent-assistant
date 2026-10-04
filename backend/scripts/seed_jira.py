"""Create realistic tickets in your Jira project through the real Jira API.

Run from backend/:   python -m scripts.seed_jira          (refuses if the project already has issues)
                     python -m scripts.seed_jira --force  (adds them anyway)
"""
import sys
from datetime import date, timedelta

from jira import JIRA
from jira.exceptions import JIRAError

from app.core.config import get_settings
from app.ingestion.jira_client import STORY_POINT_FIELD_NAMES, find_field_id, search_issues


def t(summary, kind, priority, points, status, due_days, blocked_by=(), assigned=True):
    """One ticket. due_days is relative to today (negative = already overdue)."""
    return dict(summary=summary, kind=kind, priority=priority, points=points, status=status,
                due_days=due_days, blocked_by=list(blocked_by), assigned=assigned)


# blocked_by holds INDEXES into this list. The chain 2 -> 3 -> 5 -> 6 is the root-cause demo.
TICKETS = [
    t("Design database schema for transactions and categories", "Story", "High", 5, "Done", -20),            # 0
    t("Set up CI pipeline with automated tests", "Task", "Medium", 3, "Done", -15),                          # 1
    t("Finalize bank statement import format (CSV/OFX)", "Story", "Highest", 5, "To Do", -6),                # 2  <- root blocker
    t("Implement transaction import service", "Story", "High", 8, "In Progress", -3, [2]),                   # 3
    t("Auto-categorize imported transactions", "Story", "Medium", 8, "To Do", 4, [3]),                       # 4
    t("Monthly spending report generation", "Story", "High", 5, "To Do", 6, [3]),                            # 5
    t("Dashboard analytics charts", "Story", "Medium", 5, "To Do", 9, [5]),                                  # 6
    t("Fix: incorrect total on multi-currency accounts", "Bug", "High", 3, "In Progress", -1),               # 7
    t("Add budget limits and alerts", "Story", "Medium", 8, "In Progress", 2),                               # 8
    t("User authentication and session handling", "Story", "High", 8, "Done", -10),                          # 9
    t("Fix: crash when importing an empty file", "Bug", "Highest", 2, "To Do", -2),                          # 10
    t("Export reports to PDF", "Task", "Low", 3, "To Do", 14, [5]),                                          # 11
    t("Improve mobile responsiveness", "Task", "Low", 3, "To Do", 12, assigned=False),                       # 12
    t("Write unit tests for the budget module", "Task", "Medium", 5, "To Do", 5, [8]),                       # 13
    t("Security review of API endpoints", "Task", "High", 5, "To Do", 7, assigned=False),                    # 14
    t("Fix: date picker uses the wrong timezone", "Bug", "Medium", 2, "Done", -4),                           # 15
    t("Recurring transactions support", "Story", "Medium", 8, "To Do", 16, assigned=False),                  # 16
    t("Performance: slow query on the yearly view", "Bug", "Medium", 3, "In Progress", -5),                  # 17
    t("Documentation and user guide", "Task", "Low", 3, "To Do", 20, assigned=False),                        # 18
]


def move_to(jira: JIRA, issue, target: str) -> None:
    """Transition an issue to the target status, going via 'In Progress' if needed."""
    def attempt(name: str) -> bool:
        for tr in jira.transitions(issue):
            if tr["to"]["name"].lower() == name.lower() or tr["name"].lower() == name.lower():
                jira.transition_issue(issue, tr["id"])
                return True
        return False

    if not attempt(target):
        if attempt("In Progress"):
            attempt(target)


def main() -> int:
    s = get_settings()
    key = s.jira_project_key
    if not (s.jira_base_url and s.jira_email and s.jira_api_token and key):
        print("Jira settings missing in .env")
        return 1

    existing = list(search_issues(f'project = "{key}"', ["summary"]))
    if existing and "--force" not in sys.argv:
        print(f"Project {key} already has {len(existing)} issues. Use --force to add more anyway.")
        return 1

    jira = JIRA(server=s.jira_base_url, basic_auth=(s.jira_email, s.jira_api_token.get_secret_value()))
    me = jira.myself()["accountId"]
    points_field = find_field_id(STORY_POINT_FIELD_NAMES)
    today = date.today()

    keys: list[str] = []
    unsupported: set[str] = set()

    for i, spec in enumerate(TICKETS, start=1):
        base = {
            "project": {"key": key},
            "summary": spec["summary"],
            "description": f"{spec['summary']}\n\nPart of the finance-tracker roadmap.",
        }
        try:
            issue = jira.create_issue(fields={**base, "issuetype": {"name": spec["kind"]}})
        except JIRAError:
            issue = jira.create_issue(fields={**base, "issuetype": {"name": "Task"}})
        keys.append(issue.key)

        # Optional fields are set one by one: not every Jira project layout exposes all of them.
        extras = {
            "priority": {"priority": {"name": spec["priority"]}},
            "duedate": {"duedate": (today + timedelta(days=spec["due_days"])).isoformat()},
        }
        if points_field:
            extras["story points"] = {points_field: spec["points"]}
        for name, fields in extras.items():
            try:
                issue.update(fields=fields)
            except JIRAError:
                unsupported.add(name)
        if spec["assigned"]:
            try:
                jira.assign_issue(issue, me)
            except JIRAError:
                unsupported.add("assignee")
        if spec["status"] != "To Do":
            move_to(jira, issue, spec["status"])
        print(f"[{i:>2}/{len(TICKETS)}] {issue.key}  {spec['status']:<11} {spec['summary']}")

    for i, spec in enumerate(TICKETS):
        for b in spec["blocked_by"]:
            # inwardIssue "is blocked by" outwardIssue, so the blocker is the outward issue.
            jira.create_issue_link("Blocks", inwardIssue=keys[i], outwardIssue=keys[b])
            print(f"link: {keys[b]} blocks {keys[i]}")

    if unsupported:
        print(f"\nNote: these fields could not be set on your project layout: {sorted(unsupported)}")
        print("In Jira: Project settings > Issue types > add the fields, then re-run with --force")
    print(f"\nDone. Created {len(keys)} issues. Wait ~30 seconds before syncing (Jira search is eventually consistent).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())