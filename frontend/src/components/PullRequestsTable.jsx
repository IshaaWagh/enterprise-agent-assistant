import { formatDate } from "../utils";

const STATE_STYLES = {
  merged: "bg-violet-50 text-violet-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

export default function PullRequestsTable({ prs }) {
  if (!prs.length) return <p className="text-sm text-slate-400">No pull requests synced yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Author</th>
            <th className="py-2 pr-4">State</th>
            <th className="py-2">Opened</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prs.map((pr) => (
            <tr key={pr.number}>
              <td className="py-2 pr-4 text-slate-500">{pr.number}</td>
              <td className="py-2 pr-4 font-medium text-slate-800">{pr.title}</td>
              <td className="py-2 pr-4 text-slate-600">{pr.author_login ?? "-"}</td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_STYLES[pr.state] ?? STATE_STYLES.closed}`}>
                  {pr.state}
                </span>
              </td>
              <td className="py-2 text-slate-500">{formatDate(pr.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}