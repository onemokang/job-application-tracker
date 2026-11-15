"use strict";
/* Job tracker UI. Data comes from data.json, schools.json, roadmap.json, updates.json. */

const GATE_HASH = "b56e59e3e3ea61711b844fd3410e00ee164ed39b78807a2ec6fc6ac136240940";
const GATE_KEY = "trackerUnlocked_v1";
const THEME_KEY = "trackerTheme_v1";
const TAB_KEY = "trackerTab_v1";
const ACK_KEY = "trackerAckUpdateId_v1";
const PROG_KEY = "prepProgress_v2";
const MS = 86400000;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- dates ---------- */
const dateOnly = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const daysTo = (s) => Math.round((dateOnly(s) - today0()) / MS);
const fmt = (s) => dateOnly(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtY = (s) => dateOnly(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* ---------- state ---------- */
let DATA = { jobs: [], removed: [] };
let SCH = { schools: [] };
let ROAD = { zones: [] };
let UPD = { entries: [] };
let statusMap = {};
let PROG = loadProg();
const filters = { style: "", status: "", q: "" };
const sFilters = { kind: "", status: "" };

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
  const b = $("#themeBtn");
  if (b) b.textContent = t === "dark" ? "☀️" : "🌙";
  if (mapBuilt) buildMap();
}
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }

/* ---------- sync pill ---------- */
function setSync(state, text) {
  const p = $("#sync");
  p.className = "chip " + state;
  p.innerHTML = `<span class="dot"></span>${esc(text)}`;
}
function ensureToken() {
  if (hasToken()) return true;
  const tok = window.prompt(
    "Paste your GitHub sync token (scoped to the job-application-tracker repo).\nIt stays in this browser only."
  );
  if (tok && tok.trim()) { setToken(tok); return true; }
  return false;
}

/* ---------- banner ---------- */
function renderBanner() {
  const el = $("#banner");
  const ack = localStorage.getItem(ACK_KEY) || "";
  const fresh = (UPD.entries || []).filter((e) => e.id > ack);
  if (!fresh.length) { el.classList.add("hide"); return; }
  const rows = [];
  fresh.forEach((e) => (e.bullets || []).forEach((b) => {
    const o = typeof b === "string" ? { k: "site", text: b } : b;
    rows.push({ date: e.date, k: o.k || "site", text: o.text });
  }));
  const shown = rows.slice(0, 8);
  const LABEL = { new: "New", pay: "Pay", link: "Link", dead: "Dead", site: "Site" };
  el.innerHTML = `
    <div class="bh"><h3>What changed</h3><button class="ack" id="ackBtn">Got it</button></div>
    <ul>${shown.map((r) => `<li><span class="dt">${esc(fmt(r.date))}</span><span class="tag ${esc(r.k)}">${LABEL[r.k] || "Site"}</span><span>${esc(r.text)}</span></li>`).join("")}</ul>
    ${rows.length > shown.length ? `<div class="when" style="margin-top:6px">+${rows.length - shown.length} more</div>` : ""}`;
  el.classList.remove("hide");
  $("#ackBtn").onclick = () => {
    localStorage.setItem(ACK_KEY, fresh[0].id);
    el.classList.add("hide");
  };
}

/* ---------- jobs ---------- */
const STY = { ai: "AI-friendly", mixed: "Mixed", leetcode: "LeetCode-heavy" };
const FLOOR = { ok: "Clears $200K", level: "Needs higher level", close: "Close to $200K" };
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const statusOf = (k) => statusMap[k] || DATA.defaultStatus || "Not Applied";
const GROUPS = { 1: "Remote", 2: "Chicago", 3: "Relocate" };

