import { formatDate } from "../utils";
import { Badge } from "./ui";

const STATE_TONE = { merged: "green", open: "blue", closed: "neutral" };

export default function PullRequestsTable({ prs }) {
  if (!prs.length) return <p className="text-sm text-slate-500">No pull requests synced yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="pb-2 pr-4 font-medium">#</th>
            <th className="pb-2 pr-4 font-medium">Title</th>
            <th className="pb-2 pr-4 font-medium">Author</th>
            <th className="pb-2 pr-4 font-medium">State</th>
            <th className="pb-2 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prs.map((pr) => (
            <tr key={pr.number}>
              <td className="py-2.5 pr-4 text-slate-500">{pr.number}</td>
              <td className="py-2.5 pr-4 font-medium text-slate-800">{pr.title}</td>
              <td className="py-2.5 pr-4 text-slate-600">{pr.author_login ?? "-"}</td>
              <td className="py-2.5 pr-4">
                <Badge tone={STATE_TONE[pr.state] ?? "neutral"}>{pr.state}</Badge>
              </td>
              <td className="py-2.5 text-slate-500">{formatDate(pr.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}