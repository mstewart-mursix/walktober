// Generates the Walktober scenery as layered SVG files in public/assets/.
// Everything is procedural and seeded, so the same command reproduces the same art:
//   node tools/generate-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/assets/", import.meta.url));
const W = 2400;
const PAGE = "#0b1d18";

function random(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value) => String(Math.round(value * 10) / 10);
const between = (r, low, high) => low + r() * (high - low);

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// Fractal 1D value noise in 0..1. `ridged` folds it into sharp mountain crests.
function terrain(seed, { octaves = 4, ridged = false } = {}) {
  const r = random(seed);
  const lattice = Array.from({ length: 512 }, () => r());
  const value = (x) => {
    const i = Math.floor(x);
    const t = x - i;
    const s = t * t * (3 - 2 * t);
    const a = lattice[((i % 512) + 512) % 512];
    const b = lattice[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * s;
  };
  return (x) => {
    let total = 0;
    let weight = 0;
    let amplitude = 1;
    let frequency = 1;
    for (let o = 0; o < octaves; o += 1) {
      let v = value(x * frequency + o * 31.7);
      if (ridged) v = 1 - Math.abs(2 * v - 1);
      total += v * amplitude;
      weight += amplitude;
      amplitude *= ridged ? 0.42 : 0.5;
      frequency *= 2.1;
    }
    return total / weight;
  };
}

function pine(r, x, y, h) {
  const tiers = h < 34 ? 3 : 4 + Math.floor(r() * 3);
  const half = h * between(r, 0.15, 0.21);
  const trunk = Math.max(1, h * 0.03);
  const base = y - h * 0.1;
  const left = [];
  const right = [];
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const span = half * (1 - t * 0.82);
    const ty = base - (h * 0.9) * t;
    const lift = (h * 0.9) / tiers;
    left.push(`${n(x - span * between(r, 0.9, 1.1))},${n(ty + between(r, -1, 1) * h * 0.012)}`);
    left.push(`${n(x - span * 0.42)},${n(ty - lift * 0.8)}`);
    right.unshift(`${n(x + span * between(r, 0.9, 1.1))},${n(ty + between(r, -1, 1) * h * 0.012)}`);
    right.unshift(`${n(x + span * 0.42)},${n(ty - lift * 0.8)}`);
  }
  return `M${n(x - trunk)},${n(y + 4)}L${n(x - trunk)},${n(base)}L${left.join("L")}L${n(x)},${n(y - h)}L${right.join("L")}L${n(x + trunk)},${n(base)}L${n(x + trunk)},${n(y + 4)}Z`;
}

function blob(cx, cy, radius) {
  return `M${n(cx - radius)},${n(cy)}a${n(radius)},${n(radius)} 0 1,0 ${n(radius * 2)},0a${n(radius)},${n(radius)} 0 1,0 ${n(-radius * 2)},0Z`;
}

function broadleaf(r, x, y, h) {
  const crown = h * 0.34;
  let d = `M${n(x - h * 0.025)},${n(y + 4)}L${n(x - h * 0.018)},${n(y - h * 0.5)}L${n(x + h * 0.018)},${n(y - h * 0.5)}L${n(x + h * 0.025)},${n(y + 4)}Z`;
  d += blob(x, y - h * 0.66, crown);
  for (let i = 0; i < 6; i += 1) {
    const angle = r() * Math.PI * 2;
    d += blob(x + Math.cos(angle) * crown * 0.62, y - h * 0.66 + Math.sin(angle) * crown * 0.5, crown * between(r, 0.5, 0.74));
  }
  return d;
}

function walker(x, y, scale, color) {
  const line = (points, width) => `<polyline points="${points}" stroke-width="${width}"/>`;
  return `<g transform="translate(${n(x)} ${n(y + 2)}) scale(${n(scale)})" fill="${color}" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">`
    + `<circle cx="3" cy="-59" r="6.4" stroke="none"/>`
    + line("-5,-63 11,-63", 2.6)
    + line("3,-48 -2,-27", 11)
    + line("-7,-47 -10,-33", 10)
    + `<g fill="none">${line("-2,-27 7,-14 5,0", 5.6)}${line("-2,-27 -6,-13 -14,-2", 5.6)}${line("3,-45 12,-33", 4)}${line("12,-34 17,0", 1.7)}</g></g>`;
}

