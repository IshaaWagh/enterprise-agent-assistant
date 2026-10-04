import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { timeAgo } from "./utils";
import StatCard from "./components/StatCard";
import ActivityChart from "./components/ActivityChart";
import Contributors from "./components/Contributors";
import RecentCommits from "./components/RecentCommits";
import PullRequestsTable from "./components/PullRequestsTable";

function Panel({ title, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  const [project, setProject] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const projects = await api.projects();
      if (projects.length === 0) {
        setProject(null);
        setData(null);
        return;
      }
      const p = projects[0];
      const [summary, activity, commits, prs] = await Promise.all([
        api.summary(p.id),
        api.activity(p.id),
        api.commits(p.id),
        api.pullRequests(p.id),
      ]);
      setProject(p);
      setData({ summary, activity, commits, prs });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await api.syncGithub();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const prStates = data?.summary.pull_requests ?? {};
  const totalPrs = Object.values(prStates).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Enterprise Multi-Agent AI Assistant</h1>
            <p className="text-sm text-slate-500">
              {project ? `Project: ${project.github_repo}` : "Project health dashboard"}
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? "Syncing from GitHub..." : "Sync GitHub"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Something went wrong: {error}
          </div>
        )}

        {loading && <p className="text-slate-500">Loading dashboard...</p>}

        {!loading && !data && !error && (
          <Panel title="No data yet">
            <p className="text-sm text-slate-600">
              Nothing has been synced. Click <strong>Sync GitHub</strong> to pull your repository's commits and pull requests.
            </p>
          </Panel>
        )}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Commits" value={data.summary.commits} sub={`Last: ${timeAgo(data.summary.last_commit_at)}`} />
              <StatCard
                label="Pull requests"
                value={totalPrs}
                sub={`${prStates.merged ?? 0} merged · ${prStates.open ?? 0} open · ${prStates.closed ?? 0} closed`}
              />
              <StatCard
                label="Avg. time to merge"
                value={data.summary.avg_hours_to_merge != null ? `${data.summary.avg_hours_to_merge} h` : "-"}
                sub="Created to merged"
              />
              <StatCard label="Contributors" value={data.summary.top_contributors.length} sub="Top committers shown below" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="Commit activity (per week)" className="lg:col-span-2">
                <ActivityChart data={data.activity} />
              </Panel>
              <Panel title="Top contributors">
                <Contributors items={data.summary.top_contributors} />
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Recent commits">
                <RecentCommits commits={data.commits} />
              </Panel>
              <Panel title="Recent pull requests">
                <PullRequestsTable prs={data.prs} />
              </Panel>
            </div>
          </>
        )}
      </main>
    </div>
  );
}