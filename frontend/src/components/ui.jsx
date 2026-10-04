import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  ai: "bg-violet-50 text-violet-700 ring-violet-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
};
const TEXT_TONE = { green: "text-emerald-700", amber: "text-amber-700", red: "text-rose-700" };
const BAR_TONE = { neutral: "bg-slate-700", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500" };
const BUTTONS = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ai: "bg-violet-600 text-white hover:bg-violet-700",
};
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1";

export const HEALTH = {
  red: { label: "At risk", tone: "red" },
  amber: { label: "Needs attention", tone: "amber" },
  green: { label: "Healthy", tone: "green" },
};

export function Badge({ tone = "neutral", dot = false, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Button({ variant = "secondary", className = "", ...props }) {
  return (
    <button
      className={`${buttonBase} ${BUTTONS[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ to, variant = "secondary", children }) {
  return (
    <Link to={to} className={`${buttonBase} ${BUTTONS[variant]}`}>
      {children}
    </Link>
  );
}

export function Card({ className = "", children }) {
  return <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const CardBody = ({ className = "", children }) => <div className={`p-5 ${className}`}>{children}</div>;

export function PageHeader({ eyebrow, title, description, badge, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{eyebrow}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Metric({ label, value, sub, tone, muted = false }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-2 font-semibold tracking-tight ${
          muted ? "text-sm text-slate-500" : `text-2xl ${TEXT_TONE[tone] ?? "text-slate-900"}`
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

/** ratio is 0..1, or null when there is no data to compute it from. */
export function ProgressRow({ label, ratio, detail, tone = "neutral" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">{ratio == null ? "Not enough data yet" : `${Math.round(ratio * 100)}%`}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
        {ratio != null && (
          <div className={`h-1.5 rounded-full ${BAR_TONE[tone]}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
        )}
      </div>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

export function LoadingState({ label = "Loading project intelligence..." }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
      <AlertTriangle className="mx-auto h-5 w-5 text-rose-600" />
      <p className="mt-2 text-sm font-semibold text-rose-800">Unable to load project data.</p>
      {message && <p className="mt-1 text-xs text-rose-700">{message}</p>}
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title = "No data available yet.", message, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <Inbox className="h-6 w-6 text-slate-400" />
      <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}