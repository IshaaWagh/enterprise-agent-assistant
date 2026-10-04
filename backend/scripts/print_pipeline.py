"""Print the LangGraph pipeline as a Mermaid diagram.  Run: python -m scripts.print_pipeline"""
from types import SimpleNamespace

from app.agents.pipeline import build_pipeline

# The nodes only use the DB session when they run, so dummies are fine for drawing the graph.
app = build_pipeline(None, SimpleNamespace(id=0, name="", github_repo=None, jira_project_key=None))
print(app.get_graph().draw_mermaid())