function svg(height, body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" preserveAspectRatio="xMidYMax meet">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>\n`;
}

function save(name, content) {
  writeFileSync(`${OUT}${name}`, content);
  console.log(`${name.padEnd(22)} ${(content.length / 1024).toFixed(1)} KB`);
}

// One silhouette layer: a ridge line, its trees, and a mist gradient pooling at its foot.
function ridgeLayer(name, spec) {
  const r = random(spec.seed * 7919);
  const profile = terrain(spec.seed, { octaves: spec.octaves ?? 4, ridged: spec.ridged });
  const tallest = Math.max(spec.pines?.height[1] ?? 0, spec.frame?.height[1] ?? 0, spec.broadleaf?.height[1] ?? 0);
  const height = Math.ceil(spec.base + spec.amp + tallest + 30);
  const crest = (x) => height - (spec.base + spec.amp * (profile(x * spec.freq) * 2 - 1) + (spec.shape ? spec.shape(x) : 0));

  let ridge = `M0,${height}`;
  for (let x = 0; x <= W; x += spec.step ?? 12) ridge += `L${x},${n(crest(x))}`;
  ridge += `L${W},${height}Z`;

  const blocked = (x) => (spec.clear || []).some(([from, to]) => x > from && x < to);
  let trees = "";
  if (spec.pines) {
    for (let i = 0; i < spec.pines.count; i += 1) {
      const x = r() * W;
      const h = between(r, ...spec.pines.height) * (0.75 + 0.5 * r());
      if (!blocked(x)) trees += pine(r, x, crest(x), h);
    }
  }
  if (spec.frame) {
    for (const [from, to, count, range = spec.frame.height] of spec.frame.zones) {
      for (let i = 0; i < count; i += 1) {
        const x = between(r, from, to);
        trees += pine(r, x, crest(x) + 8, between(r, ...range));
      }
    }
  }

  let accents = "";
  if (spec.broadleaf) {
    const groups = new Map();
    for (let i = 0; i < spec.broadleaf.count; i += 1) {
      const x = r() * W;
      const color = spec.broadleaf.colors[Math.floor(r() * spec.broadleaf.colors.length)];
      if (blocked(x)) continue;
      groups.set(color, (groups.get(color) || "") + broadleaf(r, x, crest(x), between(r, ...spec.broadleaf.height)));
    }
    for (const [color, d] of groups) accents += `<path fill="${color}" d="${d}"/>`;
  }

  let extras = "";
  if (spec.walkers) {
    for (const [x, scale] of spec.walkers) extras += walker(x, crest(x), scale, spec.color);
  }
  if (spec.extra) extras += spec.extra(crest, height);

  const top = height - spec.base - spec.amp;
  const defs = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${height}"><stop offset="0" stop-color="${spec.color}"/><stop offset="${spec.mistAt ?? 0.3}" stop-color="${spec.color}"/><stop offset="1" stop-color="${spec.mist}"/></linearGradient>${spec.defs || ""}`;
  save(name, svg(height, `${accents}<path fill="url(#g)" d="${ridge}"/><path fill="${spec.color}" d="${trees}"/>${extras}`, defs));
}

