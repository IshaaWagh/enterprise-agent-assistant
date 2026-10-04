import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const ProjectContext = createContext(null);
const STORAGE_KEY = "pp.projectId";

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(() => Number(localStorage.getItem(STORAGE_KEY)) || null);
  const [status, setStatus] = useState({ loading: true, error: null });
  const [version, setVersion] = useState(0); // bump to make every page refetch

  const reloadProjects = useCallback(async () => {
    setStatus({ loading: true, error: null });
    try {
      setProjects(await api.projects());
      setStatus({ loading: false, error: null });
    } catch (e) {
      setStatus({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  const value = useMemo(() => {
    const project = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;
    return {
      projects,
      project,
      loading: status.loading,
      error: status.error,
      version,
      reloadProjects,
      refresh: () => setVersion((v) => v + 1),
      selectProject: (id) => {
        localStorage.setItem(STORAGE_KEY, String(id));
        setSelectedId(id);
      },
    };
  }, [projects, selectedId, status, version, reloadProjects]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => useContext(ProjectContext);