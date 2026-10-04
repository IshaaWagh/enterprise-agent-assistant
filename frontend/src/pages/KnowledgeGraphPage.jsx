import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { formatDate } from "../utils";
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";

const COL_W = 236;
const ROW_H = 56;
const NODE_W = 182;
const NODE_H = 40;
const PAD = 28;
const HEADER_H = 26;

const EDGE_STYLE = {
  blocks: { color: "#e11d48", width: 1.8, dash: undefined, label: "blocks" },
  assigned_to: { color: "#94a3b8", width: 1.2, dash: "5 4", label: "assigned to" },
  references: { color: "#2563eb", width: 1.2, dash: "2 4", label: "references" },
  authored: { color: "#cbd5e1", width: 1.2, dash: "1 4", label: "authored" },
};
const TICKET_FILL = {
  new: ["#f1f5f9", "#cbd5e1"],
  indeterminate: ["#eff6ff", "#93c5fd"],
  done: ["#ecfdf5", "#6ee7b7"],
};
const REL_OUT = { blocks: "blocks", assigned_to: "assigned to", references: "references", authored: "authored" };
const REL_IN = { blocks: "blocked by", assigned_to: "assignee of", references: "referenced by", authored: "authored by" };

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s ?? "");
const isOverdue = (n) =>
  n.type === "ticket" && n.due_date && n.status_category !== "done" && new Date(n.due_date) < new Date(new Date().toDateString());

function computeLayout(graph, showAll) {
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const blocks = graph.edges.filter((e) => e.relation === "blocks");

  // Dependency level = length of the longest chain of blockers above a ticket.
  const incoming = {};
  blocks.forEach((e) => (incoming[e.target] ??= []).push(e.source));
  const memo = {};
  const level = (id, seen = new Set()) => {
    if (memo[id] !== undefined) return memo[id];
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const parents = incoming[id] ?? [];
    return (memo[id] = parents.length ? 1 + Math.max(...parents.map((p) => level(p, new Set(seen)))) : 0);
  };

  const inDeps = new Set(blocks.flatMap((e) => [e.source, e.target]));
  let visible = new Set(graph.nodes.map((n) => n.id));
  if (!showAll) {
    visible = new Set(inDeps);
    graph.edges.forEach((e) => {
      if (inDeps.has(e.source) || inDeps.has(e.target)) {
        visible.add(e.source);
        visible.add(e.target);
      }
    });
  }

  const vis = graph.nodes.filter((n) => visible.has(n.id));
  const evidence = vis.filter((n) => n.type === "commit" || n.type === "pr");
  const tickets = vis.filter((n) => n.type === "ticket");
  const people = vis.filter((n) => n.type === "person");
  const maxLevel = tickets.length ? Math.max(...tickets.map((t) => level(t.id))) : 0;

  const columns = [];
  if (evidence.length) columns.push({ title: "Commits and PRs", nodes: evidence });
  for (let l = 0; l <= maxLevel; l++) {
    const col = tickets.filter((t) => level(t.id) === l);
    if (col.length) columns.push({ title: l === 0 ? "Tickets · roots" : `Tickets · level ${l}`, nodes: col });
  }
  if (people.length) columns.push({ title: "People", nodes: people });

  const pos = {};
  let maxRows = 1;
  columns.forEach((col, ci) => {
    maxRows = Math.max(maxRows, col.nodes.length);
    col.nodes.forEach((n, ri) => (pos[n.id] = { x: PAD + ci * COL_W, y: PAD + HEADER_H + ri * ROW_H }));
  });

  return {
    byId,
    pos,
    columns,
    edges: graph.edges.filter((e) => pos[e.source] && pos[e.target]),
    visibleCount: vis.length,
    width: PAD * 2 + Math.max(columns.length - 1, 0) * COL_W + NODE_W,
    height: PAD * 2 + HEADER_H + maxRows * ROW_H,
  };
}

function edgePath(a, b) {
  const forward = b.x >= a.x;
  const x1 = forward ? a.x + NODE_W : a.x;
  const x2 = forward ? b.x : b.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const y2 = b.y + NODE_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function GraphNode({ node, p, dimmed, selected, onHover, onSelect }) {
  let fill = "#ffffff";
  let stroke = "#cbd5e1";
  if (node.type === "ticket") [fill, stroke] = TICKET_FILL[node.status_category] ?? TICKET_FILL.new;
  if (node.type === "commit" || node.type === "pr") stroke = "#93c5fd";
  if (node.type === "person") fill = "#f8fafc";
  const overdue = isOverdue(node);
  const sub = node.type === "person" ? "Team member" : truncate(node.title, 27);

  return (
    <g
      transform={`translate(${p.x}, ${p.y})`}
      opacity={dimmed ? 0.25 : 1}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(node.id))}
      tabIndex={0}
      role="button"
      aria-label={`${node.type} ${node.label}`}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <title>{node.title ?? node.label}</title>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill={fill}
        stroke={overdue ? "#f43f5e" : selected ? "#0f172a" : stroke}
        strokeWidth={overdue || selected ? 2 : 1}
      />
      <text x={10} y={16} fontSize={12} fontWeight={600} fill="#0f172a">
        {truncate(node.label, 24)}
      </text>
      <text x={10} y={30} fontSize={10} fill="#64748b">
        {sub}
      </text>
    </g>
  );
}