function dawn() {
  const layers = [
    { seed: 11, base: 440, amp: 170, freq: 1 / 560, octaves: 5, ridged: true, step: 8, color: "#c98a68", mist: "#f0bf8b", mistAt: 0.05 },
    { seed: 23, base: 380, amp: 150, freq: 1 / 470, octaves: 5, ridged: true, step: 8, color: "#a36a5a", mist: "#e0a27a", mistAt: 0.08 },
    { seed: 37, base: 335, amp: 95, freq: 1 / 640, color: "#7a5350", mist: "#c58a6c", mistAt: 0.1, pines: { count: 420, height: [12, 26] } },
    { seed: 41, base: 275, amp: 80, freq: 1 / 700, color: "#54433f", mist: "#9b6f5c", mistAt: 0.12, pines: { count: 300, height: [22, 46] } },
    {
      seed: 59, base: 215, amp: 60, freq: 1 / 820, color: "#33362f", mist: "#6a5549", mistAt: 0.15,
      shape: (x) => 34 * Math.exp(-(((x - 1340) / 280) ** 2)),
      pines: { count: 170, height: [40, 92] }, clear: [[1110, 1590]],
      walkers: [[1190, 1.36], [1290, 1.5], [1385, 1.28], [1500, 1.55]],
    },
    {
      seed: 67, base: 150, amp: 55, freq: 1 / 900, color: "#1b2c26", mist: "#34403a", mistAt: 0.2,
      shape: (x) => -30 * Math.exp(-(((x - 1340) / 300) ** 2)),
      pines: { count: 110, height: [70, 170] }, clear: [[1100, 1600]],
      broadleaf: { count: 26, height: [70, 130], colors: ["#c8683f", "#d98a3d", "#a8492f", "#e0a646"] },
    },
    {
      seed: 83, base: 78, amp: 34, freq: 1 / 1000, color: PAGE, mist: PAGE,
      shape: (x) => 70 * Math.pow(Math.abs(x - W / 2) / (W / 2), 2.2),
      pines: { count: 46, height: [60, 150] }, clear: [[760, 1640]],
      frame: { zones: [[40, 400, 6, [190, 330]], [1840, 2300, 8, [330, 660]]], height: [330, 660] },
    },
  ];
  layers.forEach((layer, index) => ridgeLayer(`dawn-${index + 1}.svg`, layer));
}

function night() {
  const tent = (crest, height) => {
    const x = 1480;
    const y = crest(x) + 6;
    return `<circle cx="${x}" cy="${n(y - 30)}" r="150" fill="url(#glow)"><animate attributeName="opacity" values=".75;1;.82;1;.75" dur="3.1s" repeatCount="indefinite"/></circle>`
      + `<path fill="url(#tent)" d="M${x - 62},${n(y)}L${x},${n(y - 74)}L${x + 62},${n(y)}Z"/>`
      + `<path fill="#3b1d12" opacity=".75" d="M${x - 9},${n(y)}L${x},${n(y - 46)}L${x + 9},${n(y)}Z"/>`
      + `<path stroke="#071210" stroke-width="2.4" fill="none" d="M${x - 70},${n(y + 2)}L${x},${n(y - 78)}L${x + 70},${n(y + 2)}"/>`
      + `<rect x="0" y="${height - 4}" width="${W}" height="4" fill="#050e0c"/>`;
  };
  const layers = [
    { seed: 101, base: 300, amp: 130, freq: 1 / 520, octaves: 5, ridged: true, step: 8, color: "#16343a", mist: "#27535a", mistAt: 0.05 },
    { seed: 113, base: 215, amp: 80, freq: 1 / 700, color: "#0e2429", mist: "#1a3f44", mistAt: 0.1, pines: { count: 300, height: [22, 52] } },
    {
      seed: 131, base: 110, amp: 42, freq: 1 / 950, color: "#050e0c", mist: "#050e0c",
      pines: { count: 90, height: [60, 170] }, clear: [[1340, 1640]],
      frame: { height: [260, 470], zones: [[80, 520, 6], [1900, 2330, 6]] },
      extra: tent,
      defs: `<radialGradient id="glow"><stop offset="0" stop-color="#f6c15f" stop-opacity=".55"/><stop offset=".4" stop-color="#e2835c" stop-opacity=".18"/><stop offset="1" stop-color="#e2835c" stop-opacity="0"/></radialGradient><linearGradient id="tent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e98f55"/><stop offset="1" stop-color="#fbd676"/></linearGradient>`,
    },
  ];
  layers.forEach((layer, index) => ridgeLayer(`night-${index + 1}.svg`, layer));
}

