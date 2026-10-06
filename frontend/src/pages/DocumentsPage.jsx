import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { useProject } from "../context/ProjectContext";
import { formatDate } from "../utils";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";

const TYPES = [["meeting", "Meeting notes"], ["note", "Note"], ["document", "Document"]];
const TYPE_LABEL = Object.fromEntries(TYPES);
const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

function AddDocument({ projectId, onAdded }) {
  const [mode, setMode] = useState("paste");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("meeting");
  const [date, setDate] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "paste") {
        await api.createDocument(projectId, { title, content, source_type: type, doc_date: date || null });
      } else {
        const form = new FormData();
        form.append("file", file);
        if (title) form.append("title", title);
        form.append("source_type", type);
        if (date) form.append("doc_date", date);
        await api.uploadDocument(projectId, form);
      }
      setTitle(""); setContent(""); setFile(null); setDate("");
      onAdded();
    } catch (err) {
      setError(err.detail ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode === "paste" ? title.trim() && content.trim() : file;

  return (
    <Card>
      <CardHeader title="Add to knowledge base" subtitle="Notes and documents are indexed so you can ask questions about them" />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex gap-1.5">
            {[["paste", "Paste text"], ["file", "Upload file"]].map(([id, label]) => (
              <button type="button" key={id} onClick={() => setMode(id)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${mode === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="doc-title" className="text-sm font-medium text-slate-700">
                Title {mode === "file" && <span className="font-normal text-slate-400">(optional, defaults to the file name)</span>}
              </label>
              <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder="Sprint planning, week 12" />
            </div>
            <div>
              <label htmlFor="doc-type" className="text-sm font-medium text-slate-700">Type</label>
              <select id="doc-type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="doc-date" className="text-sm font-medium text-slate-700">Date <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {mode === "paste" ? (
            <div>
              <label htmlFor="doc-content" className="text-sm font-medium text-slate-700">Content</label>
              <textarea id="doc-content" value={content} onChange={(e) => setContent(e.target.value)} rows={7} maxLength={200000} className={inputCls} placeholder="Paste meeting notes or any project text..." />
            </div>
          ) : (
            <div>
              <label htmlFor="doc-file" className="text-sm font-medium text-slate-700">File</label>
              <input id="doc-file" type="file" accept=".txt,.md,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700" />
              <p className="mt-1 text-xs text-slate-400">.txt, .md or text-based .pdf, up to 2 MB. Scanned PDFs are not supported.</p>
            </div>
          )}

          {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Button type="submit" variant="primary" disabled={busy || !canSubmit}>{busy ? "Indexing..." : "Add document"}</Button>
        </CardBody>
      </form>
    </Card>
  );
}

function AnswerText({ text }) {
  return text.split(/(\[\d+\])/g).map((part, i) =>
    /^\[\d+\]$/.test(part) ? (
      <sup key={i} className="mx-0.5 rounded bg-violet-50 px-1 text-[11px] font-semibold text-violet-700">{part.slice(1, -1)}</sup>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function AskPanel({ projectId, hasDocs }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.ask(projectId, question));
    } catch (err) {
      setError(err.detail ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Ask your documents" subtitle="Answers use only this project's documents, with citations" action={<Badge tone="ai" dot>AI</Badge>} />
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="question" className="sr-only">Question</label>
          <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} minLength={3} maxLength={500} className={inputCls + " mt-0"} placeholder="Why is the transaction import behind schedule?" />
          <Button type="submit" variant="ai" disabled={busy || question.trim().length < 3 || !hasDocs}>{busy ? "Searching..." : "Ask"}</Button>
        </form>
        {!hasDocs && <p className="text-xs text-slate-500">Add a document first.</p>}
        {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {result?.status === "no_relevant_sources" && (
          <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-600">No relevant passages were found in the project documents, so no answer was generated.</p>
        )}
        {result?.status === "llm_unavailable" && (
          <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
            The AI could not write an answer ({result.llm_error}). The relevant passages are shown below.
          </p>
        )}
        {result?.status === "answered" && (
          <div className="rounded-md border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm leading-relaxed text-slate-800">
            <AnswerText text={result.answer} />
            <p className="mt-2 text-xs text-slate-400">Generated by {result.model} from the sources below.</p>
          </div>
        )}

        {result?.sources.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</h3>
            <ul className="space-y-2">
              {result.sources.map((s) => (
                <li key={s.n}>
                  <details className="rounded-md border border-slate-200 px-3 py-2" open={result.cited.includes(s.n)}>
                    <summary className="cursor-pointer text-sm text-slate-800">
                      <span className="font-semibold text-violet-700">[{s.n}]</span> {s.title}
                      <span className="ml-2 text-xs text-slate-400">match {Math.round(s.score * 100)}%{result.cited.includes(s.n) && " · cited"}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{s.text}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function DocumentsPage() {
  const { project, version } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.documents(project.id), [project.id, version]);
  const [deleteError, setDeleteError] = useState(null);

  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.title}"? It will be removed from search.`)) return;
    setDeleteError(null);
    try {
      await api.deleteDocument(project.id, doc.id);
      reload();
    } catch (err) {
      setDeleteError(err.detail ?? err.message);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Documents"
        description="Meeting notes and project documents. They are chunked, embedded locally, and indexed so the platform can answer questions with citations. They will also feed the Decision Agent as supporting evidence."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <AddDocument projectId={project.id} onAdded={reload} />
          <Card>
            <CardHeader title="Indexed documents" subtitle={`${data.length} in this project`} />
            {deleteError && <p className="px-5 pt-3 text-sm text-rose-600">{deleteError}</p>}
            {data.length === 0 ? (
              <EmptyState message="No documents yet. Add meeting notes or a document to begin." />
            ) : (
              <ul className="divide-y divide-slate-100 px-5">
                {data.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{d.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <Badge>{TYPE_LABEL[d.source_type] ?? d.source_type}</Badge>
                        {d.chunk_count} chunk{d.chunk_count !== 1 && "s"} · {d.char_count.toLocaleString()} characters
                        {d.doc_date && ` · ${formatDate(d.doc_date)}`}
                      </p>
                    </div>
                    <button onClick={() => remove(d)} aria-label={`Delete ${d.title}`} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <AskPanel projectId={project.id} hasDocs={data.length > 0} />
      </div>
    </>
  );
}