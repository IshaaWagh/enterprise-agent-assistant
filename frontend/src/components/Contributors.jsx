export default function Contributors({ items }) {
  if (!items.length) return <p className="text-sm text-slate-500">No contributors yet.</p>;
  const max = Math.max(...items.map((i) => i.commits));
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.login}>
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-800">{c.login}</span>
            <span className="text-xs text-slate-500">{c.commits} commits</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-slate-700" style={{ width: `${(c.commits / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}