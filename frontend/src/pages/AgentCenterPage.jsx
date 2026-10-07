import { AGENTS, agentById } from "../agents";
import ArchitectureDiagram from "../components/ArchitectureDiagram";
import { Badge, Card, CardBody, CardHeader, LinkButton, PageHeader } from "../components/ui";

export default function AgentCenterPage() {
  return (
    <>
      <PageHeader
        title="AI Agent Center"
        description="Five specialised agents run in dependency order within our LangGraph multi-agent pipeline. Each agent consumes upstream outputs, identifies bottlenecks, balances capacity, formulates decisions, and executes or queues actions based on the Trust Dial."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {AGENTS.map((a) => (
          <Card key={a.id} className="flex flex-col">
            <CardBody className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Agent {a.number} of 5</p>
                <Badge tone={a.status === "active" ? "green" : "neutral"} dot>{a.status === "active" ? "Active" : "Coming soon"}</Badge>
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-900">{a.name}</h2>
              <p className="mt-2 text-sm text-slate-600">{a.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                Depends on: {a.dependsOn.length ? a.dependsOn.map((d) => agentById(d).short).join(", ") : "GitHub and Jira data"}
              </p>
            </CardBody>
            <div className="border-t border-slate-100 px-5 py-3">
              <LinkButton to={a.route} variant={a.status === "active" ? "ai" : "secondary"}>
                {a.status === "active" ? "Open Agent" : "View plan"}
              </LinkButton>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title="Multi-agent architecture" subtitle="Data flows downward; each agent builds on the previous outputs" />
        <CardBody><ArchitectureDiagram /></CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm font-semibold text-slate-900">Root-cause tracing is not a sixth agent</p>
          <p className="mt-1 text-sm text-slate-600">
            It is a capability of the Project Analysis Agent's knowledge graph: starting from a delayed ticket and walking backwards through blockers, pull requests, commits and people. Delay prediction likewise belongs to the Risk Prediction Agent.
          </p>
        </CardBody>
      </Card>
    </>
  );
}