import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  GitFork,
  History,
  Layers,
  Lightbulb,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Metric,
  PageHeader,
} from "../components/ui";

const CONFIDENCE_CONFIG = {
  high: { label: "High Confidence", tone: "green", desc: "Supported by multiple converged signals across graph, risk, and resources" },
  medium: { label: "Medium Confidence", tone: "amber", desc: "Supported by direct ticket backlog or risk signals" },
  low: { label: "Low Confidence", tone: "neutral", desc: "Heuristic estimation with limited telemetry" },
};

export default function DecisionAgentPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.decisionLatest(project.id), api.decisionHistory(project.id)]),
    [project.id, version]
  );

  const [generating, setGenerating] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const decision = data[0]?.decision;
  const history = data[1]?.history || [];

  async function handleGenerate() {
    setGenerating(true);
    setSuccessMessage(null);
    try {
      await api.generateDecision(project.id);
      await reload();
      setSuccessMessage("Generated a new strategic recommendation from latest multi-agent signals.");
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendToActionQueue() {
    if (!decision) return;
    setQueueing(true);
    setSuccessMessage(null);
    try {
      const res = await api.queueActionFromDecision(project.id, decision.id);
      setSuccessMessage(`Recommendation successfully queued in the Autonomous Action Agent! (${res.action.title})`);
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setQueueing(false);
    }
  }

  const conf = decision ? CONFIDENCE_CONFIG[decision.confidence] || CONFIDENCE_CONFIG.medium : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI agent 4 of 5"
        title="Decision Agent"
        badge={<Badge tone="green" dot>Active</Badge>}
        description="Synthesizes telemetry from Project Analysis, Risk Prediction, Resource Management, and the Knowledge Graph to pinpoint the single most important issue and recommend one concrete action."
        actions={
          <Button variant="ai" onClick={handleGenerate} disabled={generating}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {generating ? "Reasoning..." : decision ? "Re-evaluate Decision" : "Generate Decision"}
          </Button>
        }
      />

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {!decision ? (
        <Card>
          <EmptyState
            title="No decision generated yet"
            message="Run the Decision Agent to synthesize signals across your backlog, team capacity, and knowledge graph."
            action={
              <Button variant="ai" onClick={handleGenerate} disabled={generating}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {generating ? "Evaluating..." : "Generate Decision"}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Executive Recommendation Highlight */}
          <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-slate-50 p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
                  <Compass className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-900">
                  Core Recommendation
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={conf.tone} dot>{conf.label}</Badge>
                <span className="text-xs text-slate-400">
                  {decision.created_at ? new Date(decision.created_at).toLocaleString() : ""}
                </span>
              </div>
            </div>

            {/* Most Important Issue */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Primary Delivery Issue
              </span>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{decision.issue}</h2>
            </div>

            {/* Root Cause Callout */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <GitFork className="h-3.5 w-3.5 text-amber-600" /> Root Cause from Knowledge Graph
                </span>
                {decision.target_ticket_key && (
                  <LinkButton
                    to={`/agents/analysis/trace?key=${encodeURIComponent(decision.target_ticket_key)}`}
                    variant="secondary"
                    className="text-xs py-1 px-2.5"
                  >
                    Trace in Graph <ChevronRight className="h-3 w-3 ml-0.5" />
                  </LinkButton>
                )}
              </div>
              <p className="text-sm text-slate-800">{decision.root_cause}</p>
            </div>

            {/* Recommended Concrete Action */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-emerald-600" /> One Concrete Recommended Action
              </span>
              <p className="text-base font-semibold text-slate-900">{decision.recommended_action}</p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  onClick={handleSendToActionQueue}
                  disabled={queueing || decision.status === "sent_to_action_agent"}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {decision.status === "sent_to_action_agent" ? "Queued in Action Agent" : "Send to Action Agent Queue"}
                </Button>
                <LinkButton to="/agents/actions" variant="secondary">
                  Open Action Center
                </LinkButton>
              </div>
            </div>
          </div>

          {/* Reasoning & Evidence Details */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Reasoning & Synthesis"
                subtitle="Justification referencing upstream metrics, risk probabilities, and load ratios"
              />
              <CardBody className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">{decision.reasoning}</p>
                <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 border border-slate-100">
                  <strong>Confidence assessment:</strong> {conf.desc}.
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Converged Evidence Signals"
                subtitle="Data points feeding the Decision Agent"
              />
              <CardBody className="space-y-4">
                {decision.evidence && Object.keys(decision.evidence).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(decision.evidence).map(([source, items]) => (
                      <div key={source} className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                        <span className="text-xs font-semibold uppercase text-slate-500">{source}</span>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                          {Array.isArray(items) ? (
                            items.map((it, idx) => <li key={idx}>{it}</li>)
                          ) : (
                            <li>{String(items)}</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Telemetry gathered from GitHub, Jira, and Knowledge Graph.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {/* Decision History */}
      {history.length > 0 && (
        <Card>
          <CardHeader
            title="Decision History & Evolution"
            subtitle="Previous recommendations recorded by the Decision Agent"
            action={<History className="h-4 w-4 text-slate-400" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Issue</th>
                  <th className="px-5 py-2.5 font-medium">Action</th>
                  <th className="px-5 py-2.5 font-medium">Confidence</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-xs truncate">{h.issue}</td>
                    <td className="px-5 py-3 text-xs max-w-sm truncate">{h.recommended_action}</td>
                    <td className="px-5 py-3">
                      <Badge tone={h.confidence === "high" ? "green" : h.confidence === "medium" ? "amber" : "neutral"}>
                        {h.confidence}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={h.status === "sent_to_action_agent" ? "ai" : "neutral"}>
                        {h.status === "sent_to_action_agent" ? "action queued" : h.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}
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