export default function KnowledgeGraphPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.graph(project.id), [project.id, version]);
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);

  const layout = useMemo(() => (data ? computeLayout(data, showAll) : null), [data, showAll]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const back = (
    <Link to="/agents/analysis" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Project Analysis Agent
    </Link>
  );

  if (!data.nodes.length) {
    return (
      <>
        {back}
        <Card><EmptyState message="The graph is empty. Sync Jira and GitHub first, then run the analysis." /></Card>
      </>
    );
  }

  const active = hover ?? selected;
  const connectedEdges = new Set();
  const connectedNodes = new Set(active ? [active] : []);
  layout.edges.forEach((e, i) => {
    if (active && (e.source === active || e.target === active)) {
      connectedEdges.add(i);
      connectedNodes.add(e.source);
      connectedNodes.add(e.target);
    }
  });

  const sel = selected ? layout.byId[selected] : null;
  const selLinks = sel
    ? data.edges.flatMap((e) => {
        if (e.source === sel.id) return [{ text: `${REL_OUT[e.relation]} ${layout.byId[e.target].label}` }];
        if (e.target === sel.id) return [{ text: `${REL_IN[e.relation]} ${layout.byId[e.source].label}` }];
        return [];
      })
    : [];

  return (
    <>
      {back}
      <PageHeader
        title="Knowledge graph"
        description="Tickets, pull requests, commits and people, and how they relate. Hover a node to trace its connections; click to inspect it."
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Show tickets without dependencies
          </label>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>{layout.visibleCount} nodes shown</Badge>
        {Object.entries(data.stats.edges).map(([rel, n]) => (
          <Badge key={rel}>{EDGE_STYLE[rel]?.label ?? rel} · {n}</Badge>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="min-w-0">
          <div className="overflow-auto p-2">
            <svg width={layout.width} height={layout.height} role="img" aria-label="Project knowledge graph">
              <defs>
                {Object.entries(EDGE_STYLE).map(([rel, s]) => (
                  <marker key={rel} id={`arrow-${rel}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={s.color} />
                  </marker>
                ))}
              </defs>

              {layout.columns.map((col, ci) => (
                <text key={ci} x={PAD + ci * COL_W} y={PAD - 4} fontSize={11} fontWeight={600} fill="#94a3b8" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {col.title}
                </text>
              ))}

              {layout.edges.map((e, i) => {
                const s = EDGE_STYLE[e.relation];
                const dim = active && !connectedEdges.has(i);
                return (
                  <path
                    key={i}
                    d={edgePath(layout.pos[e.source], layout.pos[e.target])}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={connectedEdges.has(i) ? s.width + 0.8 : s.width}
                    strokeDasharray={s.dash}
                    opacity={dim ? 0.12 : 0.9}
                    markerEnd={`url(#arrow-${e.relation})`}
                  />
                );
              })}

              {data.nodes.filter((n) => layout.pos[n.id]).map((n) => (
                <GraphNode
                  key={n.id}
                  node={n}
                  p={layout.pos[n.id]}
                  dimmed={active && !connectedNodes.has(n.id)}
                  selected={selected === n.id}
                  onHover={setHover}
                  onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
                />
              ))}
            </svg>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Legend" />
            <CardBody className="space-y-2 text-xs text-slate-600">
              {Object.entries(EDGE_STYLE).map(([rel, s]) => (
                <div key={rel} className="flex items-center gap-2">
                  <svg width="30" height="8"><line x1="0" y1="4" x2="30" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} /></svg>
                  {s.label}
                </div>
              ))}
              <p className="pt-2 text-slate-400">A red outline marks an overdue ticket. Arrows run from blocker to blocked ticket.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={sel ? "Selected" : "Details"} />
            <CardBody>
              {!sel ? (
                <p className="text-sm text-slate-500">Select a node to see its attributes and connections.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <Badge>{sel.type}</Badge>
                    <p className="mt-2 font-medium text-slate-900">{sel.label}</p>
                    {sel.title && <p className="text-slate-600">{sel.title}</p>}
                  </div>
                  {sel.type === "ticket" && (
                    <dl className="grid grid-cols-2 gap-1 text-xs">
                      <dt className="text-slate-500">Status</dt><dd className="text-slate-800">{sel.status}</dd>
                      <dt className="text-slate-500">Priority</dt><dd className="text-slate-800">{sel.priority}</dd>
                      <dt className="text-slate-500">Due</dt>
                      <dd className={isOverdue(sel) ? "font-medium text-rose-600" : "text-slate-800"}>{formatDate(sel.due_date)}{isOverdue(sel) && " · overdue"}</dd>
                    </dl>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connections</p>
                    {selLinks.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">None.</p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-slate-700">
                        {selLinks.map((l, i) => <li key={i}>{l.text}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}