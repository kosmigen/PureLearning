const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let current;
let dispose = () => {};

function syncHomeGrainient() {
  const host = reducedMotion.matches ? null : document.querySelector("[data-home-grainient]");
  if (host === current) return;
  dispose();
  dispose = () => {};
  current = host;
  if (!host) return;

  let active = true;
  let unmount;
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || !active) return;
    observer.disconnect();

    if (!document.querySelector("link[data-home-grainient-styles]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("../home-grainient.css", import.meta.url);
      link.dataset.homeGrainientStyles = "";
      document.head.append(link);
    }
    import(new URL("../home-grainient.js", import.meta.url).href)
      .then(({ mountHomeGrainient }) => {
        if (active && host.isConnected) unmount = mountHomeGrainient(host);
      })
      .catch((error) => console.error("Could not load homepage Grainient", error));
  });
  observer.observe(host);
  dispose = () => {
    active = false;
    observer.disconnect();
    unmount?.();
  };
}

reducedMotion.addEventListener("change", syncHomeGrainient);
if (window.document$?.subscribe) {
  window.document$.subscribe(syncHomeGrainient);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncHomeGrainient, { once: true });
} else {
  syncHomeGrainient();
}
