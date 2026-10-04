import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { timeAgo } from "../utils";
import ActivityChart from "../components/ActivityChart";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, HEALTH,
  LoadingState, Metric, PageHeader,
} from "../components/ui";

const NODE_LABELS = { ticket: "Tickets", person: "People", commit: "Commits linked to tickets", pr: "Pull requests" };

function ChainView({ chain }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chain.map((key, i) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={`rounded-md border px-2 py-1 text-xs font-medium ${i === 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{key}</span>
          {i < chain.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        </span>
      ))}
    </div>
  );
}

export default function ProjectAnalysisPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.analysisLatest(project.id), api.activity(project.id)]),
    [project.id, version]
  );
  const [fresh, setFresh] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  useEffect(() => setFresh(null), [project.id, version]);

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      setFresh(await api.analyze(project.id));
    } catch (e) {
      setRunError(e.message);
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const analysis = fresh ?? data[0];
  const activity = data[1];
  const runButton = (
    <Button variant="ai" onClick={run} disabled={running}>
      {running ? "Analysing..." : analysis ? "Re-run analysis" : "Run analysis"}
    </Button>
  );

  const header = (
    <PageHeader
      eyebrow="AI agent 1 of 5"
      title="Project Analysis Agent"
      badge={<Badge tone="green" dot>Active</Badge>}
      description="Analyzes GitHub and Jira project activity and generates a project-state summary while maintaining the project knowledge graph."
      actions={runButton}
    />
  );

  if (!analysis) {
    return (
      <>
        {header}
        {runError && <ErrorState message={runError} />}
        <Card>
          <EmptyState title="No analysis yet" message="Run the agent to compute project statistics, build the knowledge graph, and generate an AI summary." action={runButton} />
        </Card>
      </>
    );
  }

  const { state, summary } = analysis;
  const health = HEALTH[state.health.status];
  const open = state.tickets.total - state.tickets.done;
  const totalCommits = activity.reduce((a, w) => a + w.commits, 0);
  const avgPerWeek = activity.length ? (totalCommits / activity.length).toFixed(1) : null;
  const nodeTotal = Object.values(state.graph.nodes).reduce((a, b) => a + b, 0);
  const edgeTotal = Object.values(state.graph.edges).reduce((a, b) => a + b, 0);

  return (
    <>
      {header}
      {runError && <div className="mb-4"><ErrorState message={runError} /></div>}

      <Card className="mb-6">
        <CardHeader title="Project state" subtitle={`Last analysis ${timeAgo(analysis.created_at)} · snapshot #${analysis.id}`} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={health.tone} dot>{health.label}</Badge>
            <p className="min-w-0 flex-1 text-base font-medium text-slate-900">
              {summary ? summary.headline : "AI summary unavailable. Computed analysis is shown below."}
            </p>
          </div>
          {analysis.llm_error && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              The AI summary could not be generated ({analysis.llm_error}). Every figure on this page is computed from your data.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-400">Health status uses a baseline heuristic until the Risk Prediction Agent's ML model is built.</p>
        </CardBody>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Open tickets" value={state.tickets.total ? open : "Awaiting Jira data"} muted={!state.tickets.total} />
        <Metric label="Overdue tickets" value={state.tickets.total ? state.tickets.overdue : "-"} muted={!state.tickets.total} tone={state.tickets.overdue ? "red" : undefined} />
        <Metric label="Blocked tickets" value={state.tickets.total ? state.tickets.blocked : "-"} muted={!state.tickets.total} tone={state.tickets.blocked ? "amber" : undefined} />
        <Metric label="Commit frequency" value={avgPerWeek ? `${avgPerWeek} / week` : "No commits yet"} muted={!avgPerWeek} sub={`${state.github.commits} commits total`} />
        <Metric label="Avg. time to merge" value={state.github.avg_hours_to_merge != null ? `${state.github.avg_hours_to_merge} h` : "Not enough data yet"} muted={state.github.avg_hours_to_merge == null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="AI summary" subtitle={analysis.llm_model ? `Generated by ${analysis.llm_model} from the computed data only` : undefined} action={<Badge tone="ai" dot>AI</Badge>} />
          {summary ? (
            <CardBody className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key concerns</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{summary.key_concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
              {summary.positives.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Going well</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{summary.positives.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
              <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900"><strong>Look at first:</strong> {summary.watch_next}</p>
            </CardBody>
          ) : (
            <EmptyState title="AI summary unavailable" message="Re-run the analysis once the language model is reachable." />
          )}
        </Card>

        <Card>
          <CardHeader title="Knowledge graph" subtitle={`${nodeTotal} nodes · ${edgeTotal} relationships`} action={<Button disabled title="The graph explorer needs a graph API endpoint (planned)">Explore relationships</Button>} />
          <CardBody>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {Object.entries(state.graph.nodes).map(([type, n]) => (
                <div key={type} className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{NODE_LABELS[type] ?? type}</span>
                  <span className="font-medium text-slate-900">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.entries(state.graph.edges).map(([rel, n]) => (
                <Badge key={rel}>{rel.replace("_", " ")} · {n}</Badge>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-400">Commits and pull requests join the graph when their message or title references a ticket key such as AGT-3.</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Root-cause trace" subtitle="Powered by the Project Analysis Agent's knowledge graph" />
        <CardBody>
          {state.graph.root_blockers.length === 0 ? (
            <p className="text-sm text-slate-500">No blocking dependencies found among open tickets.</p>
          ) : (
            <ul className="space-y-4">
              {state.graph.root_blockers.slice(0, 3).map((r) => (
                <li key={r.key} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{r.key} {r.title}</p>
                    <div className="flex gap-1.5">
                      {r.is_overdue && <Badge tone="red">Overdue</Badge>}
                      <Badge tone="amber">Blocks {r.blocks_open_count}</Badge>
                    </div>
                  </div>
                  <p className="mb-2 mt-3 text-xs text-slate-500">Longest dependency chain</p>
                  <ChainView chain={r.longest_chain} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-400">The full trace through pull requests, commits and people is planned. Today the graph traces ticket-to-ticket blockers.</p>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Commit activity" subtitle="Commits per week" />
          <CardBody><ActivityChart data={activity} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Tickets most at risk" subtitle="Baseline scoring, replaced by the ML model later" />
          {state.at_risk_tickets.length === 0 ? (
            <EmptyState title="Nothing flagged" />
          ) : (
            <ul className="divide-y divide-slate-100 px-5">
              {state.at_risk_tickets.slice(0, 6).map((t) => (
                <li key={t.key} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{t.key} {t.title}</p>
                    <p className="text-xs text-slate-500">{t.reasons.join(" · ")}</p>
                  </div>
                  <Badge tone={t.level === "high" ? "red" : t.level === "medium" ? "amber" : "neutral"}>{t.score}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}