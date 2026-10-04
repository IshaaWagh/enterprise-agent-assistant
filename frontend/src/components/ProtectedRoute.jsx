import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ProjectProvider } from "../context/ProjectContext";
import { ErrorState, LoadingState } from "./ui";

export default function ProtectedRoute() {
  const { status, reload } = useAuth();
  const location = useLocation();

  if (status === "loading") return <LoadingState label="Checking your session..." />;
  if (status === "error")
    return (
      <div className="p-10">
        <ErrorState message="Unable to reach the server." onRetry={reload} />
      </div>
    );
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;

  // Project data is only fetched once the user is authenticated.
  return (
    <ProjectProvider>
      <Outlet />
    </ProjectProvider>
  );
}