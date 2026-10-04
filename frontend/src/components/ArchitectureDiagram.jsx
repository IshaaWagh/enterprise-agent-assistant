import { ChevronDown } from "lucide-react";
import { agentById } from "../agents";

function Node({ title, sub, state = "neutral" }) {
  const styles = {
    active: "border-violet-300 bg-violet-50 text-violet-900",
    planned: "border-dashed border-slate-300 bg-white text-slate-500",
    neutral: "border-slate-300 bg-slate-50 text-slate-700",
  };
  return (
    <div className={`w-full rounded-lg border px-4 py-3 text-center ${styles[state]}`}>
      <p className="text-sm font-semibold">{title}</p>
      {sub && <p className="mt-0.5 text-xs opacity-80">{sub}</p>}
    </div>
  );
}

const Down = () => <ChevronDown className="mx-auto my-1.5 h-4 w-4 text-slate-400" />;
const agentNode = (id) => {
  const a = agentById(id);
  return <Node title={a.name} sub={a.status === "active" ? "Active" : "Planned"} state={a.status} />;
};

export default function ArchitectureDiagram() {
  return (
    <div className="mx-auto max-w-xl">
      <Node title="Project data" sub="GitHub · Jira" />
      <Down />
      {agentNode("analysis")}
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
        {["Knowledge graph", "Project statistics", "State summary"].map((o) => (
          <div key={o} className="rounded-md border border-violet-200 bg-white px-2 py-1.5">{o}</div>
        ))}
      </div>
      <Down />
      <div className="grid grid-cols-2 gap-3">
        {agentNode("risk")}
        {agentNode("resources")}
      </div>
      <Down />
      {agentNode("decision")}
      <Down />
      {agentNode("actions")}
      <Down />
      <Node title="Project manager / systems" sub="Approvals · Jira · Slack" />
      <div className="mt-5 flex justify-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-violet-300 bg-violet-50" /> Active today</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-slate-300" /> Planned</span>
      </div>
    </div>
  );
}