function jobCard(j) {
  const applied = statusOf(j.company) === "Applied";
  const live = j.live;
  const place = [j.location, j.workMode && !String(j.location).toLowerCase().includes(j.workMode.split(/[ (]/)[0].toLowerCase()) ? j.workMode : ""].filter(Boolean).join(" · ");
  const more = [
    j.styleNote && `<div><b>Interview:</b> ${esc(j.styleNote)}</div>`,
    j.notes && `<div>${esc(j.notes)}</div>`,
    j.tc && `<div><b>Comp basis:</b> ${esc(j.tc.basis)}</div>`,
    j.styleChecked && `<div>Interview style checked ${esc(fmt(j.styleChecked))}</div>`,
  ].filter(Boolean).join("");
  return `
  <article class="card job">
    <div class="mono" style="background:hsl(${hue(j.company)} 62% 46%)">${esc(j.company[0])}</div>
    <div class="body">
      <div class="r1"><h3>${esc(j.company)}</h3>
        <span class="sty ${esc(j.style)}">${STY[j.style] || ""}</span>
        ${live ? `<span class="live"><span class="dot"></span>Live ${esc(fmt(live.checked))}</span>` : ""}
        ${j.linkDead ? `<span class="fl close">Link may be dead</span>` : ""}
      </div>
      <div class="role">${esc(j.role)}</div>
      <div class="meta">${esc(place)}</div>
      <div class="comp"><b>${esc(j.comp)}</b><span class="base">total</span>
        <span class="fl ${esc(j.floor || "ok")}">${FLOOR[j.floor] || FLOOR.ok}</span>
        ${live && live.payLabel ? `<span class="base">posted base ${esc(live.payLabel)}</span>` : ""}
      </div>
      <div class="why">${esc(j.why)}</div>
      ${more ? `<details><summary>Details</summary><div class="more">${more}</div></details>` : ""}
    </div>
    <div class="act">
      <a class="btn p" href="${esc(j.link)}" target="_blank" rel="noopener">${live ? "Apply ↗" : "Search ↗"}</a>
      <button class="btn g ${applied ? "on" : ""}" data-toggle="${esc(j.company)}">${applied ? "✓ Applied" : "Mark applied"}</button>
    </div>
  </article>`;
}

function renderJobs() {
  const q = filters.q.trim().toLowerCase();
  const list = DATA.jobs.filter((j) =>
    (!filters.style || j.style === filters.style) &&
    (!filters.status || statusOf(j.company) === filters.status) &&
    (!q || (j.company + " " + j.role + " " + j.location).toLowerCase().includes(q)));
  let html = "";
  [1, 2, 3].forEach((r) => {
    const g = list.filter((j) => (j.rank || 3) === r);
    if (g.length) html += `<div class="h">${GROUPS[r]}<span class="n">${g.length}</span></div>` + g.map(jobCard).join("");
  });
  $("#jobList").innerHTML = html || `<div class="empty">No matches</div>`;
  const applied = DATA.jobs.filter((j) => statusOf(j.company) === "Applied").length;
  const liveN = DATA.jobs.filter((j) => j.live).length;
  $("#jobStats").innerHTML =
    `<span class="chip">${DATA.jobs.length} roles</span><span class="chip">${liveN} live postings</span><span class="chip">${applied} applied</span>`;
  const rem = (DATA.removed || []);
  $("#dropped").innerHTML = rem.length ? `<details class="note"><summary>Dropped (${rem.length}): fail the $${DATA.floorK || 200}K floor</summary>
    <div class="more">${rem.map((r) => `<div><b>${esc(r.company)}</b>: ${esc(r.why)}</div>`).join("")}</div></details>` : "";
}

/* ---------- schools ---------- */
const KIND = { cs: "CS", ds: "Data sci", swe: "Software eng" };
const CHANCE = { high: "High odds", likely: "Likely", medium: "Medium" };
const GRE_H = { none: "No GRE", optional: "GRE optional", required: "GRE required" };

function nextDl(s) {
  if (s.rolling) return { rolling: true };
  const up = (s.deadlines || []).filter((d) => daysTo(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return up ? { ...up, days: daysTo(up.date) } : null;
}
function dueChip(n) {
  if (!n) return `<span class="due">Closed · next cycle TBA</span>`;
  if (n.rolling) return `<span class="due">Rolling</span>`;
  const cls = n.days === 0 ? "today" : n.days <= 7 ? "week" : n.days <= 30 ? "soon" : "";
  const t = n.days === 0 ? "Closes today" : `${fmt(n.date)} · ${n.days}d`;
  return `<span class="due ${cls}">${t}</span>`;
}
const sKey = (s) => `${s.school} · ${s.program}`;
const sortKey = (s) => { const n = nextDl(s); return !n ? 99999 : n.rolling ? 60 : n.days; };

function schoolCard(s) {
  const applied = statusOf(sKey(s)) === "Applied";
  const dls = (s.deadlines || []).map((d) =>
    `<li class="${daysTo(d.date) < 0 ? "past" : ""}">${esc(d.term)}: <b>${esc(fmtY(d.date))}</b>${d.note ? ` <span class="base">(${esc(d.note)})</span>` : ""}</li>`).join("");
  return `
  <article class="card sch"><div class="body">
    <div class="top2"><div><h3>${esc(s.school)}</h3><div class="prog">${esc(s.program)}</div></div>${dueChip(nextDl(s))}</div>
    <div class="r1" style="margin-top:8px">
      <span class="rank">${esc(s.rank)}</span><span class="k ${esc(s.kind)}">${KIND[s.kind] || ""}</span>
      <span class="k">${esc(s.gre)}</span><span class="sty ${s.chance === "medium" ? "mixed" : "ai"}">${CHANCE[s.chance] || ""}</span>
    </div>
    <div class="why">${esc(s.why)}</div>
    <div class="catch">${esc(s.catch)}</div>
    <details><summary>Deadlines & details</summary><div class="more">
      ${dls ? `<ul class="dl">${dls}</ul>` : `<div>Rolling · starts ${esc(s.starts || "")}</div>`}
      <div>${esc(s.format)}</div>${s.cost ? `<div>Tuition ${esc(s.cost)}</div>` : ""}
    </div></details>
    <div class="row" style="display:flex;gap:8px;margin-top:10px">
      <a class="btn p" href="${esc(s.link)}" target="_blank" rel="noopener">Official page ↗</a>
      <button class="btn g ${applied ? "on" : ""}" data-toggle="${esc(sKey(s))}">${applied ? "✓ Applied" : "Mark applied"}</button>
    </div>
  </div></article>`;
}

function renderSchools() {
  const list = SCH.schools.filter((s) =>
    (!sFilters.kind || s.kind === sFilters.kind) &&
    (!sFilters.status || statusOf(sKey(s)) === sFilters.status));
  let html = "";
  ["none", "optional", "required"].forEach((g) => {
    const items = list.filter((s) => s.greGroup === g).sort((a, b) => sortKey(a) - sortKey(b));
    if (items.length) html += `<div class="h">${GRE_H[g]}<span class="n">${items.length}</span></div>` + items.map(schoolCard).join("");
  });
  $("#schList").innerHTML = html || `<div class="empty">No matches</div>`;
  $("#schNote").innerHTML = `Ivy or US News top 20 · online only · ranks: ${esc(SCH.rankSource || "")} · checked ${esc(fmt(SCH.researchDate))}`;
}

/* ---------- applied toggle (jobs + schools) ---------- */
async function toggleApplied(key) {
  if (!hasToken()) {
    if (!ensureToken()) return;
    await syncAll();
  }
  statusMap[key] = statusOf(key) === "Applied" ? "Not Applied" : "Applied";
  renderJobs(); renderSchools();
  setSync("syncing", "Saving…");
  try { await pushStatusMap(statusMap); setSync("", "Synced"); }
  catch (e) { console.error(e); setSync("error", "Sync failed · saved locally"); }
}

/* ---------- prep progress ---------- */
function loadProg() {
  try { return JSON.parse(localStorage.getItem(PROG_KEY)) || { done: {}, probs: {}, updatedAt: "" }; }
  catch { return { done: {}, probs: {}, updatedAt: "" }; }
}
let pushTimer = null;
function saveProg() {
  PROG.updatedAt = new Date().toISOString();
  localStorage.setItem(PROG_KEY, JSON.stringify(PROG));
  if (!hasToken()) { setSync("error", "Not synced · tap to connect"); return; }
  setSync("syncing", "Saving…");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await pushProgress(PROG); setSync("", "Synced"); }
    catch (e) { console.error(e); setSync("error", "Sync failed · saved locally"); }
  }, 1200);
}

