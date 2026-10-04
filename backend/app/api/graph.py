from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_project_access
from app.api.projects import _project_or_404
from app.db.session import get_db
from app.graph.builder import build_graph, graph_stats

router = APIRouter(
    prefix="/api/projects", tags=["graph"], dependencies=[Depends(require_project_access)]
)


@router.get("/{project_id}/graph")
def get_graph(project_id: int, db: Session = Depends(get_db)) -> dict:
    """The project knowledge graph as nodes and edges (rebuilt from the database on each call)."""
    _project_or_404(db, project_id)
    G = build_graph(db, project_id)
    return {
        "nodes": [{"id": n, **attrs} for n, attrs in G.nodes(data=True)],
        "edges": [{"source": u, "target": v, "relation": d["relation"]} for u, v, d in G.edges(data=True)],
        "stats": graph_stats(G),
    }