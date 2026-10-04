import { firstLine, timeAgo } from "../utils";
import { Badge } from "./ui";

export default function RecentCommits({ commits }) {
  if (!commits.length) return <p className="text-sm text-slate-500">No commits synced yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {commits.map((c) => (
        <li key={c.sha} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">{firstLine(c.message)}</p>
            {c.ticket_key && <Badge tone="blue">{c.ticket_key}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {c.author_login ?? c.author_name ?? "unknown"} · {timeAgo(c.committed_at)} ·{" "}
            <span className="text-emerald-600">+{c.additions}</span> <span className="text-rose-600">-{c.deletions}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}