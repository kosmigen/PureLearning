let disposePreviousFooter;

function initialiseFooter(body = document) {
  disposePreviousFooter?.();
  const stage = body.querySelector(".kb-footer__sand");
  const canvas = stage?.querySelector("canvas");
  const context = canvas?.getContext("2d");
  if (!context) return;

  const lifetime = new AbortController();
  const { signal } = lifetime;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0, y: 0, dx: 0, dy: 0, active: false };
  let grains = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let floatY = 0;
  let motionScale = 1;
  let rebuildRevision = 0;
  let visible = false;
  let ink;
  let accent;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function paint() {
    context.clearRect(0, 0, width, height);
    for (const grain of grains) {
      context.globalAlpha = grain.alpha;
      context.fillStyle = grain.accent ? accent : ink;
      context.fillRect(grain.x, grain.y + floatY, grain.size, grain.size);
    }
    context.globalAlpha = 1;
  }

  function wake() {
    if (!frame && visible && !document.hidden && !reduced.matches && !signal.aborted) {
      frame = requestAnimationFrame(animate);
    }
  }

  function animate(time) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches || signal.aborted) return;
    const step = lastTime ? Math.min((time - lastTime) / 16.667, 2) : 1;
    lastTime = time;
    elapsed += step / 60;
    // One gentle eight-second breath moves the whole signature together.
    floatY = Math.sin(elapsed * Math.PI * 2 / 8) * Math.min(14, height * 0.07);
    const radius = Math.min(100, Math.max(48, width * 0.085));

    for (const grain of grains) {
      if (pointer.active) {
        const dx = grain.x - pointer.x;
        const dy = grain.y + floatY - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < radius) {
          const falloff = 1 - distance / radius;
          const force = falloff * falloff * 8;
          const direction = Math.max(distance, 1);
          grain.vx += (dx / direction * force + pointer.dx * falloff * 0.12) * step;
          grain.vy += (dy / direction * force + pointer.dy * falloff * 0.12) * step;
        }
      }

      // Faster independent orbits keep the sand lively within the slow float.
      const targetX = grain.homeX + Math.sin(elapsed * grain.speed + grain.phase) * grain.orbit;
      const targetY = grain.homeY
        + Math.cos(elapsed * grain.speed * 0.85 + grain.phaseY) * grain.orbit * 0.8
        + Math.sin(elapsed * 0.9 + grain.homeX * 0.012) * motionScale;
      grain.vx += (targetX - grain.x) * 0.018 * step;
      grain.vy += (targetY - grain.y) * 0.018 * step;
      const damping = 0.88 ** step;
      grain.vx *= damping;
      grain.vy *= damping;
      grain.x += grain.vx * step;
      grain.y += grain.vy * step;
    }

    pointer.dx *= 0.7;
    pointer.dy *= 0.7;
    paint();
    wake();
  }

  function updateColors() {
    const style = getComputedStyle(stage);
    ink = style.color;
    accent = style.getPropertyValue("--color-accent").trim();
    paint();
  }

  async function rebuild() {
    const revision = ++rebuildRevision;
    const style = getComputedStyle(stage);
    const family = style.fontFamily;
    const weight = style.fontWeight;
    const text = stage.dataset.particleText;
    // A resize can arrive while font faces are being loaded or replaced.
    await document.fonts.load(`${weight} 96px ${family}`, text).catch(() => {});
    if (signal.aborted || revision !== rebuildRevision || !stage.isConnected) return;
    stop();
    pointer.active = false;
    elapsed = 0;
    floatY = 0;
    width = stage.clientWidth;
    height = stage.clientHeight;
    if (!width || !height) return;
    motionScale = Math.max(0.5, Math.min(1, width / 850));

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const textContext = mask.getContext("2d", { willReadFrequently: true });
    if (!textContext) return;
    let size = height * 0.95;
    const font = () => `${weight} ${size}px ${family}`;
    textContext.font = font();
    size *= Math.min(1, width * 0.86 / textContext.measureText(text).width);
    textContext.font = font();
    textContext.textAlign = "center";
    textContext.textBaseline = "alphabetic";
    const metrics = textContext.measureText(text);
    const baseline = height / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    textContext.fillText(text, width / 2, baseline);
    const pixels = textContext.getImageData(0, 0, width, height).data;
    const spacing = width < 600 ? 1.7 : 2.3;
    grains = [];

    // A repeatable jitter keeps the texture organic without changing on resize.
    let seed = 7183;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let y = 0; y < height; y += spacing) {
      for (let x = 0; x < width; x += spacing) {
        const alpha = pixels[(Math.floor(y) * width + Math.floor(x)) * 4 + 3];
        if (alpha < 100) continue;
        const homeX = x + (random() - 0.5) * 1.4;
        const homeY = y + (random() - 0.5) * 1.4;
        grains.push({
          x: homeX, y: homeY, homeX, homeY, vx: 0, vy: 0,
          size: 0.75 + random() * 0.9,
          alpha: (0.45 + random() * 0.5) * alpha / 255,
          accent: random() < 0.13,
          phase: random() * Math.PI * 2,
          phaseY: random() * Math.PI * 2,
          speed: 3 + random() * 2.8,
          orbit: (1.2 + random() * 2.6) * motionScale,
        });
      }
    }
    updateColors();
    stage.toggleAttribute("data-ready", grains.length > 0);
    wake();
  }

  function brush(event) {
    if (reduced.matches || (event.pointerType === "touch" && !pointer.active)) return;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    pointer.dx = pointer.active ? Math.max(-30, Math.min(30, x - pointer.x)) : 0;
    pointer.dy = pointer.active ? Math.max(-30, Math.min(30, y - pointer.y)) : 0;
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
    wake();
  }

  const leave = () => {
    pointer.active = false;
    wake();
  };
  canvas.addEventListener("pointermove", brush, { passive: true, signal });
  canvas.addEventListener("pointerdown", (event) => {
    pointer.active = true;
    brush(event);
  }, { passive: true, signal });
  canvas.addEventListener("pointerleave", leave, { signal });
  canvas.addEventListener("pointercancel", leave, { signal });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") leave();
  }, { signal });
  window.addEventListener("blur", leave, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pointer.active = false;
      stop();
    } else wake();
  }, { signal });
  reduced.addEventListener("change", rebuild, { signal });
  document.fonts.addEventListener("loadingdone", rebuild, { signal });

  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else {
      pointer.active = false;
      stop();
    }
  });
  visibility.observe(stage);
  const resize = new ResizeObserver(rebuild);
  const theme = new MutationObserver(updateColors);
  theme.observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

  disposePreviousFooter = () => {
    lifetime.abort();
    stop();
    visibility.disconnect();
    resize.disconnect();
    theme.disconnect();
  };

  resize.observe(stage);
  rebuild();
}

if (window.document$?.subscribe) {
  window.document$.subscribe(({ body }) => initialiseFooter(body));
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initialiseFooter(), { once: true });
} else {
  initialiseFooter();
}
