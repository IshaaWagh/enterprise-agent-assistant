import { formatDate } from "../utils";
import { Badge } from "./ui";

const CATEGORY_TONE = { new: "neutral", indeterminate: "blue", done: "green" };
const PRIORITY_COLOR = {
  Highest: "text-rose-600",
  High: "text-orange-600",
  Medium: "text-amber-600",
  Low: "text-slate-500",
  Lowest: "text-slate-400",
};

export default function TicketsPanel({ tickets }) {
  if (!tickets.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">No tickets match this filter.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-2.5 font-medium">Key</th>
            <th className="px-3 py-2.5 font-medium">Title</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Priority</th>
            <th className="px-3 py-2.5 font-medium">Assignee</th>
            <th className="px-3 py-2.5 font-medium">Due</th>
            <th className="px-5 py-2.5 font-medium">Blocked by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <tr key={t.key} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">{t.key}</td>
              <td className="px-3 py-3 text-slate-800">
                {t.title} <span className="ml-1 text-xs text-slate-400">{t.ticket_type}</span>
              </td>
              <td className="px-3 py-3">
                <Badge tone={CATEGORY_TONE[t.status_category] ?? "neutral"}>{t.status}</Badge>
              </td>
              <td className={`px-3 py-3 font-medium ${PRIORITY_COLOR[t.priority] ?? ""}`}>{t.priority}</td>
              <td className="px-3 py-3 text-slate-600">{t.assignee ?? <span className="text-slate-400">Unassigned</span>}</td>
              <td className={`px-3 py-3 ${t.is_overdue ? "font-medium text-rose-600" : "text-slate-500"}`}>
                {formatDate(t.due_date)}
                {t.is_overdue && " · overdue"}
              </td>
              <td className="px-5 py-3">
                {t.blocked_by.length ? (
                  <div className="flex flex-wrap gap-1">
                    {t.blocked_by.map((k) => (
                      <Badge key={k} tone="amber">{k}</Badge>
                    ))}
                  </div>
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