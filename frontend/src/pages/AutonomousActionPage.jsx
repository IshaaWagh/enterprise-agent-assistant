import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Lock,
  Play,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
  X,
  XCircle,
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

const AUTONOMY_LEVELS = [
  {
    id: "suggest_only",
    levelNumber: 1,
    name: "Suggest Only",
    badge: "Manual",
    desc: "The agent generates recommendations and suggests them in reports, but never queues or executes actions automatically. A person executes all changes manually.",
  },
  {
    id: "approve_first",
    levelNumber: 2,
    name: "Approve First",
    badge: "Human-in-the-loop",
    desc: "The agent drafts concrete actions (reassignments, ticket creation, Slack alerts) into an approval queue. Execution occurs only after human sign-off.",
  },
  {
    id: "fully_autonomous",
    levelNumber: 3,
    name: "Fully Autonomous",
    badge: "Autonomous",
    desc: "The agent automatically executes actions when the Decision Agent confidence is high. All actions are audited in the track record log.",
  },
];

export default function AutonomousActionPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.actionSettings(project.id), api.actionQueue(project.id), api.actionHistory(project.id)]),
    [project.id, version]
  );

  const [savingSetting, setSavingSetting] = useState(false);
  const [actingActionId, setActingActionId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const settings = data[0] || { level: "approve_first" };
  const queue = data[1]?.queue || [];
  const historyData = data[2] || { history: [], track_record: {} };
  const { history = [], track_record = {} } = historyData;

  async function handleLevelChange(newLevel) {
    setSavingSetting(true);
    setFeedback(null);
    try {
      await api.updateActionSettings(project.id, {
        level: newLevel,
        auto_execute_confidence: "high",
      });
      await reload();
      setFeedback(`Trust Dial updated to Level ${newLevel === "suggest_only" ? 1 : newLevel === "approve_first" ? 2 : 3} (${newLevel.replace("_", " ")}).`);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSetting(false);
    }
  }

  async function handleApprove(actionId) {
    setActingActionId(actionId);
    setFeedback(null);
    try {
      const res = await api.approveAction(project.id, actionId);
      setFeedback(`Action successfully executed and recorded in track record!`);
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setActingActionId(null);
    }
  }

  async function handleReject(actionId) {
    setActingActionId(actionId);
    setFeedback(null);
    try {
      await api.rejectAction(project.id, actionId, "Rejected by Project Manager");
      setFeedback(`Action rejected and logged in track record.`);
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setActingActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI agent 5 of 5"
        title="Autonomous Action Agent"
        badge={<Badge tone="green" dot>Active</Badge>}
        description="Executes or queues actions based on the configured Trust Dial autonomy level: Suggest Only, Approve First, or Fully Autonomous."
        actions={
          <Button onClick={reload}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh Queue
          </Button>
        }
      />

      {feedback && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Track Record Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Acceptance Rate"
          value={`${track_record.acceptance_rate ?? 100}%`}
          tone="green"
          sub={`${track_record.executed_count || 0} executed of ${(track_record.executed_count || 0) + (track_record.rejected_count || 0)} decided`}
        />
        <Metric
          label="Pending Approval"
          value={track_record.pending_count || 0}
          tone={track_record.pending_count ? "amber" : undefined}
          sub="Awaiting PM sign-off in queue"
        />
        <Metric
          label="Auto-Executed"
          value={track_record.auto_executed_count || 0}
          tone="ai"
          sub="Executed autonomously by agent"
        />
        <Metric
          label="Total Action Audit"
          value={track_record.total_actions || 0}
          sub="Lifetime actions recorded"
        />
      </div>

      {/* Trust Dial Card */}
      <Card>
        <CardHeader
          title="The Trust Dial (Autonomy Settings)"
          subtitle="Configure how much autonomy this agent is permitted across the project"
          action={<Shield className="h-4 w-4 text-violet-600" />}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {AUTONOMY_LEVELS.map((lvl) => {
              const isSelected = settings.level === lvl.id;
              return (
                <div
                  key={lvl.id}
                  onClick={() => !savingSetting && handleLevelChange(lvl.id)}
                  className={`cursor-pointer rounded-lg border p-4 transition-all ${
                    isSelected
                      ? "border-violet-600 bg-violet-50/50 ring-2 ring-violet-500/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Level {lvl.levelNumber}</span>
                    {isSelected ? (
                      <Badge tone="ai" dot>Active</Badge>
                    ) : (
                      <Badge tone="neutral">{lvl.badge}</Badge>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-slate-900">{lvl.name}</h3>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{lvl.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Currently configured to <strong>Level {settings.level === "suggest_only" ? 1 : settings.level === "approve_first" ? 2 : 3} ({settings.level.replace("_", " ")})</strong>.
            </span>
            <span className="text-[11px] text-slate-400">
              Autonomous execution threshold: High confidence
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Action Approval Queue */}
      <Card>
        <CardHeader
          title="Action Approval Queue"
          subtitle={`Actions currently awaiting human sign-off (${queue.length} pending)`}
          action={
            <LinkButton to="/agents/decision" variant="secondary" className="text-xs">
              Go to Decision Agent
            </LinkButton>
          }
        />
        {queue.length === 0 ? (
          <EmptyState
            title="Approval queue is clear"
            message="No actions currently waiting for approval. When the Decision Agent identifies critical bottlenecks, recommended actions appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {queue.map((item) => (
              <div key={item.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                      <Badge tone="amber">Pending Approval</Badge>
                      <Badge tone="neutral">{item.target_system.toUpperCase()}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{item.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      disabled={actingActionId === item.id}
                      onClick={() => handleApprove(item.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Approve & Execute
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actingActionId === item.id}
                      onClick={() => handleReject(item.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </div>

                {item.execution_log && (
                  <div className="rounded bg-slate-50 p-2.5 text-xs text-slate-500 font-mono border border-slate-100">
                    {item.execution_log}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Execution Audit Trail / History */}
      {history.length > 0 && (
        <Card>
          <CardHeader
            title="Action Execution Audit Trail"
            subtitle="Full log of all actions proposed, executed, approved, and rejected"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Action</th>
                  <th className="px-5 py-2.5 font-medium">System</th>
                  <th className="px-5 py-2.5 font-medium">Autonomy</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Resolved By</th>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 max-w-sm truncate">
                      {h.title}
                      {h.execution_log && (
                        <p className="text-[11px] text-slate-400 font-normal truncate mt-0.5">{h.execution_log}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs uppercase font-mono">{h.target_system}</td>
                    <td className="px-5 py-3 text-xs capitalize">{h.autonomy_level?.replace("_", " ")}</td>
                    <td className="px-5 py-3">
                      {h.status === "executed" ? (
                        <Badge tone="green">Executed</Badge>
                      ) : h.status === "rejected" ? (
                        <Badge tone="red">Rejected</Badge>
                      ) : h.status === "suggested_only" ? (
                        <Badge tone="neutral">Suggested</Badge>
                      ) : (
                        <Badge tone="amber">Pending</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">{h.resolved_by || "-"}</td>
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

