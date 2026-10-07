export class ApiError extends Error {
  constructor(status, detail) {
    super(`${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

// Set by AuthContext: called when an API call returns 401 (session expired).
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

// One place for all backend calls. Cookies are sent automatically (same origin via the Vite proxy).
async function request(path, options) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join("; ");
        } catch {
      /* response had no JSON body */
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) unauthorizedHandler?.();
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  // auth
  me: () => request("/api/auth/me"),
  login: (email, password) => request("/api/auth/login", json("POST", { email, password })),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  // data
  projects: () => request("/api/projects"),
  summary: (id) => request(`/api/projects/${id}/summary`),
  activity: (id) => request(`/api/projects/${id}/activity`),
  commits: (id, limit = 8) => request(`/api/projects/${id}/commits?limit=${limit}`),
  pullRequests: (id, limit = 8) => request(`/api/projects/${id}/pull-requests?limit=${limit}`),
  tickets: (id) => request(`/api/projects/${id}/tickets`),
  ticketSummary: (id) => request(`/api/projects/${id}/tickets/summary`),
  analysisLatest: (id) => request(`/api/projects/${id}/analysis/latest`),
  analyze: (id) => request(`/api/projects/${id}/analyze`, { method: "POST" }),
  syncGithub: () => request("/api/sync/github", { method: "POST" }),
  syncJira: () => request("/api/sync/jira", { method: "POST" }),
  graph: (id) => request(`/api/projects/${id}/graph`),
  trace: (id, key) => request(`/api/projects/${id}/trace/${encodeURIComponent(key)}`),
  documents: (id) => request(`/api/projects/${id}/documents`),
  createDocument: (id, body) => request(`/api/projects/${id}/documents`, json("POST", body)),
  uploadDocument: (id, formData) => request(`/api/projects/${id}/documents/upload`, { method: "POST", body: formData }),
  deleteDocument: (id, docId) => request(`/api/projects/${id}/documents/${docId}`, { method: "DELETE" }),
  ask: (id, question) => request(`/api/projects/${id}/ask`, json("POST", { question })),
  risk: (id) => request(`/api/projects/${id}/risk`),

  // Agent 3: Resource Management
  resources: (id) => request(`/api/projects/${id}/resources`),
  simulateReassignment: (id, body) => request(`/api/projects/${id}/resources/simulate`, json("POST", body)),
  reassignTicket: (id, body) => request(`/api/projects/${id}/resources/reassign`, json("POST", body)),

  // Agent 4: Decision Agent
  decisionLatest: (id) => request(`/api/projects/${id}/decision/latest`),
  decisionHistory: (id) => request(`/api/projects/${id}/decision/history`),
  generateDecision: (id) => request(`/api/projects/${id}/decision/generate`, { method: "POST" }),

  // Agent 5: Autonomous Action Agent
  actionSettings: (id) => request(`/api/projects/${id}/actions/settings`),
  updateActionSettings: (id, body) => request(`/api/projects/${id}/actions/settings`, json("PUT", body)),
  actionQueue: (id) => request(`/api/projects/${id}/actions/queue`),
  actionHistory: (id) => request(`/api/projects/${id}/actions/history`),
  approveAction: (id, actionId) => request(`/api/projects/${id}/actions/${actionId}/approve`, { method: "POST" }),
  rejectAction: (id, actionId, reason) => request(`/api/projects/${id}/actions/${actionId}/reject`, json("POST", { reason })),
  queueActionFromDecision: (id, decisionId) => request(`/api/projects/${id}/actions/from-decision`, json("POST", { decision_id: decisionId })),
};