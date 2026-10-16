const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let homeAnimations = [];

function initialiseHomeMotion(body = document) {
  homeAnimations.forEach((animation) => animation.cancel());
  homeAnimations = [];
  const root = body.querySelector?.(".kb-home");
  if (!root || reducedMotion.matches) return;

  root.querySelectorAll(".kb-home-hero-copy").forEach((element) => {
    homeAnimations.push(element.animate(
      [{ opacity: 0.7 }, { opacity: 1 }],
      { duration: 200, easing: "ease-out" },
    ));
  });
}

reducedMotion.addEventListener("change", () => initialiseHomeMotion());
if (window.document$?.subscribe) {
  window.document$.subscribe(({ body }) => initialiseHomeMotion(body));
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initialiseHomeMotion(), { once: true });
} else {
  initialiseHomeMotion();
}
