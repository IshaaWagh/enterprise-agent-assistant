"""Synthetic ticket history used to train the first Risk model.

IMPORTANT: this is simulated data. Labels come from a hand-written risk process plus noise, so the
model's accuracy measures how well it recovers that process, NOT real-world performance.
Replace with exported closed Jira tickets when available (same feature columns, real 'was_late' label).
"""
import numpy as np

from app.risk.features import CAP_DAYS, FEATURES


def generate(n: int = 6000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    has_due = rng.random(n) < 0.9
    days_to_due = np.where(has_due, np.clip(rng.gamma(2.0, 8.0, n).round(), 0, CAP_DAYS), CAP_DAYS)
    open_blockers = np.clip(rng.poisson(0.5, n), 0, 3)
    upstream = np.clip(open_blockers + (open_blockers > 0) * rng.poisson(0.6, n), 0, 6)
    unassigned = rng.random(n) < 0.10
    load = np.where(unassigned, 0.0, np.clip(rng.lognormal(0, 0.35, n), 0.3, 2.5))
    priority = rng.choice([0, 1, 2, 3, 4], n, p=[0.05, 0.2, 0.45, 0.22, 0.08])
    not_started = rng.random(n) < (0.2 + 0.5 * days_to_due / CAP_DAYS)
    has_activity = rng.random(n) < np.where(not_started, 0.25, 0.7)
    idle = np.where(has_activity, np.clip(rng.exponential(8, n).round(), 0, CAP_DAYS), CAP_DAYS)

    logit = (
        -2.0
        + 1.0 * open_blockers + 0.25 * upstream
        + 1.5 * unassigned
        + 1.3 * np.clip(load - 1.0, 0, None)
        + 0.15 * priority
        + 0.9 * (not_started & (days_to_due < 7))
        - 0.07 * np.minimum(days_to_due, 30) * has_due
        + 0.5 * (~has_due)
        + 0.03 * np.where(has_activity, idle, 0)
        + 0.4 * (~has_activity & ~not_started)
        + rng.normal(0, 0.9, n)
    )
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    cols = {
        "days_to_due": days_to_due, "has_due_date": has_due, "open_blockers": open_blockers,
        "upstream_open": upstream, "unassigned": unassigned, "assignee_load_ratio": load,
        "priority_rank": priority, "not_started": not_started, "days_since_activity": idle,
    }
    return np.column_stack([cols[f].astype(float) for f in FEATURES]), y