import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity, BarChart3, FileText, GitBranch, KanbanSquare, LayoutDashboard,
  Menu, RefreshCw, Settings, ShieldAlert, Users,BookOpen
} from "lucide-react";
import { api } from "../api";
import { AGENTS } from "../agents";
import { useProject } from "../context/ProjectContext";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import UserMenu from "./UserMenu";

const MAIN_NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/risks", label: "Risks", icon: ShieldAlert },
  { to: "/jira", label: "Jira", icon: KanbanSquare },
  { to: "/github", label: "GitHub", icon: GitBranch },
  { to: "/team", label: "Team & Resources", icon: Users },
  { to: "/documents", label: "Documents", icon: BookOpen },
];

function NavItem({ to, label, icon: Icon, end, dot, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
        }`
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot === "active" ? "bg-emerald-400" : "bg-slate-600"}`} />}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

const NavLabel = ({ children }) => (
  <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</p>
);

function Onboarding() {
  const { reloadProjects } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      await api.syncGithub();
      await reloadProjects();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <EmptyState
        title="No projects yet"
        message="Sync your GitHub repository to create the first project and start collecting data."
        action={
          <div className="space-y-3">
            <Button variant="primary" onClick={sync} disabled={busy}>
              {busy ? "Syncing from GitHub..." : "Sync GitHub"}
            </Button>
            {error && <p className="text-xs text-rose-600">{error}</p>}
          </div>
        }
      />
    </Card>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const { projects, project, loading, error, reloadProjects, selectProject, refresh } = useProject();
  const close = () => setOpen(false);

  let content;
  if (loading) content = <LoadingState />;
  else if (error) content = <ErrorState message={error} onRetry={reloadProjects} />;
  else if (!project) content = <Onboarding />;
  else content = <Outlet />;

  return (
    <div className="flex min-h-screen">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={close} />}

      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-60 flex-col overflow-y-auto bg-slate-900 px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen`}
      >
        <div className="flex items-center gap-2.5 px-3 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">Project Pulse</p>
            <p className="text-[11px] leading-tight text-slate-500">Project Intelligence</p>
          </div>
        </div>

        <nav className="flex-1">
          <NavLabel>Workspace</NavLabel>
          <div className="space-y-0.5">
            {MAIN_NAV.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={close} />
            ))}
          </div>

          <NavLabel>AI Agents</NavLabel>
          <div className="space-y-0.5">
            <NavItem to="/agents" label="Agent Center" icon={Activity} end onNavigate={close} />
            {AGENTS.map((a) => (
              <NavItem key={a.id} to={a.route} label={a.short} dot={a.status} onNavigate={close} />
            ))}
          </div>

          <NavLabel>Workspace tools</NavLabel>
          <div className="space-y-0.5">
            <NavItem to="/reports" label="Reports" icon={FileText} onNavigate={close} />
            <NavItem to="/settings" label="Settings" icon={Settings} onNavigate={close} />
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            {project && (
              <>
                <label htmlFor="project-switcher" className="sr-only">Project</label>
                <select
                  id="project-switcher"
                  value={project.id}
                  onChange={(e) => selectProject(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm font-medium text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {project.github_repo && <span className="hidden text-xs text-slate-500 sm:inline">{project.github_repo}</span>}
              </>
            )}
          </div>
                    <div className="flex items-center gap-1">
            <button onClick={refresh} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Refresh data" title="Refresh data">
              <RefreshCw className="h-4 w-4" />
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{content}</div>
        </main>
      </div>
    </div>
  );
}