const allSteps = () => ROAD.zones.flatMap((z) => z.steps.map((s) => ({ ...s, zone: z })));
const stepById = (id) => allSteps().find((s) => s.id === id);
const isDone = (id) => !!PROG.done[id];
const probCount = (s) => (s.problems || []).filter((_, i) => PROG.probs[`${s.id}:${i}`]).length;

function setDone(id, v) { if (v) PROG.done[id] = 1; else delete PROG.done[id]; }
function toggleStep(id) { setDone(id, !isDone(id)); saveProg(); refreshMap(); }
function toggleProb(id, i) {
  const s = stepById(id), k = `${id}:${i}`;
  if (PROG.probs[k]) delete PROG.probs[k]; else PROG.probs[k] = 1;
  setDone(id, s.problems.every((_, n) => PROG.probs[`${id}:${n}`]));
  saveProg(); refreshMap();
}

/* ---------- prep map ---------- */
let mapBuilt = false;
const PAL = {
  meadow: { l: ["#d6f0b8", "#b9e48f"], d: ["#0d2b1c", "#123a25"], kind: "tree" },
  hills:  { l: ["#c9ebb0", "#9fd685"], d: ["#0f3322", "#15442d"], kind: "hill" },
  forest: { l: ["#a9d9a0", "#6fbb7a"], d: ["#0a2619", "#0d3322"], kind: "forest" },
  lake:   { l: ["#bfe3f5", "#8ccbe8"], d: ["#0a2036", "#0e3050"], kind: "lake" },
  desert: { l: ["#f6e3b0", "#eec978"], d: ["#2b2112", "#3b2c16"], kind: "desert" },
  ice:    { l: ["#e3f1fb", "#bddcf3"], d: ["#10243a", "#17345a"], kind: "ice" },
  castle: { l: ["#cdc7dd", "#aaa2c6"], d: ["#1a1530", "#261c44"], kind: "castle" },
  night:  { l: ["#a9c2ec", "#7f9fdc"], d: ["#080c24", "#101a44"], kind: "sky" },
  lava:   { l: ["#f7c9a8", "#ef9a70"], d: ["#2a0f0a", "#431811"], kind: "lava" },
  dawn:   { l: ["#ffe3b8", "#ffc58a"], d: ["#2a1530", "#411f3e"], kind: "sky" },
  finish: { l: ["#fff1b8", "#ffd966"], d: ["#2e2410", "#483616"], kind: "flag" },
};

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// One decoration. d = dark mode. Returns SVG markup.
function deco(kind, x, y, sc, d, r) {
  const T = (inner) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${sc.toFixed(2)})">${inner}</g>`;
  const st = d ? ` stroke="rgba(255,255,255,.28)" stroke-width="1"` : "";
  switch (kind) {
    case "tree":
    case "forest": {
      const a = d ? "#1f6b45" : "#3fa35c", b = d ? "#2b8a5a" : "#5cc377", tr = d ? "#4a3626" : "#8a6240";
      return T(`<rect x="-2" y="8" width="4" height="9" fill="${tr}"/><path d="M0,-18 L12,9 L-12,9Z" fill="${a}"${st}/><path d="M0,-27 L9,-5 L-9,-5Z" fill="${b}"${st}/>`);
    }
    case "hill": {
      const a = d ? "#1f7048" : "#6fc05a", b = d ? "#2c8f5d" : "#8fd672";
      return T(`<path d="M-34,14 Q-8,-26 20,14Z" fill="${a}"${st}/><path d="M-6,14 Q18,-14 38,14Z" fill="${b}"${st}/>`);
    }
    case "lake": {
      const w = d ? "#2f7fc0" : "#6db8e6";
      return T(`<ellipse rx="26" ry="8" fill="${w}" fill-opacity="${d ? 0.55 : 0.7}"${st}/><ellipse rx="14" ry="4" fill="none" stroke="${d ? "#9fd3ff" : "#fff"}" stroke-opacity=".55"/>`);
    }
    case "desert": {
      const g = d ? "#2f8a58" : "#4e9a4e";
      return r() > 0.4
        ? T(`<rect x="-3" y="-16" width="6" height="30" rx="3" fill="${g}"${st}/><rect x="-12" y="-6" width="5" height="12" rx="2.5" fill="${g}"${st}/><rect x="7" y="-10" width="5" height="12" rx="2.5" fill="${g}"${st}/>`)
        : T(`<path d="M-30,12 Q-6,-14 30,12Z" fill="${d ? "#5a4423" : "#e0b862"}"${st}/>`);
    }
    case "ice": {
      const a = d ? "#2c5a8c" : "#cfe3f2";
      return T(`<path d="M-24,14 L0,-22 L24,14Z" fill="${a}"${st}/><path d="M0,-22 L8,-8 L1,-11 L-6,-6Z" fill="${d ? "#e6f3ff" : "#fff"}"/>`);
    }
    case "castle": {
      const a = d ? "#33295c" : "#8f88aa", win = d ? "#ffd36b" : "#5c5575";
      return T(`<rect x="-10" y="-18" width="20" height="32" fill="${a}"${st}/><path d="M-10,-18 h4 v-5 h4 v5 h4 v-5 h4 v5" fill="${a}"${st}/><rect x="-2" y="-8" width="4" height="7" rx="2" fill="${win}"/>${d ? `<circle cx="0" cy="-5" r="9" fill="url(#glowY)" class="fk"/>` : ""}`);
    }
    case "lava": {
      const rock = d ? "#3b1a14" : "#8a4a3a";
      return r() > 0.45
        ? T(`<ellipse rx="22" ry="7" fill="#ff5a1f"${d ? "" : ' fill-opacity=".85"'}/><ellipse rx="12" ry="3.5" fill="#ffc15c"/>${d ? `<circle r="26" fill="url(#glowO)" class="fk"/>` : ""}`)
        : T(`<path d="M-16,12 L-6,-14 L6,-6 L16,12Z" fill="${rock}"${st}/>`);
    }
    case "sky": {
      const c = d ? "#25356e" : "#fff";
      return T(`<ellipse rx="26" ry="8" fill="${c}" fill-opacity="${d ? 0.8 : 0.85}"/><ellipse cx="-10" cy="-5" rx="12" ry="8" fill="${c}" fill-opacity="${d ? 0.8 : 0.85}"/><ellipse cx="8" cy="-6" rx="10" ry="7" fill="${c}" fill-opacity="${d ? 0.8 : 0.85}"/>`);
    }
    default: // flag
      return T(`<rect x="-1" y="-20" width="2" height="34" fill="${d ? "#8e98b0" : "#7a6a3a"}"/><path d="M1,-20 L18,-13 L1,-6Z" fill="#ffb300"/>`);
  }
}

