const features = [
  [".kb-home", () => import("./home-animation.mjs")],
  ["[data-home-grainient]", () => import("./home-grainient.mjs")],
  [".kb-projects", () => import("./projects.mjs")],
  [".kb-diagram", () => import("./diagram-drag.mjs")],
  [".kb-bend-marquee", () => import("./bending-marquee.mjs")],
  ["[data-kb-globe]", () => import("./hometown-globe.mjs")],
  ["[data-bookshelf]", () => import("./bookshelf.mjs")],
  ["[data-skills]", () => import("./author-skills.mjs")],
  ["[data-site-word-count]", () => import("./site-word-count.mjs")],
];

const loaded = new Set();
let footerObserver;

function load(loader) {
  loader().catch((error) => console.error("Page feature could not load", error));
}

function loadFeatures() {
  for (const [selector, loader] of features) {
    if (!loaded.has(selector) && document.querySelector(selector)) {
      loaded.add(selector);
      load(loader);
    }
  }

  footerObserver?.disconnect();
  const footer = document.querySelector(".kb-footer__snow");
  if (!footer || loaded.has("snow")) return;

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || !entry.target.isConnected || loaded.has("snow")) return;
    observer.disconnect();
    loaded.add("snow");
    load(() => import("./footer-snow.mjs"));
  }, { rootMargin: "160px" });
  footerObserver = observer;
  observer.observe(footer);
}

if (window.document$?.subscribe) {
  window.document$.subscribe(loadFeatures);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadFeatures, { once: true });
} else {
  loadFeatures();
}
