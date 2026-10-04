import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // status: "loading" | "authenticated" | "anonymous" | "error"
  const [state, setState] = useState({ status: "loading", user: null });

  const load = useCallback(() => {
    setState({ status: "loading", user: null });
    api
      .me()
      .then((user) => setState({ status: "authenticated", user }))
      .catch((e) => setState({ status: e.status === 401 ? "anonymous" : "error", user: null }));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: "anonymous", user: null }));
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...state,
      reload: load,
      login: async (email, password) => {
        const user = await api.login(email, password);
        setState({ status: "authenticated", user });
      },
      logout: async () => {
        try {
          await api.logout();
        } finally {
          localStorage.removeItem("pp.projectId");
          setState({ status: "anonymous", user: null });
        }
      },
    }),
    [state, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);