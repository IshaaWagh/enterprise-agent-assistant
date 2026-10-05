"""Root-cause tracing over the project knowledge graph.

A capability of the Project Analysis Agent (NOT a separate agent): starting from a delayed
ticket, walk backwards along 'blocks' edges through OPEN tickets to the ticket(s) at the
source of the delay, and gather evidence (assignee, PRs, commits, authors, activity).
"""
from datetime import date, datetime

import networkx as nx

PRIORITY_RANK = {"Highest": 4, "High": 3, "Medium": 2, "Low": 1, "Lowest": 0}
STALE_DAYS = 7


class TicketNotFound(Exception):
    pass


def _is_open(G: nx.MultiDiGraph, n: str) -> bool:
    return G.nodes[n].get("status_category") != "done"


def _blocks_graph(G: nx.MultiDiGraph) -> nx.DiGraph:
    blocks = nx.DiGraph()
    blocks.add_nodes_from(n for n, d in G.nodes(data=True) if d.get("type") == "ticket")
    for u, v, d in G.edges(data=True):
        if d.get("relation") == "blocks":
            blocks.add_edge(u, v)  # blocker -> blocked
    return blocks


def _open_upstream(G, blocks: nx.DiGraph, start: str) -> set[str]:
    """Every open ticket that (transitively) blocks `start`, walking only through open tickets."""
    seen: set[str] = set()
    stack = [start]
    while stack:
        n = stack.pop()
        for p in blocks.predecessors(n):
            if p not in seen and _is_open(G, p):
                seen.add(p)
                stack.append(p)
    return seen


def _ticket_view(G, node: str, today: date) -> dict:
    d = G.nodes[node]
    done = d.get("status_category") == "done"
    due = d.get("due_date")
    overdue_days = (today - date.fromisoformat(due)).days if due and not done else None
    is_overdue = overdue_days is not None and overdue_days > 0

    assignee = next(
        (G.nodes[v]["label"] for _, v, e in G.out_edges(node, data=True) if e["relation"] == "assigned_to"),
        None,
    )

    commits, prs = [], []
    for src, _, e in G.in_edges(node, data=True):
        if e["relation"] != "references":
            continue
        n = G.nodes[src]
        authors = [G.nodes[p]["label"] for p, _, ae in G.in_edges(src, data=True) if ae["relation"] == "authored"]
        if n["type"] == "commit":
            commits.append(
                {"sha": n["label"], "message": n["title"], "committed_at": n.get("committed_at"), "authors": authors}
            )
        elif n["type"] == "pr":
            prs.append(
                {
                    "label": n["label"], "title": n["title"], "state": n.get("state"),
                    "created_at": n.get("created_at"), "merged_at": n.get("merged_at"), "authors": authors,
                }
            )
    commits.sort(key=lambda c: c["committed_at"] or "", reverse=True)
    prs.sort(key=lambda p: p["created_at"] or "", reverse=True)

    stamps = [datetime.fromisoformat(c["committed_at"]) for c in commits if c["committed_at"]]
    for p in prs:
        stamps += [datetime.fromisoformat(p[k]) for k in ("merged_at", "created_at") if p.get(k)]
    last = max(stamps) if stamps else None
    days_since = (today - last.date()).days if last else None

    signals = []
    if not done:
        if is_overdue:
            signals.append(f"Overdue by {overdue_days} day{'s' if overdue_days != 1 else ''}")
            if d.get("status_category") == "new":
                signals.append("Not started")
        if assignee is None:
            signals.append("Unassigned")
        if not commits and not prs:
            signals.append("No linked commits or pull requests found")
        elif days_since is not None and days_since >= STALE_DAYS:
            signals.append(f"No linked activity for {days_since} days")

    return {
        "key": d["label"],
        "title": d["title"],
        "status": d["status"],
        "status_category": d.get("status_category"),
        "priority": d.get("priority"),
        "due_date": due,
        "is_overdue": is_overdue,
        "assignee": assignee,
        "signals": signals,
        "evidence": {
            "commits": commits[:5],
            "prs": prs[:5],
            "commit_count": len(commits),
            "pr_count": len(prs),
            "last_activity": last.isoformat() if last else None,
            "days_since_activity": days_since,
        },
    }


