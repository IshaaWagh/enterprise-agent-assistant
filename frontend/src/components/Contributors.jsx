export default function Contributors({ items }) {
  if (!items.length) return <p className="text-sm text-slate-400">No contributors yet.</p>;
  const max = Math.max(...items.map((i) => i.commits));
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.login}>
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-700">{c.login}</span>
            <span className="text-slate-500">{c.commits} commits</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(c.commits / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}