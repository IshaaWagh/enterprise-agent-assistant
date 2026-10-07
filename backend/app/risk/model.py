"""Load the trained model and score open tickets, with per-ticket explanations."""
from datetime import date
from functools import lru_cache
from pathlib import Path

import joblib
import networkx as nx
import numpy as np

from app.risk.features import FEATURES, ticket_feature_rows

ARTIFACT = Path(__file__).resolve().parent / "artifacts" / "risk_model.joblib"
MIN_CONTRIBUTION = 0.03  # a factor must raise the probability by at least 3 points to be shown


@lru_cache
def load_artifact() -> dict | None:
    return joblib.load(ARTIFACT) if ARTIFACT.exists() else None


def _describe(feature: str, v: float, row: dict) -> str:
    return {
        "open_blockers": f"{int(v)} open blocker{'s' if v != 1 else ''}",
        "upstream_open": f"{int(v)} unfinished ticket{'s' if v != 1 else ''} upstream in its dependency chain",
        "unassigned": "no assignee",
        "assignee_load_ratio": f"assignee carries {v:.1f}x the team's average open workload",
        "not_started": "work has not started",
        "days_to_due": f"due in {int(v)} day{'s' if v != 1 else ''}",
        "has_due_date": "no due date set",
        "priority_rank": f"{row['priority']} priority",
        "days_since_activity": "no linked commits or pull requests found" if v >= 60 else f"no linked activity for {int(v)} days",
    }[feature]


def _worth_showing(feature: str, v: float, row: dict) -> bool:
    """Skip factors that would read oddly: unassigned load, 'due in 0 days' on an overdue ticket."""
    if feature == "assignee_load_ratio":
        return v >= 1.2
    if feature == "days_to_due":
        return row["overdue_days"] == 0
    return True


def score_tickets(G: nx.MultiDiGraph, today: date | None = None) -> list[dict] | None:
    """Score every open ticket. Returns None if no trained model exists (caller falls back)."""
    art = load_artifact()
    if art is None:
        return None
    rows = ticket_feature_rows(G, today or date.today())
    if not rows:
        return []

    model, medians = art["model"], np.array(art["medians"])
    X = np.array([[r["features"][f] for f in FEATURES] for r in rows])
    probs = model.predict_proba(X)[:, 1]

    results = []
    for i, (row, p) in enumerate(zip(rows, probs)):
        # Explanation: how much does the probability drop if one feature is set to its typical value?
        variants = np.tile(X[i], (len(FEATURES), 1))
        for j in range(len(FEATURES)):
            variants[j, j] = medians[j]
        drops = p - model.predict_proba(variants)[:, 1]
        factors = [
            {"feature": FEATURES[j], "effect": round(float(drops[j]), 3), "text": _describe(FEATURES[j], X[i][j], row)}
            for j in np.argsort(-drops) if drops[j] >= MIN_CONTRIBUTION and _worth_showing(FEATURES[j], X[i][j], row)
        ][:3]
        reasons = [f["text"] for f in factors]
        prob = float(p)
        if row["overdue_days"] > 0:  # already late: the question is no longer "will it be"
            prob = max(prob, 0.9)
            reasons.insert(0, f"overdue by {row['overdue_days']} day{'s' if row['overdue_days'] != 1 else ''}")
        results.append(
            {
                "key": row["key"], "title": row["title"], "probability": round(prob, 3),
                "score": round(prob * 100), "level": "high" if prob >= 0.6 else "medium" if prob >= 0.3 else "low",
                "reasons": reasons, "factors": factors, "blocks_count": row["blocks_count"],
                "features": row["features"], "model_version": art["version"],
            }
        )
    return sorted(results, key=lambda r: -r["probability"])