// Extra lights that only show in dark mode.
function lights(kind, x, y, r, W) {
  const delay = (r() * 4).toFixed(1) + "s";
  if (["sky", "ice", "castle", "lake", "desert", "flag"].includes(kind))
    return `<circle class="tw" cx="${x}" cy="${y}" r="${(0.8 + r() * 1.4).toFixed(1)}" fill="#fff" style="animation-delay:${delay}"/>`;
  if (["tree", "forest", "hill"].includes(kind))
    return `<g class="ff" style="animation-delay:${delay}"><circle cx="${x}" cy="${y}" r="9" fill="url(#glowG)"/><circle cx="${x}" cy="${y}" r="1.8" fill="#eaff9a"/></g>`;
  if (kind === "lava")
    return `<circle class="tw" cx="${x}" cy="${y}" r="1.6" fill="#ff9a4d" style="animation-delay:${delay}"/>`;
  return "";
}

function buildMap() {
  const root = $("#map");
  const W = root.clientWidth || root.parentElement.clientWidth || 340;
  if (!W) return;
  const dark = document.documentElement.dataset.theme === "dark";
  root.innerHTML = "";
  mapBuilt = true;
  const cx = W / 2, amp = Math.min(W * 0.27, 120);
  const ZH = 104, SH = 76, PAD = 12;
  let y = PAD, k = 0;
  const pts = [{ x: cx, y: 0 }];
  const stepPt = {}, zoneBox = [], html = [], lanterns = [];

  ROAD.zones.forEach((z, zi) => {
    const top = y;
    const pips = [1, 2, 3, 4, 5].map((n) => `<i class="${n <= (z.diff || 1) ? "on" : ""}"></i>`).join("");
    html.push(`<div class="zone ${z.boss ? "boss" : ""} lv${z.diff || 1}" data-z="${z.id}" style="top:${y}px;height:${ZH - 12}px">
      <div class="zt"><span class="wd">WORLD ${zi + 1}${z.boss ? " · BOSS" : ""}</span><span class="pips" title="${esc(z.diffLabel || "")}">${pips}<em>${esc(z.diffLabel || "")}</em></span></div>
      <div class="zn"><h4>${esc(z.name)}</h4><span class="zd">${esc(fmt(z.start))} – ${esc(fmt(z.end))}</span></div>
      <div class="zg">${esc(z.goal)}</div><div class="zp"><i></i></div></div>`);
    pts.push({ x: cx, y: y + (ZH - 12) / 2 });
    y += ZH;
    z.steps.forEach((s, j) => {
      const yc = y + SH / 2;
      const x = cx + amp * Math.sin(k * 1.15 + 0.5);
      k++;
      pts.push({ x, y: yc });
      stepPt[s.id] = pts.length - 1;
      const size = s.type === "gate" ? 46 : 38, half = size / 2;
      const leftSpace = x - half - 10 - 10, rightSpace = W - 10 - (x + half + 10);
      const side = rightSpace >= leftSpace ? "r" : "l";
      const lw = Math.max(110, Math.min(250, side === "r" ? rightSpace : leftSpace));
      const lx = side === "r" ? x + half + 10 : x - half - 10 - lw;
      if (k % 3 === 0) lanterns.push({ x: side === "r" ? x - half - 14 : x + half + 14, y: yc });
      html.push(`<button class="node ${s.type === "gate" ? "boss" : ""} ${s.optional ? "opt" : ""}" data-id="${s.id}" data-n="${zi + 1}-${j + 1}" style="left:${x - half}px;top:${yc - half}px;width:${size}px;height:${size}px" aria-label="${esc(s.title)}"></button>
        <div class="lbl" data-lbl="${s.id}" style="left:${lx}px;top:${yc - 31}px;width:${lw}px;height:62px">
          <div class="s"></div><div class="t">${esc(s.title)}</div></div>`);
      y += SH;
    });
    zoneBox.push({ z, top, bottom: y, zi });
    y += 6;
  });
  y += PAD;
  pts.push({ x: cx, y: y });
  const H = y;
  root.style.height = H + "px";

  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    segs.push(`C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`);
  }
  const dFull = `M${pts[0].x},${pts[0].y}` + segs.join(" ");

  // ground: one smooth vertical gradient per world, blending into the next
  const mode = dark ? "d" : "l";
  let defs = `<radialGradient id="glowY"><stop offset="0" stop-color="#ffd36b" stop-opacity=".85"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowO"><stop offset="0" stop-color="#ff7a2b" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a2b" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowG"><stop offset="0" stop-color="#d4ff6a" stop-opacity=".8"/><stop offset="1" stop-color="#d4ff6a" stop-opacity="0"/></radialGradient>`;
  let ground = "", scene = "";
  zoneBox.forEach(({ z, top, bottom, zi }) => {
    const pal = PAL[z.theme] || PAL.meadow;
    const next = zoneBox[zi + 1] && (PAL[zoneBox[zi + 1].z.theme] || PAL.meadow);
    const y0 = zi === 0 ? 0 : top - 3, y1 = zi === zoneBox.length - 1 ? H : bottom + 3;
    defs += `<linearGradient id="g${zi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal[mode][0]}"/><stop offset=".6" stop-color="${pal[mode][1]}"/><stop offset="1" stop-color="${(next || pal)[mode][0]}"/></linearGradient>`;
    ground += `<rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" fill="url(#g${zi})"/>`;
    const r = rng(zi * 97 + 13);
    const n = Math.round((bottom - top) / 34);
    for (let i = 0; i < n; i++) {
      const px = 8 + r() * (W - 16), py = top + 100 + r() * Math.max(10, bottom - top - 110), sc = 0.75 + r() * 0.7;
      scene += deco(pal.kind, px, py, sc, dark, r);
    }
    if (dark) {
      const m = Math.round((bottom - top) / 22);
      for (let i = 0; i < m; i++) scene += lights(pal.kind, (r() * W).toFixed(0), (top + 100 + r() * Math.max(10, bottom - top - 110)).toFixed(0), r, W);
    }
  });
  if (dark) lanterns.forEach((l) => {
    scene += `<g class="fk"><circle cx="${l.x}" cy="${l.y}" r="22" fill="url(#glowY)"/><rect x="${l.x - 1}" y="${l.y}" width="2" height="12" fill="#6b5a3a"/><circle cx="${l.x}" cy="${l.y - 1}" r="3.4" fill="#ffe08a"/></g>`;
  });

  const svg = `<svg class="bg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${ground}${scene}
    <path id="pBase" d="${dFull}" fill="none" stroke="${dark ? "#6f7a93" : "#fff"}" stroke-opacity="${dark ? 0.55 : 0.9}" stroke-width="5" stroke-dasharray="2 11" stroke-linecap="round"/>
    <path id="pDone" d="${dFull}" fill="none" stroke="var(--primary)" stroke-width="6" stroke-linecap="round"/></svg>`;
  root.innerHTML = svg + html.join("");
  root._segs = segs; root._pts = pts; root._stepPt = stepPt;

  root.onclick = (e) => {
    const n = e.target.closest("[data-id]"), l = e.target.closest("[data-lbl]");
    const id = n ? n.dataset.id : l ? l.dataset.lbl : null;
    if (id) openSheet(id);
  };
  refreshMap();
}

