import { Link } from "react-router-dom";
import { api } from "../api";
import { AGENTS } from "../agents";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { timeAgo } from "../utils";
import ActivityChart from "../components/ActivityChart";
import RecentCommits from "../components/RecentCommits";
import {
  Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, HEALTH, LinkButton,
  LoadingState, Metric, PageHeader, ProgressRow,
} from "../components/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const ratioTone = (r) => (r >= 0.8 ? "green" : r >= 0.5 ? "amber" : "red");

export default function OverviewPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.summary(project.id),
        api.ticketSummary(project.id),
        api.activity(project.id),
        api.commits(project.id, 6),
        api.analysisLatest(project.id),
      ]),
    [project.id, version]
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const [gh, ts, activity, commits, analysis] = data;
  const open = ts.total - ts.done;
  const prTotal = Object.values(gh.pull_requests).reduce((a, b) => a + b, 0);
  const health = analysis ? HEALTH[analysis.state.health.status] : null;
  const roots = analysis?.state.graph.root_blockers.slice(0, 2) ?? [];
  const atRisk = analysis?.state.at_risk_tickets.slice(0, 4) ?? [];
  const summary = analysis?.summary;

  const completion = ts.total ? ts.done / ts.total : null;
  const onTime = open ? (open - ts.overdue) / open : null;
  const unblocked = open ? (open - ts.blocked) / open : null;

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={project.name}
        description="Project overview: delivery health, what needs attention, and what the AI is currently telling you."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Project health"
          value={health ? health.label : "Not analysed yet"}
          tone={health?.tone}
          muted={!health}
          sub={health ? `Baseline heuristic · ${timeAgo(analysis.created_at)}` : "Run the Project Analysis Agent"}
        />
        <Metric
          label="Open tickets"
          value={ts.total ? open : "Awaiting Jira data"}
          muted={!ts.total}
          sub={ts.total ? `${ts.overdue} overdue · ${ts.blocked} blocked` : <Link to="/jira" className="text-violet-700 hover:underline">Sync Jira</Link>}
        />
        <Metric
          label="Pull requests"
          value={prTotal || "No pull requests yet"}
          muted={!prTotal}
          sub={prTotal ? `${gh.pull_requests.merged ?? 0} merged · ${gh.pull_requests.open ?? 0} open` : undefined}
        />
        <Metric
          label="Contributors"
          value={gh.top_contributors.length}
          sub={<Link to="/team" className="text-violet-700 hover:underline">View team workload</Link>}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Delivery health" subtitle="Computed from synced Jira data" />
          <CardBody className="space-y-5">
            <ProgressRow label="Ticket completion" ratio={completion} detail={ts.total ? `${ts.done} of ${ts.total} tickets done` : "Awaiting Jira data"} />
            <ProgressRow label="On schedule" ratio={onTime} tone={onTime == null ? "neutral" : ratioTone(onTime)} detail={open ? `${ts.overdue} of ${open} open tickets overdue` : undefined} />
            <ProgressRow label="Unblocked" ratio={unblocked} tone={unblocked == null ? "neutral" : ratioTone(unblocked)} detail={open ? `${ts.blocked} of ${open} open tickets blocked` : undefined} />
            <ProgressRow label="Team capacity" ratio={0.8} detail={<Link to="/team" className="text-violet-700 hover:underline">Resource Management</Link>} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Commit activity" subtitle="Commits per week" />
          <CardBody>
            <ActivityChart data={activity} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="What needs attention" subtitle="From the Project Analysis Agent" action={atRisk.length ? <Badge>Baseline scoring</Badge> : null} />
          {!analysis ? (
            <EmptyState message="Run the Project Analysis Agent to see blockers and at-risk tickets." action={<LinkButton to="/agents/analysis" variant="ai">Open Project Analysis</LinkButton>} />
          ) : roots.length + atRisk.length === 0 ? (
            <EmptyState title="Nothing flagged" message="No blocking dependencies or at-risk tickets in the latest analysis." />
          ) : (
            <CardBody className="space-y-4">
              {roots.map((r) => (
                <div key={r.key} className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-sm">
                  <p className="font-medium text-slate-900">{r.key} {r.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">Root blocker · holding up {r.blocks_open_count} open ticket{r.blocks_open_count !== 1 && "s"}{r.is_overdue && " · overdue"}</p>
                </div>
              ))}
              <ul className="divide-y divide-slate-100">
                {atRisk.map((t) => (
                  <li key={t.key} className="flex items-start justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium text-slate-800">{t.key} {t.title}</p>
                      <p className="text-xs text-slate-500">{t.reasons.join(" · ")}</p>
                    </div>
                    <Badge tone={t.level === "high" ? "red" : t.level === "medium" ? "amber" : "neutral"}>{t.score}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="AI briefing" subtitle={analysis?.llm_model ? `Generated by ${analysis.llm_model}` : "Project Analysis Agent"} action={<Badge tone="ai" dot>AI</Badge>} />
          {!analysis ? (
            <EmptyState message="No briefing yet." action={<LinkButton to="/agents/analysis" variant="ai">Run analysis</LinkButton>} />
          ) : !summary ? (
            <EmptyState title="AI summary unavailable" message="The latest analysis completed, but the language model could not be reached. Computed figures are still shown." />
          ) : (
            <CardBody>
              <p className="text-sm font-medium text-slate-900">{summary.headline}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {summary.key_concerns.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <Link to="/agents/analysis" className="mt-4 inline-block text-sm font-medium text-violet-700 hover:underline">Open full analysis</Link>
            </CardBody>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="AI agents" subtitle="All 5 agents active" action={<Link to="/agents" className="text-xs font-medium text-violet-700 hover:underline">Agent Center</Link>} />
          <ul className="divide-y divide-slate-100 px-5">
            {AGENTS.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-700">{a.number}. {a.short}</span>
                <Badge tone={a.status === "active" ? "green" : "neutral"} dot>{a.status === "active" ? "Active" : "Planned"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent commits" subtitle="Latest activity from GitHub" action={<Link to="/github" className="text-xs font-medium text-violet-700 hover:underline">View GitHub</Link>} />
          <CardBody>
            <RecentCommits commits={commits} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}