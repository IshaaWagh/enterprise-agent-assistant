import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { timeAgo } from "../utils";

const HEALTH = {
  red: { label: "At risk", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  amber: { label: "Needs attention", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  green: { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const LEVEL = {
  high: "bg-rose-50 text-rose-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function AnalysisCard({ projectId }) {
  const [analysis, setAnalysis] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const loadLatest = useCallback(async () => {
    try {
      setAnalysis(await api.analysisLatest(projectId));
    } catch (e) {
      setError(e.message);
    }
  }, [projectId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setAnalysis(await api.analyze(projectId));
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const state = analysis?.state;
  const summary = analysis?.summary;
  const health = state && HEALTH[state.health.status];
  const roots = state?.graph.root_blockers.slice(0, 3) ?? [];

  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
            Project Analysis Agent
          </h2>
          {analysis && (
            <p className="text-xs text-slate-500">
              Analysed {timeAgo(analysis.created_at)}
              {analysis.llm_model && ` · summary by ${analysis.llm_model}`}
            </p>
          )}
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Analysing..." : analysis ? "Re-run analysis" : "Run analysis"}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Analysis failed: {error}
        </div>
      )}

      {!analysis && !running && !error && (
        <p className="text-sm text-slate-500">
          No analysis yet. Click <strong>Run analysis</strong> to compute project health, build the knowledge graph, and generate an AI briefing.
        </p>
      )}

      {analysis && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${health.cls}`}>{health.label}</span>
            <p className="min-w-0 flex-1 text-base font-medium text-slate-900">
              {summary ? summary.headline : "AI summary unavailable. Showing computed analysis below."}
            </p>
          </div>

          {analysis.llm_error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              AI summary could not be generated ({analysis.llm_error}). All figures below are computed from your data.
            </p>
          )}

          {summary && (
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Key concerns</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {summary.key_concerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
                {summary.positives.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Going well</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {summary.positives.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </>
                )}
                <p className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                  <strong>Look at first:</strong> {summary.watch_next}
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Root blockers (from knowledge graph)</h3>
                {roots.length === 0 ? (
                  <p className="text-sm text-slate-400">No blocking dependencies found.</p>
                ) : (
                  <ul className="space-y-3">
                    {roots.map((r) => (
                      <li key={r.key} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <p className="font-medium text-slate-900">
                          <span className="text-indigo-700">{r.key}</span> {r.title}
                          {r.is_overdue && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">overdue</span>}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Blocking {r.blocks_open_count} open ticket{r.blocks_open_count !== 1 && "s"} · chain: {r.longest_chain.join(" → ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {!summary && roots.length > 0 && (
            <ul className="space-y-2 text-sm text-slate-700">
              {roots.map((r) => (
                <li key={r.key}>
                  <strong>{r.key}</strong> blocks {r.blocks_open_count} open tickets ({r.longest_chain.join(" → ")})
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Tickets most at risk</h3>
            {state.at_risk_tickets.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing flagged.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {state.at_risk_tickets.slice(0, 5).map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-indigo-700">{r.key}</span>{" "}
                      <span className="text-slate-800">{r.title}</span>
                      <p className="text-xs text-slate-500">{r.reasons.join(" · ")}</p>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${LEVEL[r.level]}`}>
                      {r.score}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
            Knowledge graph: {Object.values(state.graph.nodes).reduce((a, b) => a + b, 0)} nodes,{" "}
            {Object.values(state.graph.edges).reduce((a, b) => a + b, 0)} edges. Risk scores and health use a baseline
            heuristic; the trained ML risk model replaces them in a later phase.
          </p>
        </div>
      )}
    </section>
  );
}