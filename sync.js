// Tiny "backend" built on the GitHub Contents API — reads/writes status.json
// directly in the repo so status syncs across every device/browser.

const API_BASE = "https://api.github.com";
const TOKEN_KEY = "trackerSyncToken_v1";
let currentSha = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
function setToken(tok) {
  localStorage.setItem(TOKEN_KEY, tok.trim());
}
function hasToken() {
  return !!getToken();
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function apiHeaders() {
  return {
    "Authorization": `Bearer ${getToken()}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentsUrl() {
  return `${API_BASE}/repos/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/contents/${SYNC_CONFIG.path}?ref=${SYNC_CONFIG.branch}`;
}

async function fetchStatusMap() {
  if (!hasToken()) return null;
  try {
    const res = await fetch(contentsUrl(), { headers: apiHeaders() });
    if (res.status === 404) { currentSha = null; return {}; }
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
    const data = await res.json();
    currentSha = data.sha;
    const text = b64decode(data.content.replace(/\n/g, ""));
    return JSON.parse(text || "{}");
  } catch (e) {
    console.warn("Status sync read failed, falling back to local only:", e);
    return null; // signals "sync unavailable"
  }
}

async function pushStatusMap(map, retry = true) {
  if (!hasToken()) throw new Error("No sync token configured");
  const body = {
    message: `Update status: ${new Date().toISOString()}`,
    content: b64encode(JSON.stringify(map, null, 2)),
    branch: SYNC_CONFIG.branch,
  };
  if (currentSha) body.sha = currentSha;

  const res = await fetch(contentsUrl().split("?")[0], {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409 && retry) {
    // sha out of date (changed elsewhere) — refetch and retry once
    await fetchStatusMap();
    return pushStatusMap(map, false);
  }
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`);
  const data = await res.json();
  currentSha = data.content.sha;
  return true;
}
