import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, GitCommit, GitPullRequest, User } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { formatDate, timeAgo } from "../utils";
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";

const VERDICT = {
  blocked_upstream: { label: "Blocked upstream", tone: "red" },
  self_caused: { label: "Delayed on its own", tone: "amber" },
  dependency_cycle: { label: "Circular dependency", tone: "red" },
  resolved: { label: "Already done", tone: "green" },
  no_delay_detected: { label: "No delay detected", tone: "green" },
};
const CATEGORY_TONE = { new: "neutral", indeterminate: "blue", done: "green" };

function Evidence({ ev }) {
  if (!ev.commit_count && !ev.pr_count) {
    return (
      <p className="text-xs text-slate-500">
        No linked commits or pull requests found. Links need the ticket key in a commit message or PR title.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {ev.prs.map((p) => (
        <div key={p.label} className="flex items-start gap-2 text-xs text-slate-700">
          <GitPullRequest className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <span className="font-medium">{p.label}</span> {p.title} <span className="text-slate-400">· {p.state}</span>
            {p.authors.length > 0 && <span className="text-slate-500"> · {p.authors.join(", ")}</span>}
          </span>
        </div>
      ))}
      {ev.commits.map((c) => (
        <div key={c.sha} className="flex items-start gap-2 text-xs text-slate-700">
          <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <span className="font-mono">{c.sha}</span> {c.message}
            <span className="text-slate-500">
              {c.authors.length > 0 && ` · ${c.authors.join(", ")}`} · {timeAgo(c.committed_at)}
            </span>
          </span>
        </div>
      ))}
      {ev.commit_count > ev.commits.length && (
        <p className="text-xs text-slate-400">+ {ev.commit_count - ev.commits.length} more commits</p>
      )}
    </div>
  );
}

function Step({ step, role }) {
  const border = role === "root" ? "border-rose-300" : role === "target" ? "border-slate-900" : "border-slate-200";
  return (
    <div className={`rounded-lg border-2 bg-white p-4 ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {role && (
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${role === "root" ? "text-rose-600" : "text-slate-900"}`}>
              {role === "root" ? "Root cause" : role === "both" ? "Delayed ticket and root cause" : "Delayed ticket"}
            </p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{step.key} · {step.title}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={CATEGORY_TONE[step.status_category] ?? "neutral"}>{step.status}</Badge>
          {step.priority && <Badge>{step.priority}</Badge>}
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {step.assignee ?? "Unassigned"}</span>
        <span>Due {formatDate(step.due_date)}</span>
        {step.evidence.last_activity && <span>Last linked activity {timeAgo(step.evidence.last_activity)}</span>}
      </p>

      {step.signals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {step.signals.map((s) => <Badge key={s} tone="amber">{s}</Badge>)}
        </div>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Evidence ev={step.evidence} />
      </div>
    </div>
  );
}

export default function RootCauseTracePage() {
  const { project, version } = useProject();
  const [params, setParams] = useSearchParams();

  const tickets = useAsync(() => api.tickets(project.id), [project.id, version]);

  const candidates = useMemo(() => {
    const all = tickets.data ?? [];
    const byKey = Object.fromEntries(all.map((t) => [t.key, t]));
    return all
      .filter((t) => t.status_category !== "done")
      .map((t) => ({ ...t, blocked: t.blocked_by.some((k) => byKey[k] && byKey[k].status_category !== "done") }));
  }, [tickets.data]);

  const defaultKey = (candidates.find((t) => t.blocked && t.is_overdue) ?? candidates.find((t) => t.blocked) ?? candidates[0])?.key ?? null;
  const selectedKey = params.get("ticket") ?? defaultKey;

  const trace = useAsync(
    () => (selectedKey ? api.trace(project.id, selectedKey) : Promise.resolve(null)),
    [project.id, selectedKey, version]
  );

  const back = (
    <Link to="/agents/analysis" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Project Analysis Agent
    </Link>
  );

  if (tickets.loading) return <LoadingState />;
  if (tickets.error) return <ErrorState message={tickets.error} onRetry={tickets.reload} />;
  if (!candidates.length) {
    return (
      <>
        {back}
        <Card><EmptyState message="No open tickets to trace. Sync Jira to begin." /></Card>
      </>
    );
  }

  const result = trace.data;
  const verdict = result && VERDICT[result.verdict];

  return (
    <>
      {back}
      <PageHeader
        title="Root-cause trace"
        description="Powered by the Project Analysis Agent's knowledge graph. Starting from a delayed ticket, it walks backwards through blocking tickets to the source of the delay, with the pull requests, commits and people involved."
        actions={
          <div>
            <label htmlFor="ticket" className="sr-only">Ticket to trace</label>
            <select
              id="ticket"
              value={selectedKey ?? ""}
              onChange={(e) => setParams({ ticket: e.target.value })}
              className="max-w-xs rounded-md border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {candidates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key} · {t.title}{t.is_overdue ? " (overdue)" : ""}{t.blocked ? " (blocked)" : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {trace.loading && <LoadingState label="Tracing through the knowledge graph..." />}
      {trace.error && <ErrorState message={trace.error} onRetry={trace.reload} />}

      {result && !trace.loading && (
        <>
          <Card className="mb-6">
            <CardBody>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={verdict.tone} dot>{verdict.label}</Badge>
                <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">{result.explanation}</p>
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div>
              {result.verdict === "dependency_cycle" ? (
                <Card>
                  <CardBody>
                    <p className="text-sm text-slate-700">Tickets in the cycle:</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.cycle.map((k) => <Badge key={k} tone="red">{k}</Badge>)}
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <div>
                  {result.chain.map((step, i) => {
                    const first = i === 0;
                    const last = i === result.chain.length - 1;
                    const rootCause = result.verdict === "blocked_upstream" || result.verdict === "self_caused";
                    const role = result.chain.length === 1 ? (rootCause ? "both" : "target") : first ? "root" : last ? "target" : null;
                    return (
                      <div key={step.key}>
                        <Step step={step} role={role} />
                        {!last && (
                          <div className="flex flex-col items-center py-1.5 text-xs text-slate-400">
                            <ChevronDown className="h-4 w-4" />
                            blocks
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {result.primary_cause && (
                <Card>
                  <CardHeader title="Impact" subtitle={`If ${result.primary_cause.key} is resolved`} />
                  <CardBody>
                    <p className="text-2xl font-semibold text-slate-900">{result.primary_cause.impact.count}</p>
                    <p className="text-xs text-slate-500">open ticket{result.primary_cause.impact.count !== 1 && "s"} unblocked</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {result.primary_cause.impact.keys.map((k) => <Badge key={k}>{k}</Badge>)}
                    </div>
                  </CardBody>
                </Card>
              )}

              <Card>
                <CardHeader title="People involved" />
                <CardBody>
                  {result.people.length === 0 ? (
                    <p className="text-sm text-slate-500">No people linked to this chain.</p>
                  ) : (
                    <ul className="space-y-2.5 text-sm">
                      {result.people.map((p, i) => (
                        <li key={i}>
                          <p className="font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.role}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              {result.alternatives.length > 0 && (
                <Card>
                  <CardHeader title="Other upstream blockers" subtitle="Ranked lower than the primary cause" />
                  <CardBody>
                    <ul className="space-y-3 text-sm">
                      {result.alternatives.map((a) => (
                        <li key={a.key}>
                          <p className="font-medium text-slate-800">{a.key} · {a.title}</p>
                          <p className="text-xs text-slate-500">{a.chain.join(" → ")}</p>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}