// Visual layer only: parallax scenes, falling leaves, fireflies, and scroll reveals.
// Data loading and forms live in app.js.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const header = document.querySelector("#site-header");
const night = document.querySelector(".night");

/*
 * Parallax. An element with data-parallax moves against its scene:
 *   data-scene="top"     distance scrolled past the scene's top edge (the hero)
 *   data-scene="center"  distance of the scene's centre from the viewport centre
 *   data-scene="bottom"  distance left until the scene's bottom edge is reached
 * data-parallax scales vertical travel, data-parallax-x horizontal travel, and
 * data-drift is how many pixels the layer leans away from the pointer.
 */
const scenes = new Map();
for (const el of document.querySelectorAll("[data-parallax], [data-parallax-x], [data-drift]")) {
  const root = el.closest("[data-scene]") || el.parentElement;
  if (!scenes.has(root)) scenes.set(root, { root, type: root.dataset.scene || "center", offset: null, layers: [] });
  scenes.get(root).layers.push({
    el,
    y: Number(el.dataset.parallax || 0),
    x: Number(el.dataset.parallaxX || 0),
    drift: Number(el.dataset.drift || 0),
    fade: el.hasAttribute("data-fade"),
  });
}

const pointer = { x: 0, target: 0 };
const finePointer = window.matchMedia("(pointer: fine)");
window.addEventListener("pointermove", (event) => {
  if (!finePointer.matches) return;
  pointer.target = (event.clientX / window.innerWidth) * 2 - 1;
  const card = event.target.closest?.(".card");
  if (card) {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }
}, { passive: true });

function sceneOffset(scene, viewport) {
  const rect = scene.root.getBoundingClientRect();
  if (rect.bottom < -viewport * 0.5 || rect.top > viewport * 1.5) return null;
  if (scene.type === "top") return rect.top;
  if (scene.type === "bottom") return Math.max(0, rect.bottom - viewport);
  return rect.top + rect.height / 2 - viewport / 2;
}

function updateParallax() {
  const viewport = window.innerHeight;
  const travel = window.innerWidth < 700 ? 0.55 : 1;
  pointer.x += (pointer.target - pointer.x) * 0.06;
  for (const scene of scenes.values()) {
    const target = sceneOffset(scene, viewport);
    if (target === null) { scene.offset = null; continue; }
    scene.offset = scene.offset === null ? target : scene.offset + (target - scene.offset) * 0.16;
    for (const layer of scene.layers) {
      const x = scene.offset * layer.x * travel - pointer.x * layer.drift;
      const y = -scene.offset * layer.y * (scene.type === "center" ? travel : 1);
      layer.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (layer.fade) layer.el.style.opacity = clamp(1 + scene.offset / (viewport * 0.5), 0, 1).toFixed(3);
    }
  }
}

/* Leaves fall through the whole walk; fireflies take over once the night scene arrives. */
const canvas = document.querySelector("#fx-canvas");
const context = canvas.getContext("2d");
const leafShape = new Path2D("M0-11C6-8 9 0 0 12C-9 0-6-8 0-11Z");
const leafVein = new Path2D("M0-9V15");
const leafColors = ["#e2835c", "#f0b95a", "#d9a03a", "#c4502b", "#f3cf74", "#b9c95a"];
let leaves = [];
let fireflies = [];
let glow;
let width = 0;
let height = 0;
let lastScroll = window.scrollY;
let lastTime = performance.now();

function makeGlow() {
  glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const g = glow.getContext("2d");
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(236, 255, 160, 1)");
  gradient.addColorStop(0.18, "rgba(216, 241, 123, .7)");
  gradient.addColorStop(1, "rgba(216, 241, 123, 0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
}

function seedParticles() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const leafCount = Math.round(clamp(width / 46, 10, 34));
  leaves = Array.from({ length: leafCount }, () => {
    const depth = Math.random();
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      depth,
      size: 0.45 + depth * 0.95,
      spin: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 1.6,
      flip: Math.random() * Math.PI * 2,
      flipSpeed: 0.8 + Math.random() * 1.8,
      sway: Math.random() * Math.PI * 2,
      color: leafColors[Math.floor(Math.random() * leafColors.length)],
    };
  });
  fireflies = Array.from({ length: Math.round(clamp(width / 60, 8, 26)) }, () => ({
    x: Math.random() * width,
    y: height * (0.3 + Math.random() * 0.7),
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.7,
    size: 10 + Math.random() * 16,
  }));
}

function drawParticles(now) {
  const delta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const scrolled = window.scrollY - lastScroll;
  lastScroll = window.scrollY;
  const nightAmount = night ? clamp((height - night.getBoundingClientRect().top) / height, 0, 1) : 0;

  context.clearRect(0, 0, width, height);
  if (nightAmount < 1) {
    for (const leaf of leaves) {
      leaf.sway += delta * (0.6 + leaf.depth);
      leaf.spin += leaf.spinSpeed * delta;
      leaf.flip += leaf.flipSpeed * delta;
      leaf.x += (Math.sin(leaf.sway) * 26 + 14) * delta * (0.5 + leaf.depth);
      leaf.y += (24 + leaf.depth * 58) * delta - scrolled * (0.15 + leaf.depth * 0.55);
      if (leaf.y > height + 24) { leaf.y = -20; leaf.x = Math.random() * width; }
      if (leaf.y < -24) { leaf.y = height + 20; leaf.x = Math.random() * width; }
      if (leaf.x > width + 24) leaf.x = -20;
      context.save();
      context.translate(leaf.x, leaf.y);
      context.rotate(leaf.spin);
      context.scale(leaf.size * Math.cos(leaf.flip), leaf.size);
      context.globalAlpha = (0.3 + leaf.depth * 0.6) * (1 - nightAmount);
      context.fillStyle = leaf.color;
      context.fill(leafShape);
      context.strokeStyle = "rgba(60, 30, 10, .35)";
      context.lineWidth = 1;
      context.stroke(leafVein);
      context.restore();
    }
  }
  if (nightAmount > 0) {
    context.globalCompositeOperation = "lighter";
    for (const fly of fireflies) {
      fly.phase += delta * fly.speed;
      fly.x += Math.cos(fly.phase * 1.7) * 22 * delta;
      fly.y += Math.sin(fly.phase * 1.3) * 16 * delta - scrolled * 0.2;
      if (fly.y < height * 0.15) fly.y = height;
      if (fly.y > height + 10) fly.y = height * 0.3;
      context.globalAlpha = nightAmount * (0.35 + 0.65 * Math.abs(Math.sin(fly.phase * 2.1)));
      context.drawImage(glow, fly.x - fly.size / 2, fly.y - fly.size / 2, fly.size, fly.size);
    }
    context.globalCompositeOperation = "source-over";
  }
  context.globalAlpha = 1;
}

function frame(now) {
  updateParallax();
  drawParticles(now);
  if (!reducedMotion.matches) requestAnimationFrame(frame);
}

function startMotion() {
  if (reducedMotion.matches) {
    context.clearRect(0, 0, width, height);
    for (const scene of scenes.values()) {
      for (const layer of scene.layers) { layer.el.style.transform = ""; layer.el.style.opacity = ""; }
    }
    return;
  }
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

window.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}, { passive: true });
window.addEventListener("resize", seedParticles);
reducedMotion.addEventListener("change", startMotion);

const revealer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-in");
    revealer.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

makeGlow();
seedParticles();
header.classList.toggle("is-scrolled", window.scrollY > 24);
document.documentElement.classList.add("is-ready");
startMotion();
