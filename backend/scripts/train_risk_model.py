"""Train the ticket-lateness model.  Run from backend/:  python -m scripts.train_risk_model"""
from datetime import datetime, timezone

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from app.risk.features import FEATURES
from app.risk.model import ARTIFACT
from app.risk.synthetic import generate


def main() -> None:
    X, y = generate()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)

    model = GradientBoostingClassifier(
        n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=0
    ).fit(X_tr, y_tr)

    p = model.predict_proba(X_te)[:, 1]
    base_rate = float(y_tr.mean())
    metrics = {
        "roc_auc": round(roc_auc_score(y_te, p), 3),
        "accuracy": round(accuracy_score(y_te, p >= 0.5), 3),
        "brier": round(brier_score_loss(y_te, p), 3),
        "brier_always_base_rate": round(brier_score_loss(y_te, np.full(len(y_te), base_rate)), 3),
        "base_rate_late": round(base_rate, 3),
        "train_rows": len(y_tr), "test_rows": len(y_te),
    }
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model, "features": FEATURES, "medians": np.median(X_tr, axis=0).tolist(),
            "metrics": metrics, "data_source": "synthetic",
            "version": "gbc-" + datetime.now(timezone.utc).strftime("%Y%m%d"),
        },
        ARTIFACT,
    )
    print("Held-out metrics:", metrics)
    print("Feature importances:")
    for f, imp in sorted(zip(FEATURES, model.feature_importances_), key=lambda t: -t[1]):
        print(f"  {f:22s} {imp:.3f}")
    print(f"Saved {ARTIFACT}")


if __name__ == "__main__":
    main()