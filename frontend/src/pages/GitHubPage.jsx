import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { timeAgo } from "../utils";
import ActivityChart from "../components/ActivityChart";
import Contributors from "../components/Contributors";
import PullRequestsTable from "../components/PullRequestsTable";
import RecentCommits from "../components/RecentCommits";
import { Button, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingState, Metric, PageHeader } from "../components/ui";

export default function GitHubPage() {
  const { project, version, refresh } = useProject();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.summary(project.id), api.activity(project.id), api.commits(project.id, 10), api.pullRequests(project.id, 10)]),
    [project.id, version]
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      await api.syncGithub();
      refresh();
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const syncButton = (
    <Button variant="primary" onClick={sync} disabled={syncing}>{syncing ? "Syncing from GitHub..." : "Sync GitHub"}</Button>
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const [gh, activity, commits, prs] = data;
  const prTotal = Object.values(gh.pull_requests).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Data source"
        title="GitHub"
        description={`${project.github_repo ?? project.name}. This activity feeds the Project Analysis Agent's statistics and knowledge graph.`}
        actions={syncButton}
      />
      {syncError && <div className="mb-4"><ErrorState message={syncError} /></div>}

      {gh.commits === 0 && prTotal === 0 ? (
        <Card><EmptyState message="Run a sync to begin." action={syncButton} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Commits" value={gh.commits} sub={`Last commit ${timeAgo(gh.last_commit_at)}`} />
            <Metric label="Pull requests" value={prTotal || "None yet"} muted={!prTotal} sub={prTotal ? `${gh.pull_requests.merged ?? 0} merged · ${gh.pull_requests.open ?? 0} open · ${gh.pull_requests.closed ?? 0} closed` : undefined} />
            <Metric label="Avg. time to merge" value={gh.avg_hours_to_merge != null ? `${gh.avg_hours_to_merge} h` : "Not enough data yet"} muted={gh.avg_hours_to_merge == null} />
            <Metric label="Contributors" value={gh.top_contributors.length} sub="Ranked by commits" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Activity trend" subtitle="Commits per week" />
              <CardBody><ActivityChart data={activity} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Contributors" />
              <CardBody><Contributors items={gh.top_contributors} /></CardBody>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Recent commits" subtitle="Ticket badges show commits that reference a Jira key" />
              <CardBody><RecentCommits commits={commits} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Pull requests" />
              <CardBody><PullRequestsTable prs={prs} /></CardBody>
            </Card>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            See how this data is analysed on the <Link to="/agents/analysis" className="font-medium text-violet-700 hover:underline">Project Analysis Agent</Link> page.
          </p>
        </>
      )}
    </>
  );
}