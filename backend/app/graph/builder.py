"""Build the project knowledge graph (NetworkX) and analyse ticket dependencies."""
from collections import Counter
from datetime import date

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Commit, Person, PullRequest, Ticket, TicketLink


def build_graph(db: Session, project_id: int) -> nx.MultiDiGraph:
    """Nodes: tickets, people, PRs, and commits that reference a ticket.
    Edges: blocks, assigned_to, references, authored.
    """
    G = nx.MultiDiGraph()
    tickets = db.scalars(select(Ticket).where(Ticket.project_id == project_id)).all()
    by_id = {t.id: t for t in tickets}
    by_key = {t.key: t for t in tickets}
    commits = db.scalars(
        select(Commit).where(Commit.project_id == project_id, Commit.ticket_key.is_not(None))
    ).all()
    prs = db.scalars(select(PullRequest).where(PullRequest.project_id == project_id)).all()

    person_ids = {t.assignee_id for t in tickets} | {c.person_id for c in commits} | {p.person_id for p in prs}
    person_ids.discard(None)
    people = {p.id: p for p in db.scalars(select(Person).where(Person.id.in_(person_ids)))} if person_ids else {}

    for t in tickets:
        G.add_node(
            f"ticket:{t.key}", type="ticket", label=t.key, title=t.title, status=t.status,
            status_category=t.status_category, priority=t.priority,
            due_date=t.due_date.isoformat() if t.due_date else None,
        )
    for p in people.values():
        G.add_node(f"person:{p.id}", type="person", label=p.name)

    # Dependency edges: blocker -> blocked
    links = db.scalars(select(TicketLink).where(TicketLink.source_ticket_id.in_(by_id))).all() if by_id else []
    for link in links:
        src, tgt = by_id.get(link.source_ticket_id), by_id.get(link.target_ticket_id)
        if src and tgt:
            G.add_edge(f"ticket:{src.key}", f"ticket:{tgt.key}", relation="blocks")

    for t in tickets:
        if t.assignee_id in people:
            G.add_edge(f"ticket:{t.key}", f"person:{t.assignee_id}", relation="assigned_to")

    for c in commits:
        if c.ticket_key not in by_key:
            continue
        node = f"commit:{c.sha[:7]}"
        G.add_node(node, type="commit", label=c.sha[:7], title=c.message.split("\n")[0])
        G.add_edge(node, f"ticket:{c.ticket_key}", relation="references")
        if c.person_id in people:
            G.add_edge(f"person:{c.person_id}", node, relation="authored")

    for pr in prs:
        node = f"pr:{pr.number}"
        G.add_node(node, type="pr", label=f"PR #{pr.number}", title=pr.title, state=pr.state)
        if pr.ticket_key in by_key:
            G.add_edge(node, f"ticket:{pr.ticket_key}", relation="references")
        if pr.person_id in people:
            G.add_edge(f"person:{pr.person_id}", node, relation="authored")
    return G


def graph_stats(G: nx.MultiDiGraph) -> dict:
    return {
        "nodes": dict(Counter(d["type"] for _, d in G.nodes(data=True))),
        "edges": dict(Counter(d["relation"] for _, _, d in G.edges(data=True))),
    }


def analyze_dependencies(G: nx.MultiDiGraph) -> dict:
    """Find root blockers: open tickets that block other open tickets while not being blocked themselves."""
    blocks = nx.DiGraph()
    for u, v, d in G.edges(data=True):
        if d["relation"] == "blocks":
            blocks.add_edge(u, v)

    def is_open(n: str) -> bool:
        return G.nodes[n].get("status_category") != "done"

    has_cycle = not nx.is_directed_acyclic_graph(blocks)
    today = date.today()
    roots = []
    for n in blocks.nodes:
        if not is_open(n) or any(is_open(p) for p in blocks.predecessors(n)):
            continue
        downstream = [d for d in nx.descendants(blocks, n) if is_open(d)]
        if not downstream:
            continue
        chain = [n]
        if not has_cycle:
            chain = nx.dag_longest_path(blocks.subgraph({n, *downstream}))
        data = G.nodes[n]
        due = data.get("due_date")
        roots.append(
            {
                "key": data["label"],
                "title": data["title"],
                "status": data["status"],
                "due_date": due,
                "is_overdue": bool(due and date.fromisoformat(due) < today),
                "blocks_open_count": len(downstream),
                "blocked_keys": sorted(G.nodes[d]["label"] for d in downstream),
                "longest_chain": [G.nodes[c]["label"] for c in chain],
            }
        )
    roots.sort(key=lambda r: -r["blocks_open_count"])
    return {"has_cycle": has_cycle, "root_blockers": roots}