function stars() {
  const r = random(4711);
  const height = 1000;
  let body = "";
  for (let i = 0; i < 340; i += 1) {
    const size = r() < 0.08 ? between(r, 1.6, 2.6) : between(r, 0.5, 1.4);
    body += `<circle cx="${n(r() * W)}" cy="${n(Math.pow(r(), 1.5) * height)}" r="${n(size)}" opacity="${n(between(r, 0.25, 1))}"/>`;
  }
  for (let i = 0; i < 9; i += 1) {
    const x = r() * W;
    const y = r() * height * 0.6;
    const s = between(r, 5, 9);
    body += `<path d="M${n(x)},${n(y - s)}Q${n(x)},${n(y)} ${n(x + s)},${n(y)}Q${n(x)},${n(y)} ${n(x)},${n(y + s)}Q${n(x)},${n(y)} ${n(x - s)},${n(y)}Q${n(x)},${n(y)} ${n(x)},${n(y - s)}Z" opacity=".9"/>`;
  }
  save("stars.svg", svg(height, `<g fill="#fdf3d7">${body}</g>`));
}

function clouds() {
  const r = random(907);
  const height = 620;
  let body = "";
  for (let i = 0; i < 9; i += 1) {
    const cx = (i + between(r, 0.1, 0.9)) * (W / 9);
    const cy = between(r, 120, 500);
    const length = between(r, 260, 620);
    let cloud = "";
    for (let k = 0; k < 7; k += 1) {
      cloud += `<ellipse cx="${n(cx + between(r, -0.5, 0.5) * length)}" cy="${n(cy + between(r, -14, 14))}" rx="${n(length * between(r, 0.18, 0.42))}" ry="${n(between(r, 9, 24))}"/>`;
    }
    body += `<g opacity="${n(between(r, 0.35, 0.8))}">${cloud}</g>`;
  }
  const defs = `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9788a"/><stop offset="1" stop-color="#ffc98a"/></linearGradient><filter id="soft" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>`;
  save("clouds.svg", svg(height, `<g fill="url(#c)" filter="url(#soft)">${body}</g>`, defs));
}

