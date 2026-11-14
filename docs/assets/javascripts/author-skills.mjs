const walls = new Map();
const bundle = new URL("../skills-wall.js", import.meta.url);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const observer = new IntersectionObserver(entries => {
  for (const { target, isIntersecting } of entries) {
    target.toggleAttribute("data-playing", isIntersecting);
  }
});

async function syncWalls() {
  for (const [list, instance] of walls) {
    if (!list.isConnected) {
      if (instance) {
        observer.unobserve(instance.wall);
        instance.dispose();
      }
      walls.delete(list);
    }
  }
  if (reducedMotion.matches) return;
  const lists = [...document.querySelectorAll("[data-skills]")]
    .filter(list => !walls.has(list) && list.children.length);
  if (!lists.length) return;
  for (const list of lists) walls.set(list, null);
  try {
    if (!document.querySelector("link[data-skills-wall-styles]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("../skills-wall.css", import.meta.url);
      link.dataset.skillsWallStyles = "";
      document.head.append(link);
    }
    const { mountSkillsWall } = await import(bundle.href);
    for (const list of lists) {
      if (!list.isConnected) continue;
      const wall = document.createElement("div");
      wall.className = "kb-skills-wall";
      wall.setAttribute("aria-hidden", "true");
      list.before(wall);
      const dispose = mountSkillsWall(wall, list);
      walls.set(list, { wall, dispose });
      observer.observe(wall);
    }
  } catch (error) {
    for (const list of lists) {
      if (!walls.get(list)) walls.delete(list);
    }
    console.error("Failed to load the skills wall", error);
  }
}

reducedMotion.addEventListener("change", syncWalls);
if (window.document$) window.document$.subscribe(syncWalls);
else syncWalls();
