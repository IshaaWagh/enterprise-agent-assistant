import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./ui";

export default function ActivityChart({ data }) {
  if (!data.length) return <EmptyState message="No commit activity yet. Run a GitHub sync to begin." />;
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(d) => `Week of ${d}`} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="commits" fill="#2563eb" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}