// Aspen grove: full-height trunks in four depths, two leaf canopies, and a fern line.
function grove() {
  const height = 1400;
  const trunkPath = (x, width, lean, bow) => {
    const left = [];
    const right = [];
    for (let y = 0; y <= height; y += 140) {
      const t = y / height;
      const cx = x + lean * (1 - t) + bow * Math.sin(Math.PI * t);
      const half = (width * (0.72 + 0.28 * t)) / 2;
      left.push(`${n(cx - half)},${y}`);
      right.unshift(`${n(cx + half)},${y}`);
    }
    return { d: `M${left.join("L")}L${right.join("L")}Z`, centre: (y) => x + lean * (1 - y / height) + bow * Math.sin((Math.PI * y) / height) };
  };

  const layer = (name, seed, { count, width, fill, marks, branches, clear, defs = "" }) => {
    const r = random(seed);
    let body = "";
    for (let i = 0; i < count; i += 1) {
      let x = ((i + between(r, 0.15, 0.85)) * W) / count;
      if (clear && x > clear[0] && x < clear[1]) x = x < (clear[0] + clear[1]) / 2 ? clear[0] - r() * 120 : clear[1] + r() * 120;
      const w = between(r, ...width);
      const trunk = trunkPath(x, w, between(r, -70, 70), between(r, -26, 26));
      if (branches) {
        for (let b = 0; b < branches.count; b += 1) {
          const y = between(r, 40, height * 0.7);
          const side = r() < 0.5 ? -1 : 1;
          const length = between(r, w * 1.4, w * 4.2);
          body += `<path d="M${n(trunk.centre(y))},${n(y)}q${n(side * length * 0.5)},${n(-length * 0.2)} ${n(side * length)},${n(-length * between(r, 0.5, 0.9))}" fill="none" stroke="${branches.color}" stroke-width="${n(Math.max(2, w * between(r, 0.06, 0.13)))}" stroke-linecap="round"/>`;
        }
      }
      body += `<path fill="${fill}" d="${trunk.d}"/>`;
      if (marks) {
        let d = "";
        for (let m = 0; m < marks.count; m += 1) {
          const y = between(r, 20, height - 20);
          const reach = w * between(r, 0.16, 0.5);
          const edge = trunk.centre(y) + (r() < 0.5 ? -1 : 1) * (w * 0.34 - reach * 0.5);
          const thick = between(r, 2, w * 0.13 + 2);
          d += `M${n(edge - reach / 2)},${n(y)}q${n(reach / 2)},${n(-thick)} ${n(reach)},0q${n(-reach / 2)},${n(thick)} ${n(-reach)},0Z`;
        }
        body += `<path fill="${marks.color}" opacity="${marks.opacity}" d="${d}"/>`;
      }
    }
    save(name, svg(height, body, defs).replace("xMidYMax meet", "xMidYMid slice"));
  };

  const bark = (id, light, dark) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark}"/><stop offset=".3" stop-color="${light}"/><stop offset=".72" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  layer("grove-1.svg", 301, { count: 34, width: [9, 22], fill: "#e8c98a" });
  layer("grove-2.svg", 307, { count: 15, width: [30, 50], fill: "url(#b)", defs: bark("b", "#f8e9c6", "#c8a66d"), marks: { count: 16, color: "#6b4e2c", opacity: 0.55 }, branches: { count: 2, color: "#a98350" } });
  layer("grove-3.svg", 311, { count: 8, width: [62, 96], fill: "url(#b)", defs: bark("b", "#fbf3df", "#b79a6c"), marks: { count: 22, color: "#2f2418", opacity: 0.72 }, branches: { count: 3, color: "#5a4630" }, clear: [700, 1700] });
  layer("grove-4.svg", 313, { count: 4, width: [110, 170], fill: "url(#b)", defs: bark("b", "#1b3027", "#0a1813"), clear: [520, 1880] });

  const canopy = (name, seed, { leaves, size, colors, depth, opacity }) => {
    const r = random(seed);
    const h = 640;
    const groups = new Map();
    for (let i = 0; i < leaves; i += 1) {
      const color = colors[Math.floor(r() * colors.length)];
      const y = Math.pow(r(), 1.9) * depth;
      const radius = between(r, ...size) * (1 - (y / depth) * 0.45);
      const x = Math.round(r() * W);
      groups.set(color, (groups.get(color) || "") + `<ellipse cx="${x}" cy="${Math.round(y)}" rx="${n(radius)}" ry="${n(radius * between(r, 0.55, 0.9))}" transform="rotate(${Math.round(r() * 180)} ${x} ${Math.round(y)})"/>`);
    }
    let body = "";
    for (const [color, shapes] of groups) body += `<g fill="${color}">${shapes}</g>`;
    save(name, svg(h, `<g opacity="${opacity}">${body}</g>`).replace("xMidYMax meet", "xMidYMin meet"));
  };
  canopy("canopy-far.svg", 401, { leaves: 900, size: [9, 22], depth: 430, opacity: 0.9, colors: ["#f2c14e", "#e9a93c", "#f7d977", "#dd8d3a", "#f0b445"] });
  canopy("canopy-near.svg", 409, { leaves: 520, size: [16, 40], depth: 330, opacity: 1, colors: ["#e58a2f", "#d96a34", "#f0a83a", "#c4502b", "#f4c552"] });

  const r = random(503);
  const gh = 300;
  let blades = "";
  for (let i = 0; i < 520; i += 1) {
    const x = r() * W;
    const tall = between(r, 40, 170) * (r() < 0.12 ? 1.5 : 1);
    const sway = between(r, -46, 46);
    const w = between(r, 4, 11);
    blades += `M${n(x - w)},${gh}Q${n(x + sway * 0.2)},${n(gh - tall * 0.6)} ${n(x + sway)},${n(gh - tall)}Q${n(x + sway * 0.4 + w)},${n(gh - tall * 0.5)} ${n(x + w)},${gh}Z`;
  }
  save("grove-ground.svg", svg(gh, `<path fill="${PAGE}" d="${blades}"/><rect y="${gh - 34}" width="${W}" height="34" fill="${PAGE}"/>`));
}

mkdirSync(OUT, { recursive: true });
dawn();
night();
stars();
clouds();
grove();
