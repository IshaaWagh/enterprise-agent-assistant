"""Verify that the backend can reach GitHub and Jira with the configured credentials.

Run from the backend/ folder:  python -m scripts.check_connections
"""
from github import Auth, Github
from github.GithubException import GithubException
from jira import JIRA
from jira.exceptions import JIRAError

from app.core.config import get_settings


def check_github() -> bool:
    s = get_settings()
    if not (s.github_token and s.github_repo):
        print("[GitHub] SKIPPED - GITHUB_TOKEN / GITHUB_REPO missing in .env")
        return False
    try:
        gh = Github(auth=Auth.Token(s.github_token.get_secret_value()))
        repo = gh.get_repo(s.github_repo)
        commits = repo.get_commits()
        pulls = repo.get_pulls(state="all")
        print(f"[GitHub] OK - repo '{repo.full_name}'")
        print(f"         commits: {commits.totalCount}, pull requests: {pulls.totalCount}")
        return True
    except GithubException as e:
        print(f"[GitHub] FAILED - HTTP {e.status}: {e.data.get('message') if e.data else e}")
        return False


def check_jira() -> bool:
    s = get_settings()
    if not (s.jira_base_url and s.jira_email and s.jira_api_token and s.jira_project_key):
        print("[Jira]   SKIPPED - one or more JIRA_* values missing in .env")
        return False
    try:
        jira = JIRA(
            server=s.jira_base_url,
            basic_auth=(s.jira_email, s.jira_api_token.get_secret_value()),
        )
        me = jira.myself()
        project = jira.project(s.jira_project_key)
        print(f"[Jira]   OK - logged in as '{me['displayName']}'")
        print(f"         project: {project.key} - {project.name}")
        return True
    except JIRAError as e:
        print(f"[Jira]   FAILED - HTTP {e.status_code}: {e.text}")
        return False


if __name__ == "__main__":
    results = [check_github(), check_jira()]
    raise SystemExit(0 if all(results) else 1)