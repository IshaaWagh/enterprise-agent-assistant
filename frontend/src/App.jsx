import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import GitHubPage from "./pages/GitHubPage";
import JiraPage from "./pages/JiraPage";
import AgentCenterPage from "./pages/AgentCenterPage";
import ProjectAnalysisPage from "./pages/ProjectAnalysisPage";
import RiskPredictionPage from "./pages/RiskPredictionPage";
import ResourceManagementPage from "./pages/ResourceManagementPage";
import DecisionAgentPage from "./pages/DecisionAgentPage";
import AutonomousActionPage from "./pages/AutonomousActionPage";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import RootCauseTracePage from "./pages/RootCauseTracePage";
import DocumentsPage from "./pages/DocumentsPage";
import { AnalyticsPage, ReportsPage, SettingsPage } from "./pages/PlannedPages";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="risks" element={<RiskPredictionPage />} />
          <Route path="jira" element={<JiraPage />} />
          <Route path="github" element={<GitHubPage />} />
          <Route path="team" element={<ResourceManagementPage />} />
          <Route path="agents" element={<AgentCenterPage />} />
          <Route path="agents/analysis" element={<ProjectAnalysisPage />} />
          <Route path="agents/analysis/graph" element={<KnowledgeGraphPage />} />
          <Route path="agents/analysis/trace" element={<RootCauseTracePage />} />
          <Route path="agents/risk" element={<RiskPredictionPage />} />
          <Route path="agents/resources" element={<ResourceManagementPage />} />
          <Route path="agents/decision" element={<DecisionAgentPage />} />
          <Route path="agents/actions" element={<AutonomousActionPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}