function refreshMap() {
  const root = $("#map");
  if (!mapBuilt) { updateStats(); return; }
  const steps = allSteps();
  const nextStep = steps.find((s) => !isDone(s.id) && !s.optional);
  const t0 = today0();
  steps.forEach((s, i) => {
    const node = $(`.node[data-id="${s.id}"]`, root), lbl = $(`[data-lbl="${s.id}"]`, root);
    if (!node) return;
    const done = isDone(s.id);
    node.className = `node ${s.type === "gate" ? "boss" : ""} ${s.optional ? "opt" : ""} ${done ? "done" : ""} ${nextStep && nextStep.id === s.id ? "next" : ""}`;
    node.textContent = done ? "✓" : node.dataset.n;
    lbl.classList.toggle("done", done);
    const cnt = s.problems && s.type !== "apply" ? `${probCount(s)}/${s.problems.length}` : "";
    $(".s", lbl).innerHTML = `<span>${esc(s.src)}${s.optional ? " · optional" : ""}</span>${cnt ? `<b>${cnt}</b>` : ""}`;
  });
  ROAD.zones.forEach((z) => {
    const req = z.steps.filter((s) => !s.optional);
    const d = req.filter((s) => isDone(s.id)).length;
    const el = $(`.zone[data-z="${z.id}"]`, root);
    $(".zp i", el).style.width = (req.length ? (d / req.length) * 100 : 0) + "%";
    el.classList.toggle("late", dateOnly(z.end) < t0 && d < req.length);
  });
  // progress line: follows the unbroken run of finished steps
  let last = 0;
  for (const s of steps) { if (isDone(s.id) || s.optional) { if (isDone(s.id)) last = root._stepPt[s.id]; } else break; }
  const base = $("#pBase", root), done = $("#pDone", root);
  const total = base.getTotalLength();
  let len = 0;
  if (last > 0) {
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tmp.setAttribute("d", `M${root._pts[0].x},${root._pts[0].y}` + root._segs.slice(0, last).join(" "));
    len = tmp.getTotalLength();
  }
  done.style.strokeDasharray = `${total}`;
  done.style.strokeDashoffset = `${total - len}`;
  updateStats();
}

