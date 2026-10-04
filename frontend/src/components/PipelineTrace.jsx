import { CheckCircle2, ChevronRight, CircleAlert } from "lucide-react";
import { Badge, Card, CardBody, CardHeader } from "./ui";

export default function PipelineTrace({ pipeline }) {
  // Snapshots from before the pipeline existed have no trace.
  if (!pipeline?.steps?.length) return null;
  const total = pipeline.steps.reduce((sum, s) => sum + s.ms, 0);

  return (
    <Card className="mb-6">
      <CardHeader
        title="Pipeline run"
        subtitle={`Orchestrated by LangGraph · ${pipeline.steps.length} steps · ${(total / 1000).toFixed(1)} s`}
        action={<Badge tone="ai" dot>LangGraph</Badge>}
      />
      <CardBody>
        <ol className="flex flex-wrap items-center gap-y-3">
          {pipeline.steps.map((s, i) => (
            <li key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                  s.status === "ok" ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"
                }`}
              >
                {s.status === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="text-xs font-medium text-slate-800">{s.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {s.status === "ok" ? `${s.ms} ms` : `Degraded · ${s.ms} ms`}
                  </p>
                </div>
              </div>
              {i < pipeline.steps.length - 1 && <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-slate-300" />}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-400">
          The Risk Prediction, Resource Management, Decision and Autonomous Action agents will join this pipeline as additional steps.
        </p>
      </CardBody>
    </Card>
  );
}