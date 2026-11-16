const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const format = new Intl.NumberFormat("zh-CN");
const duration = 1500;

function animateOnView(digits) {
  const total = Number(digits.dataset.siteWordCount);
  const finalText = digits.textContent;
  let frameId;

  function restore() {
    cancelAnimationFrame(frameId);
    digits.textContent = finalText;
    digits.style.removeProperty("filter");
    digits.style.removeProperty("min-inline-size");
  }

  function start() {
    digits.style.minInlineSize = `${digits.getBoundingClientRect().width}px`;
    const startTime = performance.now();

    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      if (progress === 1 || reducedMotion.matches || document.hidden) {
        restore();
        return;
      }
      const remaining = 1 - progress;
      const value = Math.round(total * (1 - remaining ** 3));
      const blur = 7 * Math.min(progress * 14, 1) * remaining ** 2;
      digits.textContent = format.format(value);
      digits.style.filter = `blur(${blur}px)`;
      frameId = requestAnimationFrame(frame);
    }

    frameId = requestAnimationFrame(frame);
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    if (!reducedMotion.matches) start();
  });
  observer.observe(digits);

  return () => {
    observer.disconnect();
    restore();
  };
}

let current;
let cleanup = () => {};

function initialise() {
  const digits = document.querySelector("[data-site-word-count]");
  if (digits === current) return;
  cleanup();
  current = digits;
  cleanup = digits && !reducedMotion.matches && Number(digits.dataset.siteWordCount) > 0
    ? animateOnView(digits)
    : () => {};
}

if (window.document$?.subscribe) {
  window.document$.subscribe(initialise);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialise, { once: true });
} else {
  initialise();
}