function updateStats() {
  const steps = allSteps().filter((s) => !s.optional);
  const d = steps.filter((s) => isDone(s.id)).length;
  const pct = steps.length ? Math.round((d / steps.length) * 100) : 0;
  const t0 = today0();
  const due = ROAD.zones.filter((z) => dateOnly(z.end) < t0).flatMap((z) => z.steps.filter((s) => !s.optional));
  const behind = due.filter((s) => !isDone(s.id)).length;
  const started = dateOnly(ROAD.start) <= t0;
  const cur = ROAD.zones.find((z) => dateOnly(z.start) <= t0 && t0 <= dateOnly(z.end));
  const state = !started ? `<span class="chip go">Starts ${esc(fmt(ROAD.start))} · ${daysTo(ROAD.start)}d</span>`
    : behind ? `<span class="chip" style="color:var(--amber)">Behind by ${behind} step${behind > 1 ? "s" : ""}</span>`
    : `<span class="chip" style="color:var(--green)">On track</span>`;
  $("#prepStats").innerHTML = `
    <div class="pstats"><span class="chip">${d}/${steps.length} steps</span>${state}
    ${cur ? `<span class="chip">Now: ${esc(cur.name)}</span>` : ""}
    <span class="chip go">Apply ${esc(fmt(ROAD.applyStart))} · ${daysTo(ROAD.applyStart)}d</span></div>
    <div class="pbar"><i style="width:${pct}%"></i></div>`;
}

