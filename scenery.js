"use strict";
/* Prep map worlds. Each world has its own palette (light + dark), static scenery (deco)
   and moving objects (amb). c = { top, bottom, W, d (dark), r (seeded random) }. */

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const T = (x, y, sc, inner) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${sc.toFixed(2)})">${inner}</g>`;
const A = (cls, style, inner) => `<g class="${cls}" style="${style}">${inner}</g>`;
const RX = (c) => 8 + c.r() * (c.W - 16);
const RY = (c) => c.top + 100 + c.r() * Math.max(10, c.bottom - c.top - 110);
const BT = (c, a, b) => a + c.r() * (b - a);
const dl = (c, max) => `-${(c.r() * max).toFixed(1)}s`;
const stk = (d) => (d ? ` stroke="rgba(255,255,255,.28)" stroke-width="1"` : "");

/* moving helpers */
const drift = (c, y, dur, inner) => A("drift", `--dx:${c.W + 130}px;animation-duration:${dur.toFixed(0)}s;animation-delay:${dl(c, dur)}`, T(0, y, 1, inner));
const fall = (c, x, dur, sx, inner, cls = "fall") => A(cls, `--dy:${(c.bottom - c.top - 100).toFixed(0)}px;--sx:${sx}px;animation-duration:${dur.toFixed(1)}s;animation-delay:${dl(c, dur)}`, T(x, c.top + 100, 1, inner));
const rise = (c, x, y, h, dur, inner) => A("rise", `--dy:${h}px;animation-duration:${dur.toFixed(1)}s;animation-delay:${dl(c, dur)}`, T(x, y, 1, inner));
const stars = (c, n) => { let s = ""; for (let i = 0; i < n; i++) s += `<circle class="tw" cx="${RX(c).toFixed(0)}" cy="${RY(c).toFixed(0)}" r="${(0.8 + c.r() * 1.4).toFixed(1)}" fill="#fff" style="animation-delay:${dl(c, 4)}"/>`; return s; };
const shoot = (c) => A("shoot", `animation-delay:${dl(c, 12)}`, T(RX(c) * 0.6, RY(c), 1, `<path d="M0,0 L-26,-10" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`));
const flies = (c, n) => { let s = ""; for (let i = 0; i < n; i++) s += `<g class="ff" style="animation-delay:${dl(c, 5)}"><circle cx="${RX(c).toFixed(0)}" cy="${RY(c).toFixed(0)}" r="9" fill="url(#glowG)"/><circle cx="${RX(c).toFixed(0)}" cy="${RY(c).toFixed(0)}" r="1.8" fill="#eaff9a"/></g>`; return s; };

/* shared shapes */
const cloud = (d, o = 0.85) => { const f = d ? "#3a4c88" : "#fff"; return `<ellipse rx="26" ry="8" fill="${f}" fill-opacity="${o}"/><ellipse cx="-10" cy="-5" rx="12" ry="8" fill="${f}" fill-opacity="${o}"/><ellipse cx="8" cy="-6" rx="10" ry="7" fill="${f}" fill-opacity="${o}"/>`; };
const bird = (col) => `<g class="flap"><path d="M-7,0 Q-3.5,-6 0,0 Q3.5,-6 7,0" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/></g>`;
const pine = (d, a, b) => `<rect x="-2" y="8" width="4" height="9" fill="${d ? "#4a3626" : "#8a6240"}"/><path d="M0,-18 L12,9 L-12,9Z" fill="${a}"${stk(d)}/><path d="M0,-27 L9,-5 L-9,-5Z" fill="${b}"${stk(d)}/>`;
const flag = (col, h = 0) => `<rect x="-1" y="${-20 - h}" width="2" height="${34 + h}" fill="#8e98b0"/><g class="wave"><path d="M1,${-20 - h} L18,${-13 - h} L1,${-6 - h}Z" fill="${col}"/></g>`;

