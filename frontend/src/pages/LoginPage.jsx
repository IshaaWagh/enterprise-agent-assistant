import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";

const inputCls =
  "mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

export default function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (status === "authenticated") return <Navigate to={location.state?.from?.pathname ?? "/"} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.detail ?? "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">Project Pulse</h1>
          <p className="mt-1 text-sm text-slate-500">Enterprise Project Intelligence</p>
        </div>

        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
          <input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />

          <label htmlFor="password" className="mt-4 block text-sm font-medium text-slate-700">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />

          <Button type="submit" variant="primary" disabled={busy} className="mt-6 w-full">
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Forgot your password? Contact your workspace administrator.
        </p>
      </div>
    </div>
  );
}