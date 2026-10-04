import { firstLine, timeAgo } from "../utils";

export default function RecentCommits({ commits }) {
  if (!commits.length) return <p className="text-sm text-slate-400">No commits synced yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {commits.map((c) => (
        <li key={c.sha} className="py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">{firstLine(c.message)}</p>
            {c.ticket_key && (
              <span className="shrink-0 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {c.ticket_key}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {c.author_login ?? c.author_name ?? "unknown"} · {timeAgo(c.committed_at)} ·{" "}
            <span className="text-emerald-600">+{c.additions}</span>{" "}
            <span className="text-rose-600">-{c.deletions}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}