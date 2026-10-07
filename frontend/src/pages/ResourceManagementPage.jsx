import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Layers,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
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
  LoadingState,
  Metric,
  PageHeader,
} from "../components/ui";

const STATUS_TONES = {
  overloaded: { label: "Overloaded", tone: "red", text: "text-rose-700", bg: "bg-rose-500" },
  balanced: { label: "Balanced", tone: "green", text: "text-emerald-700", bg: "bg-emerald-500" },
  underloaded: { label: "Spare Capacity", tone: "blue", text: "text-blue-700", bg: "bg-blue-500" },
};

export default function ResourceManagementPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.resources(project.id), [project.id, version]);

  // Simulation state
  const [simTicket, setSimTicket] = useState("");
  const [simTarget, setSimTarget] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [executingReassign, setExecutingReassign] = useState(false);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { workload = {}, ai_summary = {} } = data;
  const { members = [], suggestions = [], unassigned_tickets = [] } = workload;

  // Flatten all open tickets for simulation picker
  const allMovableTickets = members.flatMap((m) => m.open_tickets || []).concat(unassigned_tickets || []);

  async function handleSimulate(ticketKey, targetId) {
    const key = ticketKey || simTicket;
    const target = targetId !== undefined ? targetId : simTarget ? Number(simTarget) : null;
    if (!key) return;

    setSimulating(true);
    setActionSuccess(null);
    try {
      const res = await api.simulateReassignment(project.id, {
        ticket_key: key,
        target_person_id: target,
      });
      setSimulationResult(res);
      setSimTicket(key);
      if (target !== null) setSimTarget(String(target));
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  }

  async function handleApplyReassign(ticketKey, targetPersonId) {
    if (!ticketKey || !targetPersonId) return;
    setExecutingReassign(true);
    setActionSuccess(null);
    try {
      const res = await api.reassignTicket(project.id, {
        ticket_key: ticketKey,
        target_person_id: Number(targetPersonId),
      });
      setActionSuccess(res.message);
      setSimulationResult(null);
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setExecutingReassign(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI agent 3 of 5"
        title="Resource Management Agent"
        badge={<Badge tone="green" dot>Active</Badge>}
        description="Analyzes team workloads, flags overload and available capacity, and performs cross-project workload balancing with an interactive what-if simulation engine."
        actions={
          <Button onClick={reload}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh Roster
          </Button>
        }
      />

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Team Members"
          value={workload.team_size || 0}
          sub={`${workload.total_open_tickets || 0} total open tickets`}
        />
        <Metric
          label="Overloaded (> 1.3x)"
          value={workload.overloaded_count || 0}
          tone="red"
          sub="Carrying disproportionate load"
        />
        <Metric
          label="Spare Capacity (< 0.7x)"
          value={workload.underloaded_count || 0}
          tone="blue"
          sub="Available for ticket reassignment"
        />
        <Metric
          label="Avg. Load / Person"
          value={`${workload.average_tickets_per_person || 0} tickets`}
          sub={`${workload.average_points_per_person || 0} story pts / person`}
        />
      </div>

      {/* AI Workload Briefing Card */}
      {ai_summary && (
        <Card>
          <CardHeader
            title="AI Capacity & Rebalancing Briefing"
            subtitle={ai_summary.model ? `Synthesized by ${ai_summary.model}` : "Resource Management Agent"}
            action={<Badge tone="ai" dot>AI</Badge>}
          />
          <CardBody className="space-y-4">
            <p className="text-sm font-medium text-slate-900">{ai_summary.summary}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Capacity Bottlenecks
                </h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  {ai_summary.bottlenecks?.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-violet-100 bg-violet-50/50 p-3.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Strategic Rebalancing Plan
                </h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-violet-950">
                  {ai_summary.rebalancing_plan?.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Team Roster & Workload Distribution */}
      <Card>
        <CardHeader
          title="Team Workload & Capacity Roster"
          subtitle="Real-time capacity tracking across local and cross-project assignments"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Team Member</th>
                <th className="px-5 py-2.5 font-medium">Role & Skills</th>
                <th className="px-5 py-2.5 font-medium">This Project</th>
                <th className="px-5 py-2.5 font-medium">Cross-Project Load</th>
                <th className="px-5 py-2.5 font-medium">Load Ratio</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {members.map((m) => {
                const cfg = STATUS_TONES[m.status] || STATUS_TONES.balanced;
                const ratioPct = Math.min(Math.round(m.load_ratio * 50), 100);
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{m.name}</div>
                      {m.email && <div className="text-xs text-slate-400">{m.email}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-xs font-medium text-slate-800">{m.role}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.skills?.slice(0, 3).map((sk) => (
                          <span key={sk} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {sk}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-slate-900">{m.open_tickets_count}</span> open
                      <span className="text-xs text-slate-400 ml-1">({m.story_points} pts)</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-xs">
                        <span className="font-medium text-slate-800">{m.cross_project?.total_open_tickets} total tickets</span>
                        {m.cross_project?.other_projects?.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Also active on: {m.cross_project.other_projects.join(", ")}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className={cfg.text}>{m.load_ratio}x</span>
                          <span className="text-slate-400">avg</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${cfg.bg}`} style={{ width: `${ratioPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={cfg.tone}>{cfg.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Suggested Reassignments & What-if simulation */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reassignment Recommendations */}
        <Card>
          <CardHeader
            title="Suggested Workload Reassignments"
            subtitle="Automated rebalancing pairs to reduce project bottleneck risks"
          />
          <CardBody>
            {suggestions.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                Workload is balanced across the active team. No immediate reassignments needed.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/jira?key=${s.ticket_key}`} className="font-mono text-xs font-semibold text-violet-700 hover:underline">
                          {s.ticket_key}
                        </Link>
                        <span className="text-xs text-slate-600 font-medium truncate max-w-xs">{s.ticket_title}</span>
                      </div>
                      <Badge tone={s.priority === "Highest" ? "red" : "neutral"}>{s.priority}</Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700 border border-rose-200">
                        {s.from_person ? s.from_person.name : "Unassigned"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                        {s.to_person.name}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">{s.rationale}</p>
                    <p className="text-[11px] font-mono text-slate-400">{s.impact}</p>

                    <div className="pt-1 flex gap-2">
                      <Button
                        variant="secondary"
                        className="text-xs py-1 px-2.5"
                        onClick={() => handleSimulate(s.ticket_key, s.to_person.id)}
                      >
                        <Sliders className="h-3 w-3 mr-1" /> Simulate
                      </Button>
                      <Button
                        variant="primary"
                        className="text-xs py-1 px-2.5"
                        disabled={executingReassign}
                        onClick={() => handleApplyReassign(s.ticket_key, s.to_person.id)}
                      >
                        <UserCheck className="h-3 w-3 mr-1" /> Reassign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Interactive What-If Simulation Sandbox */}
        <Card>
          <CardHeader
            title="What-If Simulation Sandbox"
            subtitle="Simulate the workload impact of ticket movements before applying changes"
            action={<Sliders className="h-4 w-4 text-slate-400" />}
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Select Ticket</label>
                <select
                  value={simTicket}
                  onChange={(e) => setSimTicket(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">-- Choose a ticket --</option>
                  {allMovableTickets.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.key} - {t.title.slice(0, 30)}...
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Target Assignee</label>
                <select
                  value={simTarget}
                  onChange={(e) => setSimTarget(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">-- Choose team member --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.open_tickets_count} tickets)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ai"
                onClick={() => handleSimulate()}
                disabled={!simTicket || !simTarget || simulating}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {simulating ? "Calculating..." : "Run Simulation"}
              </Button>
              {simulationResult && simTarget && (
                <Button
                  variant="primary"
                  onClick={() => handleApplyReassign(simTicket, simTarget)}
                  disabled={executingReassign}
                >
                  Apply Reassignment
                </Button>
              )}
            </div>

            {simulationResult && (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-3">
                <p className="text-xs font-semibold text-violet-900">{simulationResult.summary}</p>
                <div className="space-y-2">
                  {simulationResult.simulated_members?.map((sm) => (
                    <div key={sm.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-violet-100">
                      <span className="font-medium text-slate-800">{sm.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">
                          {sm.before_count} → <strong className="text-slate-900">{sm.after_count}</strong> tickets
                        </span>
                        <span className="font-mono text-slate-600">
                          {sm.before_ratio}x → <strong className="text-violet-700">{sm.after_ratio}x</strong>
                        </span>
                        <Badge tone={sm.after_status === "overloaded" ? "red" : sm.after_status === "underloaded" ? "blue" : "green"}>
                          {sm.after_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