const WORLDS = {
  /* 1 · Python Camp: meadow, tents, flowers */
  camp: {
    l: ["#d6f0b8", "#b9e48f"], d: ["#0d2b1c", "#123a25"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.35) return T(x, y, s, `<path d="M-15,12 L0,-14 L15,12Z" fill="${d ? "#8d4f33" : "#e8734a"}"${stk(d)}/><path d="M0,-14 L6,12 L-6,12Z" fill="${d ? "#1b0f0a" : "#7a3b24"}"/>${d ? `<circle cy="4" r="16" fill="url(#glowY)" class="fk"/>` : ""}`);
      if (k < 0.7) return T(x, y, s, pine(d, d ? "#1f6b45" : "#3fa35c", d ? "#2b8a5a" : "#5cc377"));
      return T(x, y, s, [-6, 0, 6].map((o, i) => `<circle cx="${o}" cy="${i % 2 ? 2 : -2}" r="3" fill="${["#ff6f91", "#ffd166", "#b28dff"][i]}"/>`).join("") + `<path d="M-6,0 v10 M0,2 v8 M6,0 v10" stroke="#3a8a4a" stroke-width="1.2"/>`);
    },
    amb(c) {
      let s = "";
      if (!c.d) {
        for (let i = 0; i < 4; i++) s += A("flit", `animation-duration:${(16 + c.r() * 8).toFixed(1)}s;animation-delay:${dl(c, 20)}`, T(RX(c), RY(c), 1, `<g class="flapx"><ellipse cx="-3" rx="3.6" ry="2.6" fill="#ff8fab"/><ellipse cx="3" rx="3.6" ry="2.6" fill="#ffb86b"/></g>`));
        for (let i = 0; i < 2; i++) s += drift(c, c.top + 120 + c.r() * 60, 70 + c.r() * 30, cloud(false));
      } else s += flies(c, 14);
      return s;
    },
  },

  /* 2 · Foothills: rolling hills, windmills, sheep */
  hills: {
    l: ["#c9ebb0", "#9fd685"], d: ["#0f3322", "#15442d"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.45) return T(x, y, s, `<path d="M-34,14 Q-8,-26 20,14Z" fill="${d ? "#1f7048" : "#6fc05a"}"${stk(d)}/><path d="M-6,14 Q18,-14 38,14Z" fill="${d ? "#2c8f5d" : "#8fd672"}"${stk(d)}/>`);
      if (k < 0.75) return T(x, y, s, `<ellipse rx="8" ry="5.5" fill="${d ? "#cfd6e6" : "#fff"}"/><circle cx="8" cy="-1" r="2.8" fill="${d ? "#4a5068" : "#3a3a44"}"/><path d="M-4,5 v4 M3,5 v4" stroke="#3a3a44" stroke-width="1.4"/>`);
      return T(x, y, s, `<path d="M-8,16 L-4,-8 L4,-8 L8,16Z" fill="${d ? "#6b5a4a" : "#e7d9c4"}"${stk(d)}/>${d ? `<rect x="-1.5" y="2" width="3" height="5" fill="#ffd36b"/>` : ""}<g class="spin"><path d="M0,-18 V18 M-18,0 H18" transform="translate(0,-9)" stroke="${d ? "#9aa3b8" : "#a47c4f"}" stroke-width="2.6" stroke-linecap="round"/></g><circle cy="-9" r="2.4" fill="${d ? "#9aa3b8" : "#7a5a36"}"/>`);
    },
    amb(c) {
      let s = "";
      if (!c.d) {
        for (let i = 0; i < 3; i++) s += drift(c, c.top + 115 + c.r() * 80, 65 + c.r() * 30, cloud(false));
        for (let i = 0; i < 2; i++) s += drift(c, c.top + 130 + c.r() * 120, 55 + c.r() * 20, bird("#53606e"));
      } else { s += stars(c, 18) + shoot(c); for (let i = 0; i < 2; i++) s += drift(c, c.top + 120 + c.r() * 100, 90, cloud(true, 0.5)); }
      return s;
    },
  },

  /* 3 · Pine Forest: swaying pines, mushrooms, falling leaves */
  forest: {
    l: ["#a9d9a0", "#6fbb7a"], d: ["#0a2619", "#0d3322"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.75) return A("sway", `animation-delay:${dl(c, 4)}`, T(x, y, s, pine(d, d ? "#1b6a43" : "#2e8f4e", d ? "#2b8a5a" : "#49b36a")));
      if (k < 0.9) return T(x, y, s, `<path d="M-6,6 Q0,-8 6,6Z" fill="${d ? "#9c3b3b" : "#e5484d"}"${stk(d)}/><circle cx="-2" cy="0" r="1.2" fill="#fff"/><circle cx="2" cy="2" r="1" fill="#fff"/><rect x="-1.4" y="6" width="2.8" height="6" fill="${d ? "#cfd6e6" : "#f5ecd8"}"/>`);
      return T(x, y, s, `<rect x="-9" y="-4" width="18" height="10" rx="3" fill="${d ? "#4a3626" : "#8a6240"}"/><ellipse cx="-9" cy="1" rx="2.6" ry="5" fill="${d ? "#6b4f38" : "#b98a5a"}"/>`);
    },
    amb(c) {
      let s = "";
      const cols = c.d ? ["#c47a3a", "#b08a2a"] : ["#f08a24", "#f2c230", "#e2582b"];
      for (let i = 0; i < (c.d ? 4 : 10); i++) s += fall(c, RX(c), 14 + c.r() * 8, (c.r() * 60 - 30).toFixed(0), `<path d="M0,-4 Q4,0 0,5 Q-4,0 0,-4Z" fill="${cols[i % cols.length]}"/>`, "fall spinfall");
      if (c.d) s += flies(c, 12);
      return s;
    },
  },

  /* 4 · Lake: ripples, lily pads, boats, reeds */
  lake: {
    l: ["#bfe3f5", "#8ccbe8"], d: ["#0a2036", "#0e3050"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.4) return T(x, y, s, `<ellipse rx="28" ry="9" fill="${d ? "#2f7fc0" : "#6db8e6"}" fill-opacity="${d ? 0.5 : 0.7}"${stk(d)}/>`);
      if (k < 0.65) return T(x, y, s, `<ellipse rx="8" ry="3.6" fill="${d ? "#2f8a58" : "#4aa86a"}"/><circle cx="1" cy="-2" r="2.2" fill="#ff8fb1"/>`);
      if (k < 0.85) return A("bob", `animation-delay:${dl(c, 3)}`, T(x, y, s, `<path d="M-12,2 L12,2 L8,9 L-8,9Z" fill="${d ? "#8d4f33" : "#c8642f"}"/><path d="M0,2 V-14 L10,0Z" fill="${d ? "#cfd6e6" : "#fff"}"/>${d ? `<circle cy="-4" r="14" fill="url(#glowY)" class="fk"/>` : ""}`));
      return A("sway", `animation-delay:${dl(c, 3)}`, T(x, y, s, `<path d="M-5,12 Q-6,-2 -4,-12 M0,12 Q1,-4 3,-14 M5,12 Q6,0 5,-10" stroke="${d ? "#2f8a58" : "#3f9a5a"}" stroke-width="2" fill="none" stroke-linecap="round"/>`));
    },
    amb(c) {
      let s = "";
      const col = c.d ? "#9fd3ff" : "#fff";
      for (let i = 0; i < 7; i++) s += A("ripple", `animation-duration:${(3 + c.r() * 2).toFixed(1)}s;animation-delay:${dl(c, 4)}`, T(RX(c), RY(c), 1, `<ellipse rx="22" ry="6" fill="none" stroke="${col}" stroke-opacity=".75" stroke-width="1.5"/>`));
      if (!c.d) {
        for (let i = 0; i < 2; i++) s += drift(c, c.top + 125 + c.r() * 40, 70 + c.r() * 20, cloud(false));
        for (let i = 0; i < 2; i++) s += drift(c, RY(c), 110 + c.r() * 40, `<g class="bob"><ellipse rx="7" ry="3.6" fill="#fff"/><circle cx="6" cy="-3" r="2.6" fill="#fff"/><path d="M8,-3 l4,1 l-4,1Z" fill="#ff9a3d"/></g>`);
      } else s += stars(c, 16) + shoot(c);
      return s;
    },
  },

  /* 5 · Desert: cacti, dunes, pyramids, palms, tumbleweeds */
  desert: {
    l: ["#f6e3b0", "#eec978"], d: ["#2b2112", "#3b2c16"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r(), g = d ? "#2f8a58" : "#4e9a4e";
      if (k < 0.35) return T(x, y, s, `<rect x="-3" y="-16" width="6" height="30" rx="3" fill="${g}"${stk(d)}/><rect x="-12" y="-6" width="5" height="12" rx="2.5" fill="${g}"${stk(d)}/><rect x="7" y="-10" width="5" height="12" rx="2.5" fill="${g}"${stk(d)}/>`);
      if (k < 0.65) return T(x, y, s, `<path d="M-30,12 Q-6,-14 30,12Z" fill="${d ? "#5a4423" : "#e0b862"}"${stk(d)}/>`);
      if (k < 0.85) return T(x, y, s, `<path d="M-20,14 L0,-18 L20,14Z" fill="${d ? "#6b5530" : "#d9a94f"}"${stk(d)}/><path d="M0,-18 L20,14 L6,14Z" fill="${d ? "#4a3a20" : "#b98a36"}"/>`);
      return A("sway", `animation-delay:${dl(c, 4)}`, T(x, y, s, `<path d="M0,14 Q2,0 -1,-12" stroke="${d ? "#6b4f38" : "#8a6240"}" stroke-width="3" fill="none"/><path d="M-1,-12 q-12,-2 -16,6 M-1,-12 q12,-2 16,6 M-1,-12 q-8,-9 -14,-4 M-1,-12 q8,-9 14,-4" stroke="${g}" stroke-width="3" fill="none" stroke-linecap="round"/>`));
    },
    amb(c) {
      let s = "";
      for (let i = 0; i < 3; i++) s += drift(c, RY(c), 40 + c.r() * 15, `<g class="roll"><circle r="6" fill="none" stroke="${c.d ? "#8a6a3a" : "#a6762f"}" stroke-width="1.6" stroke-dasharray="3 2"/><circle r="3" fill="none" stroke="${c.d ? "#8a6a3a" : "#a6762f"}" stroke-width="1.2"/></g>`);
      if (!c.d) { for (let i = 0; i < 12; i++) s += `<circle class="tw" cx="${RX(c).toFixed(0)}" cy="${RY(c).toFixed(0)}" r="1.4" fill="#fff6d0" style="animation-delay:${dl(c, 3)}"/>`; }
      else s += stars(c, 20) + shoot(c);
      return s;
    },
  },

  /* 6 · DP Glacier: ice peaks, crystals, snow, aurora */
  glacier: {
    l: ["#e3f1fb", "#bddcf3"], d: ["#10243a", "#17345a"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.6) return T(x, y, s, `<path d="M-24,14 L0,-22 L24,14Z" fill="${d ? "#2c5a8c" : "#cfe3f2"}"${stk(d)}/><path d="M0,-22 L8,-8 L1,-11 L-6,-6Z" fill="${d ? "#e6f3ff" : "#fff"}"/>`);
      if (k < 0.85) return T(x, y, s, `<path d="M0,-14 L6,0 L0,14 L-6,0Z" fill="${d ? "#5fb0ff" : "#9fd3ff"}" fill-opacity=".8"${stk(d)}/>`);
      return T(x, y, s, `<ellipse rx="22" ry="6" fill="${d ? "#2c5a8c" : "#d4e8f6"}"${stk(d)}/>`);
    },
    amb(c) {
      let s = "";
      const n = Math.round((c.bottom - c.top) / 30);
      for (let i = 0; i < n; i++) s += fall(c, RX(c), 12 + c.r() * 8, (c.r() * 40 - 20).toFixed(0), `<circle r="${(1.4 + c.r() * 1.6).toFixed(1)}" fill="#fff"${c.d ? "" : ` stroke="#a9c8e0" stroke-width=".6"`}/>`, "fall");
      if (c.d) {
        for (let i = 0; i < 2; i++) s += `<path class="aurora" style="animation-delay:${dl(c, 5)}" d="M0,${(c.top + 110 + i * 60).toFixed(0)} Q${c.W * 0.3},${(c.top + 70 + i * 60).toFixed(0)} ${c.W * 0.5},${(c.top + 110 + i * 60).toFixed(0)} T${c.W},${(c.top + 100 + i * 60).toFixed(0)} V${(c.top + 150 + i * 60).toFixed(0)} H0Z" fill="${i ? "#7a5cff" : "#3df2b0"}" fill-opacity=".22"/>`;
        s += stars(c, 14);
      } else for (let i = 0; i < 10; i++) s += `<path class="tw" d="M0,-4 L1,-1 L4,0 L1,1 L0,4 L-1,1 L-4,0 L-1,-1Z" transform="translate(${RX(c).toFixed(0)},${RY(c).toFixed(0)})" fill="#fff" style="animation-delay:${dl(c, 3)}"/>`;
      return s;
    },
  },

  /* 7 · Boss: stone fortress with flag towers */
  gate: {
    l: ["#cdc7dd", "#aaa2c6"], d: ["#1a1530", "#261c44"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r(), st = d ? "#3a2f66" : "#8f88aa", dk = d ? "#241c44" : "#6d6688";
      if (k < 0.4) return T(x, y, s, `<rect x="-26" y="-6" width="52" height="20" fill="${st}"${stk(d)}/><path d="M-26,-6 h6 v-5 h6 v5 h8 v-5 h6 v5 h8 v-5 h6 v5 h6" fill="${st}"${stk(d)}/>`);
      if (k < 0.75) return T(x, y, s, `<rect x="-11" y="-20" width="22" height="34" fill="${st}"${stk(d)}/><path d="M-11,-20 h5 v-5 h4 v5 h4 v-5 h4 v5 h5" fill="${st}"${stk(d)}/><rect x="-2" y="-10" width="4" height="8" rx="2" fill="${d ? "#ffd36b" : dk}"/>${d ? `<circle cy="-6" r="10" fill="url(#glowY)" class="fk"/>` : ""}${flag("#e5484d", 6)}`);
      return T(x, y, s, `<rect x="-20" y="-10" width="40" height="24" fill="${st}"${stk(d)}/><path d="M-9,14 V2 Q0,-8 9,2 V14Z" fill="${dk}"/><path d="M-5,14 V4 M0,14 V0 M5,14 V4" stroke="${d ? "#6b5aa0" : "#a79fc2"}" stroke-width="1"/>`);
    },
    amb(c) {
      let s = "";
      for (let i = 0; i < 3; i++) s += drift(c, c.top + 115 + c.r() * 150, 70 + c.r() * 25, bird(c.d ? "#8a82b8" : "#3c3552"));
      if (c.d) s += stars(c, 10);
      return s;
    },
  },

  /* 8 · AI Rounds: circuit board, pulses travelling along traces */
  circuit: {
    l: ["#d8f1ee", "#aee3dc"], d: ["#06171d", "#0a2a33"],
    deco(x, y, s, c) {
      const d = c.d;
      if (c.r() < 0.5) return T(x, y, s, `<rect x="-14" y="-10" width="28" height="20" rx="3" fill="${d ? "#0b2a33" : "#cfe9e5"}" stroke="${d ? "#3df2ff" : "#4fa89c"}" stroke-opacity="${d ? 0.6 : 1}"/><path d="M-14,-5 h-5 M-14,0 h-5 M-14,5 h-5 M14,-5 h5 M14,0 h5 M14,5 h5" stroke="${d ? "#3df2ff" : "#4fa89c"}" stroke-opacity=".7" stroke-width="1.4"/><circle cx="-8" cy="-5" r="1.4" fill="${d ? "#3df2ff" : "#4fa89c"}"/>`);
      return T(x, y, s, `<circle r="4" fill="none" stroke="${d ? "#3df2ff" : "#4fa89c"}" stroke-opacity="${d ? 0.7 : 1}" stroke-width="1.6"/><circle r="1.4" fill="${d ? "#3df2ff" : "#4fa89c"}"/>`);
    },
    amb(c) {
      let s = "";
      const n = Math.round((c.bottom - c.top) / 70);
      for (let i = 0; i < n; i++) {
        let x = RX(c), y = RY(c), dd = `M${x.toFixed(0)},${y.toFixed(0)}`;
        for (let k = 0; k < 3; k++) { x += (c.r() < 0.5 ? -1 : 1) * (30 + c.r() * 60); x = Math.max(10, Math.min(c.W - 10, x)); dd += ` H${x.toFixed(0)}`; y += 20 + c.r() * 40; dd += ` V${y.toFixed(0)}`; }
        s += `<path d="${dd}" fill="none" stroke="${c.d ? "#12525e" : "#7ec9bf"}" stroke-width="2"/><path class="flow" style="animation-delay:${dl(c, 3)}" d="${dd}" fill="none" stroke="${c.d ? "#3df2ff" : "#ff8a3d"}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="8 120"/>`;
      }
      for (let i = 0; i < 8; i++) s += A("blip", `animation-delay:${dl(c, 2)}`, T(RX(c), RY(c), 1, `<circle r="3" fill="${c.d ? "#ff4fd8" : "#ff8a3d"}"/>`));
      return s;
    },
  },

  /* 9 · Volcano: cones, lava pools, smoke and embers */
  volcano: {
    l: ["#f7c9a8", "#ef9a70"], d: ["#2a0f0a", "#431811"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r(), rock = d ? "#3b1a14" : "#8a4a3a";
      if (k < 0.4) return T(x, y, s, `<path d="M-26,16 L-8,-14 L8,-14 L26,16Z" fill="${rock}"${stk(d)}/><path d="M-8,-14 L8,-14 L4,-9 L0,-12 L-4,-9Z" fill="#ff5a1f"/>${d ? `<circle cy="-14" r="22" fill="url(#glowO)" class="fk"/>` : ""}`);
      if (k < 0.75) return T(x, y, s, `<ellipse rx="22" ry="7" fill="#ff5a1f" fill-opacity=".9"/><ellipse rx="12" ry="3.5" fill="#ffc15c"/>${d ? `<circle r="26" fill="url(#glowO)" class="fk"/>` : ""}`);
      return T(x, y, s, `<path d="M-16,12 L-6,-14 L6,-6 L16,12Z" fill="${rock}"${stk(d)}/>`);
    },
    amb(c) {
      let s = "";
      for (let i = 0; i < 12; i++) s += rise(c, RX(c), RY(c), 70 + c.r() * 60, 7 + c.r() * 4, `<circle r="${(1.2 + c.r() * 1.6).toFixed(1)}" fill="${c.d ? "#ff9a4d" : "#ff6a1f"}"/>`);
      for (let i = 0; i < 4; i++) s += rise(c, RX(c), RY(c), 90, 11 + c.r() * 4, `<ellipse rx="9" ry="6" fill="${c.d ? "#4a3a3a" : "#7a6a66"}" fill-opacity=".55"/>`).replace('class="rise"', 'class="rise smoke"');
      return s;
    },
  },

  /* 10 · Storm: crags, thunderclouds, rain and lightning */
  storm: {
    l: ["#b7bfce", "#8d97ac"], d: ["#0d1020", "#1a2038"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.55) return T(x, y, s, `<path d="M-14,16 L-8,-22 L-2,-8 L4,-26 L14,16Z" fill="${d ? "#2a3150" : "#6b7388"}"${stk(d)}/>`);
      return T(x, y, s, cloud(d, 1).replace(/#fff/g, "#5a6378").replace(/#3a4c88/g, "#232a45"));
    },
    amb(c) {
      let s = "";
      const n = Math.round((c.bottom - c.top) / 8);
      for (let i = 0; i < n; i++) s += fall(c, RX(c), 0.9 + c.r() * 0.6, -14, `<path d="M0,0 l-2,8" stroke="${c.d ? "#8fb0ff" : "#4b5a7a"}" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`, "fall rain");
      for (let i = 0; i < 2; i++) s += drift(c, c.top + 115 + c.r() * 120, 80 + c.r() * 30, cloud(c.d, 1).replace(/#fff/g, "#4d556a").replace(/#3a4c88/g, "#1e2440"));
      for (let i = 0; i < 2; i++) { const x = RX(c), y = RY(c); s += `<path class="flash" style="animation-delay:${dl(c, 9)}" d="M${x.toFixed(0)},${(y - 40).toFixed(0)} l-8,22 l8,-4 l-6,22" fill="none" stroke="${c.d ? "#fff3a8" : "#ffe45e"}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`; }
      return s;
    },
  },

  /* 11 · Final boss: dark spire, bats, red moon */
  spire: {
    l: ["#d9b9cf", "#b88fb0"], d: ["#1c0c1c", "#2e1030"],
    deco(x, y, s, c) {
      const d = c.d, st = d ? "#3a1f44" : "#7a5a86", k = c.r();
      if (k < 0.55) return T(x, y, s, `<rect x="-7" y="-24" width="14" height="38" fill="${st}"${stk(d)}/><path d="M-10,-24 L0,-44 L10,-24Z" fill="${d ? "#2a1433" : "#5c3f68"}"${stk(d)}/><rect x="-1.6" y="-14" width="3.2" height="7" rx="1.6" fill="${d ? "#ff5a4d" : "#4a3354"}"/>${d ? `<circle cy="-10" r="12" fill="url(#glowO)" class="fk"/>` : ""}`);
      return T(x, y, s, `<path d="M-18,16 L-10,-10 L-4,2 L4,-16 L10,0 L18,16Z" fill="${d ? "#2a1433" : "#8a6a96"}"${stk(d)}/>`);
    },
    amb(c) {
      let s = "";
      s += T(c.W * 0.78, c.top + 150, 1, `<circle r="${c.d ? 24 : 20}" fill="${c.d ? "#ff5a4d" : "#f3d9de"}" fill-opacity="${c.d ? 0.9 : 0.8}"/>${c.d ? `<circle r="52" fill="url(#glowO)" class="fk"/>` : ""}`);
      for (let i = 0; i < 4; i++) s += drift(c, c.top + 120 + c.r() * 160, 50 + c.r() * 20, `<g class="flap flapfast"><path d="M-9,0 Q-4,-8 0,-2 Q4,-8 9,0 Q4,-3 0,3 Q-4,-3 -9,0Z" fill="${c.d ? "#0a040c" : "#2d1b36"}"/></g>`);
      if (c.d) s += stars(c, 10);
      return s;
    },
  },

  /* 12 · Wave 1: sunrise coast, sailboats, lighthouse */
  coast: {
    l: ["#fde7c0", "#a6dcef"], d: ["#2a1530", "#123456"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.3) return A("sway", `animation-delay:${dl(c, 4)}`, T(x, y, s, `<path d="M0,14 Q3,0 -1,-14" stroke="${d ? "#6b4f38" : "#8a6240"}" stroke-width="3" fill="none"/><path d="M-1,-14 q-12,-2 -16,6 M-1,-14 q12,-2 16,6 M-1,-14 q-8,-9 -14,-4 M-1,-14 q8,-9 14,-4" stroke="${d ? "#2f8a58" : "#3fa35c"}" stroke-width="3" fill="none" stroke-linecap="round"/>`));
      if (k < 0.65) return A("bob", `animation-delay:${dl(c, 3)}`, T(x, y, s, `<path d="M-12,2 L12,2 L8,9 L-8,9Z" fill="${d ? "#8d4f33" : "#c8642f"}"/><path d="M0,2 V-16 L11,0Z" fill="${d ? "#cfd6e6" : "#fff"}"/><path d="M-1,0 V-12 L-9,0Z" fill="${d ? "#9aa3b8" : "#ffd6a0"}"/>`));
      return T(x, y, s, `<path d="M-26,0 q6,-5 13,0 t13,0 t13,0 t13,0" stroke="${d ? "#5fa8e6" : "#ffffff"}" stroke-opacity=".8" stroke-width="2" fill="none" stroke-linecap="round"/>`);
    },
    amb(c) {
      let s = "";
      for (let i = 0; i < 6; i++) s += A("slide", `animation-delay:${dl(c, 5)}`, T(RX(c), RY(c), 1, `<path d="M-22,0 q5.5,-4 11,0 t11,0 t11,0 t11,0" stroke="${c.d ? "#6fb4f0" : "#fff"}" stroke-opacity=".75" stroke-width="1.8" fill="none" stroke-linecap="round"/>`));
      // lighthouse
      const lx = c.W * 0.82, ly = c.top + (c.bottom - c.top) * 0.55;
      s += T(lx, ly, 1, `<path d="M-6,14 L-4,-16 L4,-16 L6,14Z" fill="${c.d ? "#cfd6e6" : "#fff"}" stroke="#e5484d" stroke-width="0"/><path d="M-5,-4 H5 V2 H-5Z M-4.4,-10 H4.4 V-6 H-4.4Z" fill="#e5484d"/><rect x="-4" y="-22" width="8" height="6" fill="${c.d ? "#ffd36b" : "#8e98b0"}"/><path d="M-5,-22 L0,-28 L5,-22Z" fill="#e5484d"/>`);
      if (c.d) s += A("beam", `transform-origin:${lx}px ${ly - 19}px`, `<path d="M${lx},${ly - 19} L${lx + 120},${ly - 31} L${lx + 120},${ly - 7}Z" fill="#ffe08a" fill-opacity=".35"/>`);
      if (!c.d) { for (let i = 0; i < 2; i++) s += drift(c, c.top + 120 + c.r() * 100, 60 + c.r() * 20, bird("#6b7a8a")); for (let i = 0; i < 2; i++) s += drift(c, c.top + 115 + c.r() * 60, 75, cloud(false)); }
      else s += stars(c, 18) + shoot(c);
      return s;
    },
  },

  /* 13 · Wave 2: city skyline, moving cars, plane */
  city: {
    l: ["#d9dff0", "#b3bddc"], d: ["#0c0f24", "#1a1e44"],
    deco(x, y, s, c) {
      const d = c.d, h = 22 + c.r() * 30, w = 16 + c.r() * 10;
      let win = "";
      for (let yy = -h + 6; yy < 12; yy += 8) for (let xx = -w / 2 + 3; xx < w / 2 - 3; xx += 6) {
        const on = c.r() < 0.45;
        win += `<rect x="${xx.toFixed(0)}" y="${yy.toFixed(0)}" width="3" height="4" fill="${d ? (on ? "#ffd36b" : "#242a55") : (on ? "#ffffff" : "#8a97c4")}"/>`;
      }
      return T(x, y, s, `<rect x="${-w / 2}" y="${-h}" width="${w}" height="${h + 14}" fill="${d ? "#141a3d" : "#98a4cf"}"${stk(d)}/>${win}${c.r() < 0.5 ? `<rect x="-0.8" y="${-h - 8}" width="1.6" height="8" fill="#8e98b0"/><circle cy="${-h - 9}" r="1.8" fill="#ff4d4d" class="blink"/>` : ""}`);
    },
    amb(c) {
      let s = "";
      const streets = 2 + Math.floor((c.bottom - c.top) / 400);
      for (let i = 0; i < streets; i++) {
        const y = c.top + 150 + ((c.bottom - c.top - 200) * (i + 0.5)) / streets;
        s += `<rect x="0" y="${y.toFixed(0)}" width="${c.W}" height="7" fill="${c.d ? "#0a0d1f" : "#7f8ab5"}" fill-opacity=".8"/>`;
        for (let k = 0; k < 3; k++) s += drift(c, y + 3.5, 22 + c.r() * 14, c.d ? `<rect x="-5" y="-2" width="10" height="4" rx="2" fill="#1a2250"/><circle cx="6" r="5" fill="url(#glowY)"/><circle cx="5" r="1.4" fill="#fff3a8"/>` : `<rect x="-5" y="-2.5" width="10" height="5" rx="2" fill="${["#e5484d", "#2f80ed", "#f5a623", "#27ae60"][k % 4]}"/>`);
      }
      s += drift(c, c.top + 120, 110, c.d ? `<path d="M-9,0 H9 M-3,-5 L3,0 L-3,5" stroke="#cfd6e6" stroke-width="1.6" fill="none"/><circle cx="-9" r="1.6" fill="#ff4d4d" class="blink"/>` : `<path d="M-9,0 H9 M-3,-5 L3,0 L-3,5" stroke="#5a6b8a" stroke-width="1.8" fill="none"/>`);
      if (!c.d) for (let i = 0; i < 2; i++) s += drift(c, c.top + 125 + c.r() * 60, 80, cloud(false, 0.7));
      else s += stars(c, 14);
      return s;
    },
  },

  /* 14 · Wave 3: summit, golden flag, confetti, fireworks */
  summit: {
    l: ["#fff1b8", "#ffd966"], d: ["#2e2410", "#483616"],
    deco(x, y, s, c) {
      const d = c.d, k = c.r();
      if (k < 0.5) return T(x, y, s, `<path d="M-26,16 L0,-26 L26,16Z" fill="${d ? "#6b5a3a" : "#c9a45a"}"${stk(d)}/><path d="M0,-26 L9,-10 L2,-14 L-6,-8Z" fill="${d ? "#f5e9c8" : "#fff"}"/>${k < 0.2 ? flag("#e5484d", 4).replace(/translate/g, "translate") : ""}`);
      return T(x, y, s, cloud(d, d ? 0.35 : 0.9).replace(/#3a4c88/g, "#8a7a55"));
    },
    amb(c) {
      let s = "";
      const cols = ["#e5484d", "#2f80ed", "#27ae60", "#f5a623", "#9b59b6"];
      for (let i = 0; i < 22; i++) s += fall(c, RX(c), 11 + c.r() * 6, (c.r() * 50 - 25).toFixed(0), `<g class="spin"><rect x="-2" y="-3" width="4" height="6" fill="${cols[i % cols.length]}"/></g>`, "fall");
      for (let i = 0; i < 3; i++) {
        const x = RX(c), y = RY(c); let sp = "";
        for (let a = 0; a < 8; a++) { const r = (a * Math.PI) / 4; sp += `<path d="M0,0 L${(Math.cos(r) * 16).toFixed(1)},${(Math.sin(r) * 16).toFixed(1)}" stroke="${cols[(a + i) % cols.length]}" stroke-width="2" stroke-linecap="round"/>`; }
        s += A("burst", `animation-delay:${dl(c, 7)}`, T(x, y, 1, sp));
      }
      for (let i = 0; i < 2; i++) s += drift(c, c.top + 125 + c.r() * 80, 80, cloud(c.d, c.d ? 0.3 : 0.85).replace(/#3a4c88/g, "#8a7a55"));
      if (c.d) s += stars(c, 14);
      return s;
    },
  },
};
