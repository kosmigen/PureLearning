// Bending Marquee adapted from React Bits by David Haz.
// https://pro.reactbits.dev/docs/components/bending-marquee
// License: assets/licenses/react-bits.txt

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const DEFAULTS = {
  items: ["保持好奇", "持续学习", "认真记录", "慢慢构建"],
  separator: "✳︎", // ✳︎ text presentation
  rows: 2,
  speed: 16, // seconds per sequence loop
  bend: 50, // wing fold angle in degrees
  depth: -200, // scene z offset in px
  perspective: 800, // scene perspective in px
  pauseDamping: 0.7, // seconds to ease in and out on hover
  centerMax: 420, // center panel projected width in px
};

const escapeHtml = value =>
  String(value).replace(/[&<>"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[char]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readConfig(container) {
  const { dataset } = container;
  return {
    ...DEFAULTS,
    items: (dataset.items || DEFAULTS.items.join("|")).split("|").filter(Boolean),
    separator: dataset.separator || DEFAULTS.separator,
    rows: Math.max(1, Number(dataset.rows) || DEFAULTS.rows),
    speed: Math.max(1, Number(dataset.speed) || DEFAULTS.speed),
    bend: Math.max(0, Math.min(85, Number(dataset.bend) || DEFAULTS.bend)),
    depth: Number(dataset.depth) || DEFAULTS.depth,
    perspective: Math.max(1, Number(dataset.perspective) || DEFAULTS.perspective),
    centerMax: Math.max(80, Number(dataset.center) || DEFAULTS.centerMax),
    pauseDamping: Math.max(0.05, Number(dataset.pauseDamping) || DEFAULTS.pauseDamping),
  };
}

function sequenceHtml(config) {
  const mark = `<span class="kb-bend-marquee__mark" aria-hidden="true">${escapeHtml(config.separator)}</span>`;
  const phrases = config.items.map(item => `<span class="kb-bend-marquee__phrase">${escapeHtml(item)}</span>`);
  return `${phrases.join(mark)}${mark}`;
}

function createMarquee(container) {
  const config = readConfig(container);
  const sequence = sequenceHtml(config);
  container.style.perspective = `${config.perspective}px`;

  const scene = document.createElement("div");
  scene.className = "kb-bend-marquee__scene";
  scene.style.transform = `translateZ(${config.depth}px)`;
  container.appendChild(scene);

  const panels = ["left", "center", "right"].map(side => {
    const panel = document.createElement("div");
    panel.className = `kb-bend-marquee__panel kb-bend-marquee__panel--${side}`;
    if (side === "left") panel.style.transform = `rotateY(${config.bend}deg)`;
    if (side === "right") panel.style.transform = `rotateY(${-config.bend}deg)`;
    const bands = Array.from({ length: config.rows }, () => {
      const band = document.createElement("div");
      band.className = "kb-bend-marquee__band";
      const strip = document.createElement("div");
      strip.className = "kb-bend-marquee__strip";
      band.appendChild(strip);
      panel.appendChild(band);
      return { band, strip };
    });
    scene.appendChild(panel);
    return { panel, bands };
  });

  const measurer = document.createElement("div");
  measurer.className = "kb-bend-marquee__measure";
  measurer.innerHTML = `<span class="kb-bend-marquee__run">${sequence}</span>`;
  container.appendChild(measurer);
  const seqWidth = measurer.firstElementChild.getBoundingClientRect().width || 1;
  measurer.remove();

  const copiesFor = panelWidth => Math.max(2, Math.ceil(panelWidth / seqWidth) + 1);

  function layout() {
    const width = container.clientWidth;
    const { bend, depth, perspective } = config;
    const theta = (bend * Math.PI) / 180;
    const scale = perspective / (perspective - depth);
    // Original geometry: a fixed-width center panel with the wings folding
    // toward the viewer and stretching to the container edges, so the ribbon
    // narrows at its center like the React Bits demo; shrink the center only
    // when the container cannot fit it.
    const center = Math.min(config.centerMax, Math.max(80, width - 160));
    const wing = (width - center) / 2;
    const centerDom = center / scale;
    // The vanishing point sits at the container center (perspective-origin
    // 50%), so the center panel is centered on it and both seams project
    // symmetrically to `wing` px from the container edges.
    const seam = width / 2 - centerDom / 2;
    // Exact inverse projection: a wing folded `bend` degrees toward the
    // viewer needs this many unfolded px for its far edge to land exactly
    // on the container edge.
    const wingDom =
      (wing * (perspective - depth)) /
      (Math.cos(theta) * perspective + (width / 2) * Math.sin(theta));
    panels[0].left = seam - wingDom;
    panels[0].panel.style.left = `${panels[0].left}px`;
    panels[0].panel.style.width = `${wingDom}px`;
    panels[1].left = seam;
    panels[1].panel.style.left = `${seam}px`;
    panels[1].panel.style.width = `${centerDom}px`;
    panels[2].left = seam + centerDom;
    panels[2].panel.style.left = `${panels[2].left}px`;
    panels[2].panel.style.width = `${wingDom}px`;
    for (const { panel, bands } of panels) {
      const copies = copiesFor(parseFloat(panel.style.width) || 0);
      for (const { strip } of bands) {
        if (strip.dataset.copies !== String(copies)) {
          strip.dataset.copies = String(copies);
          strip.innerHTML = sequence.repeat(copies);
        }
      }
    }
    scene.style.height = `${panels[0].panel.offsetHeight}px`;
  }

  let offset = 0;
  let velocity = 0;
  let raf = 0;
  let last = 0;
  let visible = false;
  let hovering = false;

  function update() {
    const enabled = visible && !document.hidden && !reducedMotion.matches;
    if (enabled) {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      velocity = 0;
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || reducedMotion.matches) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const target = hovering ? 0 : seqWidth / config.speed;
    velocity += (target - velocity) * (1 - Math.exp(-dt / config.pauseDamping));
    offset += velocity * dt;
    for (const { bands, left } of panels) {
      bands.forEach(({ strip }, row) => {
        const direction = row % 2 === 0 ? 1 : -1;
        // Offset by the panel's unfolded position so the text continues
        // across the fold seams like one band printed on folded paper.
        const local = ((((offset * direction + left) % seqWidth) + seqWidth) % seqWidth);
        strip.style.transform = `translateX(${-local}px)`;
      });
    }
    raf = requestAnimationFrame(frame);
  }

  const events = new AbortController();
  const { signal } = events;
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  visibilityObserver.observe(container);
  let resizeTimer = 0;
  const sizeObserver = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 200);
  });
  sizeObserver.observe(container);
  container.addEventListener("pointerenter", () => { hovering = true; }, { signal });
  container.addEventListener("pointerleave", () => { hovering = false; }, { signal });
  document.addEventListener("visibilitychange", update, { signal });
  reducedMotion.addEventListener("change", update, { signal });
  window.addEventListener("pagehide", update, { signal });
  window.addEventListener("pageshow", update, { signal });

  layout();

  return () => {
    events.abort();
    window.clearTimeout(resizeTimer);
    sizeObserver.disconnect();
    visibilityObserver.disconnect();
    cancelAnimationFrame(raf);
  };
}

const instances = new Map();
let initialised = false;

function initialiseBendingMarquee() {
  const containers = document.querySelectorAll(".kb-bend-marquee");
  for (const container of [...instances.keys()]) {
    if (![...containers].includes(container)) {
      instances.get(container)();
      instances.delete(container);
    }
  }
  for (const container of containers) {
    if (!instances.has(container)) instances.set(container, createMarquee(container));
  }
}

function start() {
  if (initialised) return;
  initialised = true;
  initialiseBendingMarquee();
}

if (window.document$?.subscribe) {
  window.document$.subscribe(initialiseBendingMarquee);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
