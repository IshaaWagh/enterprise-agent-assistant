import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import GitHubPage from "./pages/GitHubPage";
import JiraPage from "./pages/JiraPage";
import AgentCenterPage from "./pages/AgentCenterPage";
import ProjectAnalysisPage from "./pages/ProjectAnalysisPage";
import { AnalyticsPage, PlannedAgentPage, ReportsPage, SettingsPage } from "./pages/PlannedPages";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
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
      </Route>
    </Routes>
  );
}