import { Lock } from "lucide-react";
import { AGENTS, agentById } from "../agents";
import { Badge, Card, CardBody, CardHeader, LinkButton, PageHeader } from "../components/ui";

const Section = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    <div className="mt-2 text-sm text-slate-700">{children}</div>
  </div>
);

function DecisionPreview() {
  const evidence = [
    ["GitHub", "Ingested", "green"],
    ["Jira", "Ingested", "green"],
    ["Knowledge graph", "Available", "green"],
    ["Resource data", "Planned", "neutral"],
  ];
  return (
    <Card>
      <CardHeader title="Output structure" subtitle="Layout only. No decision has been generated." />
      <CardBody className="grid gap-3 md:grid-cols-2">
        {["Most important issue", "Root cause", "Recommended action", "Confidence"].map((label) => (
          <div key={label} className="rounded-md border border-dashed border-slate-300 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm text-slate-400">Produced by the Decision Agent</p>
          </div>
        ))}
        <div className="rounded-md border border-dashed border-slate-300 p-4 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence sources</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {evidence.map(([name, state, tone]) => <Badge key={name} tone={tone}>{name} · {state}</Badge>)}
          </div>
          <p className="mt-3 text-xs text-slate-400">The agent will show conclusions, evidence and contributing factors, not internal reasoning.</p>
        </div>
      </CardBody>
    </Card>
  );
}

function ActionPreview() {
  const levels = [
    ["Suggest Only", "The agent recommends; a person acts."],
    ["Approve First", "The agent drafts the action; a person approves it before execution."],
    ["Fully Autonomous", "The agent executes within configured limits."],
  ];
  return (
    <>
      <Card>
        <CardHeader title="Trust / autonomy dial" subtitle="Preview only. Not active until the Autonomous Action Agent is built." action={<Lock className="h-4 w-4 text-slate-400" />} />
        <CardBody className="grid gap-3 md:grid-cols-3">
          {levels.map(([name, text], i) => (
            <div key={name} className="rounded-md border border-slate-200 bg-slate-50 p-4 opacity-70">
              <p className="text-xs text-slate-400">Level {i + 1}</p>
              <p className="text-sm font-semibold text-slate-700">{name}</p>
              <p className="mt-1 text-xs text-slate-500">{text}</p>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Action queue" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>{["Recommendation", "Status", "Approval", "Execution"].map((h) => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">No actions queued. Actions appear here once the Decision Agent produces recommendations.</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export function PlannedAgentPage({ agentId }) {
  const a = agentById(agentId);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`AI agent ${a.number} of 5`} title={a.name} badge={<Badge dot>Coming soon</Badge>} description={a.description} />
      <Card>
        <CardBody className="grid gap-6 md:grid-cols-2">
          <Section title="Input">{a.input}</Section>
          <Section title="Output">{a.output}</Section>
          <Section title="Depends on">
            <div className="flex flex-wrap gap-2">
              {a.dependsOn.length === 0 && <span className="text-slate-500">GitHub and Jira data</span>}
              {a.dependsOn.map((d) => (
                <Badge key={d} tone={agentById(d).status === "active" ? "green" : "neutral"} dot>
                  {agentById(d).short} · {agentById(d).status === "active" ? "Active" : "Planned"}
                </Badge>
              ))}
            </div>
          </Section>
          <Section title="This page will show">
            <ul className="list-disc space-y-1 pl-5">{a.willShow.map((w) => <li key={w}>{w}</li>)}</ul>
          </Section>
        </CardBody>
      </Card>
      {a.id === "decision" && <DecisionPreview />}
      {a.id === "actions" && <ActionPreview />}
      <LinkButton to="/agents">Back to Agent Center</LinkButton>
    </div>
  );
}

const PlannedList = ({ items }) => (
  <Card>
    <ul className="divide-y divide-slate-100 px-5">
      {items.map(([name, text]) => (
        <li key={name} className="flex items-start justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{text}</p>
          </div>
          <Badge>Planned</Badge>
        </li>
      ))}
    </ul>
  </Card>
);

export function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Exportable reports are generated from agent outputs. None have been built yet, so none are shown." />
      <PlannedList
        items={[
          ["Project Health Report", "Delivery health and trends. Needs the Project Analysis Agent history."],
          ["Risk Report", "Late-ticket probabilities and factors. Needs the Risk Prediction Agent."],
          ["Resource Report", "Workload and capacity. Needs the Resource Management Agent."],
          ["AI Decision Report", "Recommendations with evidence. Needs the Decision Agent."],
          ["Action History", "Executed and approved actions. Needs the Autonomous Action Agent."],
        ]}
      />
    </>
  );
}

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="Trends over time need repeated analyses and historical data, which are being collected." />
      <PlannedList
        items={[
          ["Delivery trends", "Ticket flow and cycle time across weeks."],
          ["Forecast accuracy", "How well past risk predictions matched real outcomes (calibration)."],
          ["Agent track record", "Approved vs rejected recommendations."],
        ]}
      />
      <div className="mt-4"><LinkButton to="/github">View commit activity trend</LinkButton></div>
    </>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Workspace configuration. Not built yet." />
      <PlannedList
        items={[
          ["Users and project access", "Needs the authentication and authorization step."],
          ["Integrations", "Connection status for GitHub, Jira and Slack."],
          ["Autonomy level", "The trust dial, owned by the Autonomous Action Agent."],
        ]}
      />
    </>
  );
}

export { AGENTS };