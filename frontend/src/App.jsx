import { Navigate, Route, Routes } from "react-router-dom";
import { ProjectProvider } from "./context/ProjectContext";
import AppShell from "./components/AppShell";
import OverviewPage from "./pages/OverviewPage";
import GitHubPage from "./pages/GitHubPage";
import JiraPage from "./pages/JiraPage";
import AgentCenterPage from "./pages/AgentCenterPage";
import ProjectAnalysisPage from "./pages/ProjectAnalysisPage";
import { AnalyticsPage, PlannedAgentPage, ReportsPage, SettingsPage } from "./pages/PlannedPages";

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="risks" element={<PlannedAgentPage agentId="risk" />} />
          <Route path="jira" element={<JiraPage />} />
          <Route path="github" element={<GitHubPage />} />
          <Route path="team" element={<PlannedAgentPage agentId="resources" />} />
          <Route path="agents" element={<AgentCenterPage />} />
          <Route path="agents/analysis" element={<ProjectAnalysisPage />} />
          <Route path="agents/risk" element={<PlannedAgentPage agentId="risk" />} />
          <Route path="agents/resources" element={<PlannedAgentPage agentId="resources" />} />
          <Route path="agents/decision" element={<PlannedAgentPage agentId="decision" />} />
          <Route path="agents/actions" element={<PlannedAgentPage agentId="actions" />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProjectProvider>
  );
}