function jumpNext() {
  const s = allSteps().find((x) => !isDone(x.id) && !x.optional);
  const n = s && $(`.node[data-id="${s.id}"]`);
  if (n) n.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- sheet ---------- */
function openSheet(id) {
  const s = stepById(id);
  if (!s) return;
  const done = isDone(id);
  const probs = (s.problems || []).map((p, i) =>
    `<li><label><input type="checkbox" data-p="${i}" ${PROG.probs[`${id}:${i}`] ? "checked" : ""}>${esc(p)}</label></li>`).join("");
  $("#sheetRoot").innerHTML = `
    <div id="sheetBg"></div>
    <div id="sheet" role="dialog">
      <div class="src">${esc(s.src)}${s.optional ? " · optional" : ""}</div>
      <h3>${esc(s.title)}</h3>
      <div class="when">${esc(s.zone.name)} · ${esc(fmt(s.zone.start))} – ${esc(fmt(s.zone.end))}</div>
      ${s.note ? `<div class="nt" style="margin-top:8px">${esc(s.note)}</div>` : ""}
      ${probs ? `<ul class="pl">${probs}</ul>` : ""}
      <div class="row">
        ${s.link ? `<a class="btn g" href="${esc(s.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""}
        ${s.notes ? `<a class="btn g" href="${esc(s.notes)}" target="_blank" rel="noopener">My notes ↗</a>` : ""}
        <button class="btn p" id="doneBtn">${done ? "Mark not done" : "Mark complete ✓"}</button>
      </div>
    </div>`;
  $("#sheetBg").onclick = closeSheet;
  $("#doneBtn").onclick = () => {
    if (s.problems && !done) s.problems.forEach((_, i) => { PROG.probs[`${id}:${i}`] = 1; });
    if (s.problems && done) s.problems.forEach((_, i) => { delete PROG.probs[`${id}:${i}`]; });
    toggleStep(id);
    closeSheet();
  };
  $$("#sheet input[data-p]").forEach((c) => c.onchange = () => {
    toggleProb(id, +c.dataset.p);
    $("#doneBtn").textContent = isDone(id) ? "Mark not done" : "Mark complete ✓";
  });
}
function closeSheet() { $("#sheetRoot").innerHTML = ""; }

function renderPrepStatic() {
  $("#verdict").innerHTML = `<h3>Apply from Feb 1: realistic?</h3><ul>${(ROAD.verdict || []).map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
    <div class="when" style="margin-top:8px">Pace: ${esc(ROAD.pace)} · checked ${esc(fmt(ROAD.researchDate))}</div>`;
  $("#rules").innerHTML = `<h3>3 rules</h3><ul>${(ROAD.rules || []).map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
    ${ROAD.notesRepo ? `<div class="when" style="margin-top:8px"><a href="${esc(ROAD.notesRepo)}" target="_blank" rel="noopener">My notes repo ↗</a> (private, sign in to GitHub)</div>` : ""}`;
  $("#skip").innerHTML = `<summary>Skip for now</summary><div class="more">${(ROAD.skip || []).map((v) => `<div>• ${esc(v)}</div>`).join("")}</div>`;
}

/* ---------- tabs ---------- */
function showTab(t) {
  localStorage.setItem(TAB_KEY, t);
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  ["jobs", "schools", "prep"].forEach((n) => $("#tab-" + n).classList.toggle("hide", n !== t));
  $("#fab").classList.toggle("hide", t !== "prep");
  if (t === "prep" && !mapBuilt) buildMap();
}

/* ---------- wiring ---------- */
function seg(id, obj, key, after) {
  $$(`#${id} button`).forEach((b) => b.onclick = () => {
    $$(`#${id} button`).forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    obj[key] = b.dataset.v;
    after();
  });
}

function wire() {
  $("#themeBtn").onclick = toggleTheme;
  $$(".tabs button").forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  seg("fStyle", filters, "style", renderJobs);
  seg("fStatus", filters, "status", renderJobs);
  seg("sKind", sFilters, "kind", renderSchools);
  seg("sStatus", sFilters, "status", renderSchools);
  $("#q").oninput = (e) => { filters.q = e.target.value; renderJobs(); };
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) toggleApplied(t.dataset.toggle);
  });
  $("#fab").onclick = jumpNext;
  $("#sync").onclick = async () => { if (ensureToken()) await syncAll(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (mapBuilt && !$("#tab-prep").classList.contains("hide")) buildMap(); }, 200);
  });
}

