import { useState } from "react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import TicketsPanel from "../components/TicketsPanel";
import { Button, Card, EmptyState, ErrorState, LoadingState, Metric, PageHeader } from "../components/ui";

const FILTERS = [
  ["all", "All"], ["new", "To do"], ["indeterminate", "In progress"], ["done", "Done"], ["overdue", "Overdue"], ["blocked", "Blocked"],
];

export default function JiraPage() {
  const { project, version, refresh } = useProject();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.tickets(project.id), api.ticketSummary(project.id)]),
    [project.id, version]
  );
  const [filter, setFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      await api.syncJira();
      refresh();
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const syncButton = (
    <Button variant="primary" onClick={sync} disabled={syncing}>{syncing ? "Syncing from Jira..." : "Sync Jira"}</Button>
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const [tickets, ts] = data;
  const byKey = Object.fromEntries(tickets.map((t) => [t.key, t]));
  const isBlocked = (t) => t.status_category !== "done" && t.blocked_by.some((k) => byKey[k] && byKey[k].status_category !== "done");
  const visible = tickets.filter((t) =>
    filter === "all" ? true : filter === "overdue" ? t.is_overdue : filter === "blocked" ? isBlocked(t) : t.status_category === filter
  );

  return (
    <>
      <PageHeader
        eyebrow="Data source"
        title="Jira"
        description="Tickets and dependencies synced from Jira. Blocking links drive the knowledge graph and root-cause tracing."
        actions={syncButton}
      />
      {syncError && <div className="mb-4"><ErrorState message={syncError} /></div>}

      {ts.total === 0 ? (
        <Card><EmptyState title="Jira ingestion is not connected yet." message="No tickets have been synced. Run a sync to begin." action={syncButton} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Total" value={ts.total} />
            <Metric label="To do" value={ts.to_do} />
            <Metric label="In progress" value={ts.in_progress} />
            <Metric label="Done" value={ts.done} />
            <Metric label="Overdue" value={ts.overdue} tone={ts.overdue ? "red" : undefined} />
            <Metric label="Blocked" value={ts.blocked} tone={ts.blocked ? "amber" : undefined} />
          </div>

          <Card className="mt-6">
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${filter === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <TicketsPanel tickets={visible} />
          </Card>
        </>
      )}
    </>
  );
}