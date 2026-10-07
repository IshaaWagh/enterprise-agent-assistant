"""Per-ticket features for the Risk Prediction model, computed from the project knowledge graph.

Every feature is known BEFORE the ticket finishes (no outcome leakage).
"""
from collections import Counter
from datetime import date, datetime

import networkx as nx

FEATURES = [
    "days_to_due", "has_due_date", "open_blockers", "upstream_open",
    "unassigned", "assignee_load_ratio", "priority_rank", "not_started", "days_since_activity",
]
PRIORITY_RANK = {"Highest": 4, "High": 3, "Medium": 2, "Low": 1, "Lowest": 0}
CAP_DAYS = 60  # due-date horizon and "no activity" sentinel


def _open(G, n: str) -> bool:
    return G.nodes[n].get("status_category") != "done"


def ticket_feature_rows(G: nx.MultiDiGraph, today: date) -> list[dict]:
    """One row per OPEN ticket: identifying fields plus the model's feature dict."""
    tickets = [n for n, d in G.nodes(data=True) if d.get("type") == "ticket" and _open(G, n)]

    blocks = nx.DiGraph()
    blocks.add_nodes_from(n for n, d in G.nodes(data=True) if d.get("type") == "ticket")
    blocks.add_edges_from((u, v) for u, v, d in G.edges(data=True) if d.get("relation") == "blocks")

    def assignee(n: str):
        return next((v for _, v, e in G.out_edges(n, data=True) if e["relation"] == "assigned_to"), None)

    load = Counter(a for a in map(assignee, tickets) if a)
    avg_load = sum(load.values()) / len(load) if load else 1.0

    rows = []
    for n in tickets:
        d = G.nodes[n]
        due = date.fromisoformat(d["due_date"]) if d.get("due_date") else None
        days = (due - today).days if due else None

        open_preds = [p for p in blocks.predecessors(n) if _open(G, p)]
        upstream, stack = set(), list(open_preds)
        while stack:
            p = stack.pop()
            if p in upstream:
                continue
            upstream.add(p)
            stack += [q for q in blocks.predecessors(p) if _open(G, q) and q not in upstream]

        stamps = []
        for src, _, e in G.in_edges(n, data=True):
            if e["relation"] == "references":
                s = G.nodes[src]
                stamps += [datetime.fromisoformat(s[k]) for k in ("committed_at", "merged_at", "created_at") if s.get(k)]
        idle = min((today - max(stamps).date()).days, CAP_DAYS) if stamps else CAP_DAYS

        who = assignee(n)
        rows.append(
            {
                "key": d["label"], "title": d["title"], "priority": d.get("priority"),
                "due_date": d.get("due_date"), "overdue_days": -days if days is not None and days < 0 else 0,
                "blocks_count": sum(1 for x in nx.descendants(blocks, n) if _open(G, x)),
                "features": {
                    "days_to_due": float(min(max(days, 0), CAP_DAYS)) if days is not None else float(CAP_DAYS),
                    "has_due_date": float(due is not None),
                    "open_blockers": float(min(len(open_preds), 3)),
                    "upstream_open": float(min(len(upstream), 6)),
                    "unassigned": float(who is None),
                    "assignee_load_ratio": round(load[who] / avg_load, 2) if who else 0.0,
                    "priority_rank": float(PRIORITY_RANK.get(d.get("priority"), 2)),
                    "not_started": float(d.get("status_category") == "new"),
                    "days_since_activity": float(idle),
                },
            }
        )
    return rows