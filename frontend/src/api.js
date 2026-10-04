// One place for all backend calls. Throws an Error with the server's message on failure.
async function request(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* response had no JSON body */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
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
};