async function syncAll() {
  setSync("syncing", "Syncing…");
  const [st, pr] = await Promise.all([fetchStatusMap(), fetchProgress()]);
  if (st === null || pr === null) { setSync("error", "Sync failed · tap to reconnect"); return; }
  statusMap = st;
  const remoteNewer = (pr.updatedAt || "") > (PROG.updatedAt || "");
  if (remoteNewer) {
    PROG = { done: pr.done || {}, probs: pr.probs || {}, updatedAt: pr.updatedAt };
    localStorage.setItem(PROG_KEY, JSON.stringify(PROG));
  } else if ((PROG.updatedAt || "") > (pr.updatedAt || "")) {
    try { await pushProgress(PROG); } catch (e) { console.error(e); }
  }
  setSync("", "Synced");
  renderJobs(); renderSchools(); refreshMap();
}

async function loadJson(path) {
  const r = await fetch(path + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

async function init() {
  setSync("syncing", "Loading…");
  try {
    [DATA, SCH, ROAD] = await Promise.all([loadJson("data.json"), loadJson("schools.json"), loadJson("roadmap.json")]);
  } catch (e) {
    console.error(e);
    $("#jobList").innerHTML = `<div class="empty">Couldn't load data. Refresh.</div>`;
    setSync("error", "Load failed");
    return;
  }
  try { UPD = await loadJson("updates.json"); } catch { UPD = { entries: [] }; }

  const chk = DATA.checkedAt ? new Date(DATA.checkedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  $("#checked").textContent = chk ? `Jobs checked ${chk} · robot runs twice a day · comp = total, from levels.fyi + postings` : "";
  $("#goal").innerHTML = `Target <b>≥ $${DATA.floorK || 200}K</b> total comp`;
  $("#countdown").textContent = `Apply Feb 1 · ${daysTo(ROAD.applyStart)}d`;

  wire();
  renderBanner();
  renderJobs();
  renderSchools();
  renderPrepStatic();
  updateStats();
  showTab(localStorage.getItem(TAB_KEY) || "jobs");
  if (hasToken()) await syncAll(); else setSync("error", "Not synced · tap to connect");
}

/* ---------- gate ---------- */
async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function showApp() {
  $("#gate").classList.add("hide");
  $("#app").classList.remove("hide");
  applyTheme(document.documentElement.dataset.theme || "light");
  init();
}
async function tryUnlock() {
  if ((await sha256($("#gatePw").value)) === GATE_HASH) { localStorage.setItem(GATE_KEY, "1"); showApp(); }
  else {
    const c = $("#gate .card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
    $("#gateErr").textContent = "Incorrect password";
  }
}
if (localStorage.getItem(GATE_KEY) === "1") showApp();
else {
  $("#gateBtn").onclick = tryUnlock;
  $("#gatePw").onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
}
