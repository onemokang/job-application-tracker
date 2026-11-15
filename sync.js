// Tiny "backend" built on the GitHub Contents API.
// Reads/writes status.json and progress.json directly in the repo so state
// syncs across every device. The token lives only in localStorage.

const API_BASE = "https://api.github.com";
const TOKEN_KEY = "trackerSyncToken_v1";
const shaByPath = {};

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(tok) { localStorage.setItem(TOKEN_KEY, tok.trim()); }
function hasToken() { return !!getToken(); }

function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decode(str) { return decodeURIComponent(escape(atob(str))); }

function apiHeaders() {
  return {
    "Authorization": `Bearer ${getToken()}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentsUrl(path) {
  return `${API_BASE}/repos/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/contents/${path}`;
}

// Returns parsed JSON, {} if the file doesn't exist yet, or null if sync failed.
async function fetchRemoteJson(path) {
  if (!hasToken()) return null;
  try {
    const res = await fetch(`${contentsUrl(path)}?ref=${SYNC_CONFIG.branch}`, { headers: apiHeaders(), cache: "no-store" });
    if (res.status === 404) { shaByPath[path] = null; return {}; }
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
    const data = await res.json();
    shaByPath[path] = data.sha;
    const text = b64decode(data.content.replace(/\n/g, ""));
    return JSON.parse(text || "{}");
  } catch (e) {
    console.warn("Sync read failed:", path, e);
    return null;
  }
}

async function pushRemoteJson(path, obj, message, retry = true) {
  if (!hasToken()) throw new Error("No sync token configured");
  const body = {
    message: `${message}: ${new Date().toISOString()}`,
    content: b64encode(JSON.stringify(obj, null, 2)),
    branch: SYNC_CONFIG.branch,
  };
  if (shaByPath[path]) body.sha = shaByPath[path];

  const res = await fetch(contentsUrl(path), {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if ((res.status === 409 || res.status === 422) && retry) {
    // sha out of date: refetch the sha and retry once
    await fetchRemoteJson(path);
    return pushRemoteJson(path, obj, message, false);
  }
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`);
  const data = await res.json();
  shaByPath[path] = data.content.sha;
  return true;
}

const fetchStatusMap = () => fetchRemoteJson(SYNC_CONFIG.path);
const pushStatusMap = (map) => pushRemoteJson(SYNC_CONFIG.path, map, "Update status");
const fetchProgress = () => fetchRemoteJson(SYNC_CONFIG.progressPath);
const pushProgress = (p) => pushRemoteJson(SYNC_CONFIG.progressPath, p, "Update prep progress");
