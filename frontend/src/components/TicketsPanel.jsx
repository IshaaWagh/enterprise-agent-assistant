import { formatDate } from "../utils";

const CATEGORY_STYLES = {
  new: "bg-slate-100 text-slate-700",
  indeterminate: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_STYLES = {
  Highest: "text-rose-600",
  High: "text-orange-600",
  Medium: "text-amber-600",
  Low: "text-slate-500",
  Lowest: "text-slate-400",
};

export default function TicketsPanel({ tickets }) {
  if (!tickets.length) {
    return <p className="text-sm text-slate-400">No tickets synced yet. Click Sync Jira.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">Key</th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Priority</th>
            <th className="py-2 pr-4">Assignee</th>
            <th className="py-2 pr-4">Due</th>
            <th className="py-2">Depends on</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <tr key={t.key}>
              <td className="py-2 pr-4 font-medium text-indigo-700">{t.key}</td>
              <td className="py-2 pr-4 text-slate-800">
                {t.title}
                <span className="ml-2 text-xs text-slate-400">{t.ticket_type}</span>
              </td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[t.status_category] ?? CATEGORY_STYLES.new}`}>
                  {t.status}
                </span>
              </td>
              <td className={`py-2 pr-4 font-medium ${PRIORITY_STYLES[t.priority] ?? ""}`}>{t.priority}</td>
              <td className="py-2 pr-4 text-slate-600">{t.assignee ?? <span className="text-slate-400">Unassigned</span>}</td>
              <td className={`py-2 pr-4 ${t.is_overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                {formatDate(t.due_date)}
                {t.is_overdue && <span className="ml-1 text-xs">overdue</span>}
              </td>
              <td className="py-2">
                {t.blocked_by.length ? (
                  t.blocked_by.map((k) => (
                    <span key={k} className="mr-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {k}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}