def _impact(G, blocks: nx.DiGraph, root: str) -> dict:
    keys = sorted(G.nodes[d]["label"] for d in nx.descendants(blocks, root) if _is_open(G, d))
    return {"count": len(keys), "keys": keys}


def _people(chain: list[dict]) -> list[dict]:
    seen, people = set(), []
    for step in chain:
        if step["assignee"] and (step["assignee"], step["key"], "assignee") not in seen:
            seen.add((step["assignee"], step["key"], "assignee"))
            people.append({"name": step["assignee"], "role": f"Assignee of {step['key']}"})
        for item in step["evidence"]["commits"] + step["evidence"]["prs"]:
            for author in item["authors"]:
                if (author, step["key"], "author") not in seen:
                    seen.add((author, step["key"], "author"))
                    people.append({"name": author, "role": f"Author of linked work on {step['key']}"})
    return people


def trace_root_cause(G: nx.MultiDiGraph, ticket_key: str, today: date | None = None) -> dict:
    today = today or date.today()
    start = f"ticket:{ticket_key}"
    if start not in G:
        raise TicketNotFound(ticket_key)

    blocks = _blocks_graph(G)
    target = _ticket_view(G, start, today)
    base = {"target": target, "primary_cause": None, "chain": [target], "alternatives": [], "people": [], "cycle": []}

    if target["status_category"] == "done":
        return {**base, "verdict": "resolved", "explanation": f"{ticket_key} is already done, so there is no delay to trace."}

    upstream = _open_upstream(G, blocks, start)

    if start in upstream:  # the ticket is (transitively) blocked by itself
        cycle = sorted(
            G.nodes[n]["label"] for n in upstream if n == start or n in nx.descendants(blocks, start)
        )
        return {
            **base,
            "verdict": "dependency_cycle",
            "cycle": cycle,
            "explanation": f"{ticket_key} is part of a circular dependency ({', '.join(cycle)}). "
            "None of these tickets can finish until the cycle is broken in Jira.",
        }

    if not upstream:  # nothing open is blocking it
        if target["is_overdue"]:
            reasons = "; ".join(target["signals"]) or "no further signals"
            return {
                **base,
                "verdict": "self_caused",
                "primary_cause": {"key": ticket_key, "title": target["title"], "signals": target["signals"], "impact": _impact(G, blocks, start)},
                "people": _people([target]),
                "explanation": f"{ticket_key} is overdue and is not waiting on any open blocker. Findings: {reasons}.",
            }
        return {
            **base,
            "verdict": "no_delay_detected",
            "people": _people([target]),
            "explanation": f"{ticket_key} is not overdue and is not blocked by any open ticket.",
        }

    # Blocked upstream: find the roots (open upstream tickets with no open blocker of their own).
    roots = [n for n in upstream if not any(_is_open(G, p) for p in blocks.predecessors(n))]
    sub = blocks.subgraph(upstream | {start})
    candidates = []
    for r in roots:
        view = _ticket_view(G, r, today)
        impact = _impact(G, blocks, r)
        path = nx.shortest_path(sub, r, start)
        rank = (view["is_overdue"], impact["count"], PRIORITY_RANK.get(view["priority"], 0))
        candidates.append((rank, view, impact, path))
    candidates.sort(key=lambda c: c[0], reverse=True)

    _, root_view, root_impact, path = candidates[0]
    chain = [_ticket_view(G, n, today) for n in path]
    reasons = "; ".join(root_view["signals"]) or "no further signals"
    arrow = " → ".join(s["key"] for s in chain)
    return {
        "verdict": "blocked_upstream",
        "target": target,
        "primary_cause": {"key": root_view["key"], "title": root_view["title"], "signals": root_view["signals"], "impact": root_impact},
        "chain": chain,
        "alternatives": [
            {
                "key": v["key"], "title": v["title"], "signals": v["signals"],
                "chain": [G.nodes[n]["label"] for n in p], "impact": imp,
            }
            for _, v, imp, p in candidates[1:]
        ],
        "people": _people(chain),
        "cycle": [],
        "explanation": (
            f"{ticket_key} is held up by {root_view['key']} ({root_view['title']}). {reasons}. "
            f"Dependency chain: {arrow}. Resolving {root_view['key']} would unblock "
            f"{root_impact['count']} open ticket{'s' if root_impact['count'] != 1 else ''}."
        ),
    }