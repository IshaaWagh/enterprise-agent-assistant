import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Database, ExternalLink, GitFork, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState,
  LinkButton, LoadingState, Metric, PageHeader
} from "../components/ui";

const LEVEL_CONFIG = {
  high: { label: "High Risk", tone: "red", barTone: "bg-rose-500", textTone: "text-rose-700" },
  medium: { label: "Medium Risk", tone: "amber", barTone: "bg-amber-500", textTone: "text-amber-700" },
  low: { label: "Low Risk", tone: "green", barTone: "bg-emerald-500", textTone: "text-emerald-700" },
};

function FeatureInspector({ features }) {
  if (!features) return null;
  const items = [
    { label: "Days to due", val: features.days_to_due != null ? `${features.days_to_due}d` : "None" },
    { label: "Has due date", val: features.has_due_date ? "Yes" : "No" },
    { label: "Open blockers", val: features.open_blockers },
    { label: "Upstream open", val: features.upstream_open },
    { label: "Unassigned", val: features.unassigned ? "Yes" : "No" },
    { label: "Assignee load ratio", val: `${features.assignee_load_ratio}x` },
    { label: "Priority rank", val: features.priority_rank },
    { label: "Not started", val: features.not_started ? "Yes" : "No" },
    { label: "Days idle", val: `${features.days_since_activity}d` },
  ];

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Trained Model Feature Inputs</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 text-xs">
        {items.map((it) => (
          <div key={it.label} className="rounded bg-white p-2 border border-slate-100">
            <span className="text-slate-500 block truncate">{it.label}</span>
            <span className="font-semibold text-slate-800">{it.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RiskPredictionPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.risk(project.id), [project.id, version]);
  const [filterLevel, setFilterLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { model, tickets = [], calibration = {}, recent_logs = [] } = data;

  const highCount = tickets.filter((t) => t.level === "high").length;
  const mediumCount = tickets.filter((t) => t.level === "medium").length;
  const lowCount = tickets.filter((t) => t.level === "low").length;
  const avgProb = tickets.length
    ? Math.round((tickets.reduce((acc, t) => acc + t.probability, 0) / tickets.length) * 100)
    : 0;

  const filteredTickets = tickets.filter((t) => {
    if (filterLevel !== "all" && t.level !== filterLevel) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleExpand = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI agent 2 of 5"
        title="Risk Prediction Agent"
        badge={<Badge tone="green" dot>Active</Badge>}
        description="Predicts the probability that an open ticket will be late using historical ticket features and a machine learning Gradient Boosting Classifier, with explainable contributing factors."
        actions={
          <Button onClick={reload}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-score Backlog
          </Button>
        }
      />

      {/* High-level metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="High Risk Tickets"
          value={highCount}
          tone="red"
          sub={`${highCount} ticket${highCount !== 1 ? "s" : ""} probability >= 60%`}
        />
        <Metric
          label="Medium Risk Tickets"
          value={mediumCount}
          tone="amber"
          sub={`${mediumCount} ticket${mediumCount !== 1 ? "s" : ""} probability 30–59%`}
        />
        <Metric
          label="Low Risk Tickets"
          value={lowCount}
          tone="green"
          sub={`${lowCount} ticket${lowCount !== 1 ? "s" : ""} probability < 30%`}
        />
        <Metric
          label="Backlog Avg. Risk"
          value={`${avgProb}%`}
          sub={`Across ${tickets.length} open tickets`}
        />
      </div>

      {/* Model & Calibration details */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Model Architecture & Validation"
            subtitle={`Artifact: ${model.version} · Data source: ${model.data_source}`}
            action={<Badge tone="ai">GradientBoostingClassifier</Badge>}
          />
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-600">
              Unlike LLMs that hallucinate delivery timelines, this agent trains a scikit-learn Gradient Boosting model on historical ticket lifecycles.
              Features are extracted before resolution (no label leakage), and feature importances provide grounded explanations for every prediction.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs text-slate-500 font-medium uppercase">ROC AUC</span>
                <p className="mt-1 text-lg font-bold text-slate-900">{model.metrics.roc_auc}</p>
                <span className="text-[11px] text-slate-400">Held-out discrimination</span>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs text-slate-500 font-medium uppercase">Accuracy</span>
                <p className="mt-1 text-lg font-bold text-slate-900">{Math.round(model.metrics.accuracy * 100)}%</p>
                <span className="text-[11px] text-slate-400">At 0.5 threshold</span>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs text-slate-500 font-medium uppercase">Brier Score</span>
                <p className="mt-1 text-lg font-bold text-slate-900">{model.metrics.brier}</p>
                <span className="text-[11px] text-emerald-600">vs {model.metrics.brier_always_base_rate} baseline</span>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs text-slate-500 font-medium uppercase">Train / Test Split</span>
                <p className="mt-1 text-lg font-bold text-slate-900">{model.metrics.train_rows} / {model.metrics.test_rows}</p>
                <span className="text-[11px] text-slate-400">Stratified split</span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Prediction Logging & Calibration"
            subtitle="Confidence calibration tracking"
            action={<Database className="h-4 w-4 text-slate-400" />}
          />
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-600">
              Predictions are logged to the PostgreSQL <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">prediction_log</code> table on every pipeline run.
            </p>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="text-slate-500">Logged Predictions</span>
              <span className="font-semibold text-slate-900">{calibration.logged_predictions ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="text-slate-500">Historical Base Rate</span>
              <span className="font-semibold text-slate-900">{Math.round((model.metrics.base_rate_late ?? 0.28) * 100)}% late</span>
            </div>
            <div className="rounded-md bg-violet-50 p-3 text-xs text-violet-800">
              <Sparkles className="mb-1 h-3.5 w-3.5 inline mr-1 text-violet-600" />
              <strong>Continuous calibration:</strong> As tickets are resolved, actual outcomes update the prediction log to monitor rolling calibration drift.
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Scored Tickets section */}
      <Card>
        <CardHeader
          title="Backlog Risk Ranking"
          subtitle={`Ranked late-delivery probabilities with top contributing factors (${filteredTickets.length} tickets shown)`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter key or title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                {["all", "high", "medium", "low"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setFilterLevel(lvl)}
                    className={`rounded px-2.5 py-1 capitalize font-medium transition-colors ${
                      filterLevel === lvl ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {filteredTickets.length === 0 ? (
          <EmptyState
            title="No tickets match filter"
            message="Try adjusting your search criteria or risk level filter."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTickets.map((t) => {
              const cfg = LEVEL_CONFIG[t.level] || LEVEL_CONFIG.low;
              const isExpanded = expandedKeys.has(t.key);
              return (
                <div key={t.key} className="p-5 transition-colors hover:bg-slate-50/50">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/jira?key=${t.key}`}
                          className="font-mono text-sm font-semibold text-violet-700 hover:underline"
                        >
                          {t.key}
                        </Link>
                        <Badge tone={cfg.tone}>{cfg.label}</Badge>
                        {t.blocks_count > 0 && (
                          <Badge tone="amber">Blocks {t.blocks_count} open ticket{t.blocks_count !== 1 ? "s" : ""}</Badge>
                        )}
                      </div>
                      <h3 className="text-base font-medium text-slate-900">{t.title}</h3>

                      {/* Contributing Factors */}
                      {t.reasons && t.reasons.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-400">Top factors:</span>
                          {t.reasons.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Risk Probability Score & Gauge */}
                    <div className="flex items-center gap-4 sm:min-w-[200px] justify-between md:justify-end">
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${cfg.textTone}`}>{t.score}%</span>
                        <p className="text-[11px] text-slate-400">Lateness probability</p>
                      </div>
                      <div className="w-24">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full ${cfg.barTone}`}
                            style={{ width: `${Math.min(t.score, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Inspector Bar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100/80 pt-3">
                    <div className="flex items-center gap-2">
                      <LinkButton to={`/agents/analysis/trace?key=${encodeURIComponent(t.key)}`} variant="secondary">
                        <GitFork className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                        Trace Root Cause
                      </LinkButton>
                      <LinkButton to={`/jira`} variant="secondary">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                        Jira
                      </LinkButton>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpand(t.key)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      {isExpanded ? (
                        <>
                          Hide ML Features <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Inspect ML Features <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Collapsible Feature Inspector */}
                  {isExpanded && <FeatureInspector features={t.features} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent prediction logs */}
      {recent_logs.length > 0 && (
        <Card>
          <CardHeader
            title="Recent Prediction Log Entries"
            subtitle="Stored in database for accuracy tracking and Brier score re-calibration"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Ticket</th>
                  <th className="px-5 py-2.5 font-medium">Predicted Probability</th>
                  <th className="px-5 py-2.5 font-medium">Recorded At</th>
                  <th className="px-5 py-2.5 font-medium">Outcome Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recent_logs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3 font-mono font-medium text-slate-900">{entry.ticket_key}</td>
                    <td className="px-5 py-3">
                      <span className="font-semibold">{Math.round(entry.probability * 100)}%</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-5 py-3">
                      {entry.outcome_late === null ? (
                        <span className="inline-flex items-center text-xs text-amber-600">
                          Pending ticket close
                        </span>
                      ) : entry.outcome_late ? (
                        <Badge tone="red">Late</Badge>
                      ) : (
                        <Badge tone="green">On Time</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

