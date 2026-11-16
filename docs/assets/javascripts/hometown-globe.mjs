// Hometown globe on the author page, styled after the monochrome COBE
// showcase (the Vercel CDN globe on cobe.vercel.app): cobe itself draws
// the dotted sphere and the arcs between consecutive points. This
// module drives the camera and anchors the school pins and landmark icons.
//
// COBE 2.0.1 is bundled locally in vendor/.
// License: assets/licenses/cobe.txt

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const DEG = Math.PI / 180;
const GLOBE_RADIUS = 0.8; // Apparent radius in COBE v2's projection.
const MARKER_ELEVATION = 0.01;
const SITE_ROOT = new URL("../../", import.meta.url);

const DEFAULTS = {
  zoom: 1, // scale; 1 shows the whole sphere like cobe.vercel.app
  drift: 0.36, // rad/s of idle rotation
  tilt: 0, // extra latitude degrees above the route centroid
  samples: 16000, // dot density (the reference uses 16000)
};

// Monochrome line color (arcs and labels): near-black on the light
// theme, near-white on the dark one — the CDN showcase only comes in the
// light variant, so the dark theme mirrors it inverted.
const LINE_LIGHT = [0.11, 0.11, 0.13];
const LINE_DARK = [0.93, 0.94, 0.95];
const GLOW_LIGHT = [0.94, 0.93, 0.91]; // near-white rim glow, as on cobe.vercel.app

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Unit sphere vector for a lat/lng pair, matching COBE's shaders:
// x = -cos(lat)·cos(lng−π), y = sin(lat), z = cos(lat)·sin(lng−π).
const unitVector = (lat, lng) => {
  const r = lat * DEG;
  const a = lng * DEG - Math.PI;
  const c = Math.cos(r);
  return [-c * Math.cos(a), Math.sin(r), c * Math.sin(a)];
};

// Rotation applied by COBE's shaders: R = Rx(theta) * Ry(phi).
const rotate = (point, theta, phi) => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = Math.cos(phi);
  const f = Math.sin(phi);
  const [x, y, z] = point;
  return [
    e * x + f * z,
    f * s * x + c * y - e * s * z,
    -f * c * x + s * y + e * c * z,
  ];
};

const project = (point, theta, phi, scale, size) => {
  const [x, y, z] = rotate(point, theta, phi)
    .map(axis => axis * (GLOBE_RADIUS + MARKER_ELEVATION));
  return {
    x: size / 2 + (size / 2) * scale * x,
    y: size / 2 - (size / 2) * scale * y,
    // Same visibility rule as COBE's marker shader: on the front
    // hemisphere or outside the silhouette.
    front: z >= 0 || x * x + y * y >= GLOBE_RADIUS ** 2,
  };
};

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
const colorCache = new Map();
const toRgb = value => {
  if (colorCache.has(value)) return colorCache.get(value);
  let rgb = [1, 1, 1];
  if (probe) {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#ffffff";
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    rgb = [r / 255, g / 255, b / 255];
  }
  colorCache.set(value, rgb);
  return rgb;
};

const readTokens = () => {
  // Material puts data-md-color-scheme on <body>, where the slate token
  // overrides are declared, so read from body, not the html element.
  const styles = getComputedStyle(document.body);
  const hex = name => styles.getPropertyValue(name).trim();
  return {
    paper: hex("--color-paper"),
    ink: hex("--color-ink"),
  };
};

function readPlaces(value) {
  try {
    const places = JSON.parse(value || "[]");
    return Array.isArray(places) ? places : [];
  } catch {
    return [];
  }
}

function createSchoolCard(point) {
  const card = document.createElement("div");
  card.className = "kb-hometown-globe__label kb-hometown-globe__school-card";
  const photo = document.createElement("img");
  photo.src = new URL(point.image, SITE_ROOT);
  photo.alt = point.imageAlt || "";
  photo.loading = "lazy";
  photo.decoding = "async";
  const name = document.createElement("strong");
  name.textContent = point.name;
  const subtitle = document.createElement("span");
  subtitle.textContent = point.subtitle;
  card.append(photo, name, subtitle);
  return card;
}

function createHometownGlobe(container) {
  const { dataset } = container;
  const points = readPlaces(dataset.points);
  const landmarks = readPlaces(dataset.landmarks);
  if (!points.length) return () => {};
  const config = { ...DEFAULTS };
  for (const key of ["zoom", "drift", "tilt", "samples"]) {
    if (dataset[key] !== undefined) config[key] = Number(dataset[key]);
  }
  const vectors = points.map(point => unitVector(point.lat, point.lng));
  // Camera looks at the centroid of the route so the whole journey sits
  // on the globe face; theta = asin(y), phi = atan2(-x, z) per COBE's
  // rotation matrix.
  const centroid = (() => {
    const sum = [0, 0, 0];
    for (const vector of vectors) {
      sum[0] += vector[0];
      sum[1] += vector[1];
      sum[2] += vector[2];
    }
    const length = Math.hypot(...sum) || 1;
    return [sum[0] / length, sum[1] / length, sum[2] / length];
  })();
  const baseTheta = Math.asin(centroid[1]) + config.tilt * DEG;
  const camera = {
    phi: Math.atan2(-centroid[0], centroid[2]),
    theta: baseTheta,
    scale: config.zoom,
  };
  const globeCanvas = document.createElement("canvas");
  globeCanvas.className = "kb-hometown-globe__surface";
  const viewport = document.createElement("div");
  viewport.className = "kb-hometown-globe__viewport";
  viewport.setAttribute("aria-hidden", "true");
  viewport.append(globeCanvas);
  const locations = [...points, ...landmarks].map((point, index) => {
    const landmark = index >= points.length;
    const card = !landmark && Boolean(point.image);
    const pin = document.createElement(card ? "button" : "div");
    pin.className = "kb-hometown-globe__pin";
    pin.setAttribute("data-hidden", "");
    if (card) {
      pin.type = "button";
      pin.disabled = true;
      pin.classList.add("kb-hometown-globe__pin--school");
      pin.setAttribute("aria-label", point.name);
    } else {
      pin.setAttribute("aria-hidden", "true");
    }
    if (landmark) {
      pin.classList.add("kb-hometown-globe__pin--landmark");
      pin.textContent = point.icon;
    } else {
      const pyramid = document.createElement("div");
      pyramid.className = "kb-hometown-globe__pyramid";
      for (let face = 0; face < 4; face++) pyramid.append(document.createElement("span"));
      pin.append(pyramid);
    }

    const label = card ? createSchoolCard(point) : document.createElement("div");
    if (!card) {
      label.setAttribute("aria-hidden", "true");
      label.className = "kb-hometown-globe__label";
      if (landmark) label.classList.add("kb-hometown-globe__label--landmark");
      label.textContent = point.name;
    }
    label.setAttribute("data-hidden", "");
    return { pin, label, landmark, card, vector: vectors[index] ?? unitVector(point.lat, point.lng) };
  });
  container.append(viewport, ...locations.flatMap(({ pin, label, card }) => card ? [pin] : [pin, label]));
  const cards = locations.filter(location => location.card);
  const cardRow = document.createElement("div");
  const schoolPicker = document.createElement("div");
  const compactScreen = window.matchMedia("(max-width: 600px)");
  schoolPicker.className = "kb-hometown-globe__school-picker";
  schoolPicker.setAttribute("role", "group");
  schoolPicker.setAttribute("aria-label", "选择学校");
  const schoolButtons = cards.map(({ pin }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = pin.getAttribute("aria-label");
    return button;
  });
  let floatingCards = false;
  function selectSchool(index) {
    cards.forEach(({ pin, label }, i) => {
      const selected = i === index;
      label.toggleAttribute("data-selected", selected);
      pin.setAttribute("aria-pressed", String(selected));
      schoolButtons[i].setAttribute("aria-pressed", String(selected));
    });
  }
  if (cards.length) {
    const wrapper = document.createElement("div");
    wrapper.className = "kb-hometown-globe-wrap";
    cardRow.className = "kb-hometown-globe__school-cards";
    schoolPicker.append(...schoolButtons);
    cardRow.append(schoolPicker, ...cards.map(({ label }) => label));
    container.before(wrapper);
    wrapper.append(container, cardRow);
    selectSchool(0);
  }

  const scene = { size: 0, visible: false, hovering: false, raf: 0, last: 0 };
  let disposed = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let momentumPhi = 0;
  let momentumTheta = 0;
  let tokens = readTokens();
  let globe = null;

  const events = new AbortController();
  const { signal } = events;
  cards.forEach(({ pin }, index) => {
    pin.addEventListener("click", () => selectSchool(index), { signal });
    schoolButtons[index].addEventListener("click", () => selectSchool(index), { signal });
  });
  compactScreen.addEventListener("change", resize, { signal });
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    scene.visible = entry.isIntersecting;
    update();
  });
  visibilityObserver.observe(container);
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
  container.addEventListener("pointerenter", () => { scene.hovering = true; }, { signal });
  container.addEventListener("pointerleave", () => { scene.hovering = false; }, { signal });
  document.addEventListener("visibilitychange", update, { signal });
  reducedMotion.addEventListener("change", update, { signal });
  window.addEventListener("pagehide", stop, { signal });
  window.addEventListener("pageshow", update, { signal });

  // Drag to rotate, with the reference site's feel: 300 px of horizontal
  // drag turns the globe 1 rad, vertical drag is gentler, and releasing
  // keeps the last velocity as decaying momentum.
  container.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    lastT = performance.now();
    if (!event.target.closest("button:enabled")) container.setPointerCapture(event.pointerId);
  }, { signal });
  container.addEventListener("pointermove", event => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    lastT = now;
    camera.phi += dx / 300;
    camera.theta = clamp(camera.theta + dy / 1000, baseTheta - 0.4, baseTheta + 0.4);
    momentumPhi = clamp((dx / 300) / (dt / 1000), -0.15, 0.15) * 0.3;
    momentumTheta = clamp((dy / 1000) / (dt / 1000), -0.15, 0.15) * 0.08;
    applyView();
    drawOverlay();
  }, { signal });
  const endDrag = () => { dragging = false; };
  container.addEventListener("pointerup", endDrag, { signal });
  container.addEventListener("pointercancel", endDrag, { signal });
  container.addEventListener("pointerleave", endDrag, { signal });

  function drawOverlay() {
    if (!scene.size) return;
    const items = locations.flatMap(({ pin, label, landmark, card, vector }) => {
      const { x, y, front } = project(vector, camera.theta, camera.phi, camera.scale, scene.size);
      pin.toggleAttribute("data-hidden", !front);
      if (card) pin.disabled = floatingCards || !front;
      if (!front) {
        label.setAttribute("data-hidden", "");
        return [];
      }
      pin.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      return [{ pin, label, landmark, card, x, y }];
    });
    placeLabels(items);
  }

  // Give school names priority. Landmark icons stay visible when their labels would overlap.
  function placeLabels(items) {
    const pinBoxes = items.map(({ pin, landmark, x, y }) => ({
      landmark, x, width: pin.offsetWidth, top: y - pin.offsetHeight, bottom: y,
    }));
    const schoolPinBoxes = pinBoxes.filter(box => !box.landmark);
    const labelBoxes = [];
    const visibleCards = floatingCards
      ? items.filter(item => item.card).sort((a, b) => a.x - b.x) : [];
    const cardWidth = visibleCards[0]?.label.offsetWidth || 0;
    const gap = 8;
    const [firstCard, secondCard] = visibleCards;
    const paired = secondCard && secondCard.x - firstCard.x < cardWidth + gap;
    const pairLeft = paired
      ? clamp((firstCard.x + secondCard.x - gap) / 2 - cardWidth, 0, scene.size - 2 * cardWidth - gap)
      : 0;
    for (const [index, { label, x, y }] of visibleCards.entries()) {
      const left = paired ? pairLeft + index * (cardWidth + gap)
        : clamp(x - cardWidth / 2, 0, scene.size - cardWidth);
      const labelX = left + cardWidth / 2;
      const height = label.offsetHeight;
      let top = Math.min(y + 8, scene.size - height);
      const nearbyPins = schoolPinBoxes.filter(pin =>
        Math.abs(labelX - pin.x) < (cardWidth + pin.width) / 2 + 4
      ).sort((a, b) => a.top - b.top);
      for (const pin of nearbyPins) {
        if (top < pin.bottom + 4 && top + height > pin.top - 4) top = pin.bottom + 4;
      }
      if (top + height > scene.size) top = nearbyPins[0].top - height - 4;
      label.style.setProperty("--kb-card-position", `translate(${left}px, ${top}px)`);
      label.removeAttribute("data-hidden");
      labelBoxes.push({ x: labelX, top, bottom: top + height, width: cardWidth });
    }
    items.sort((a, b) => Number(a.landmark) - Number(b.landmark) || a.y - b.y);
    for (const { label, landmark, card, x, y } of items) {
      if (card) continue;
      const width = label.offsetWidth || 8 * label.textContent.length + 14;
      const height = label.offsetHeight || 18;
      const labelX = clamp(x, width / 2, scene.size - width / 2);
      let top = y + 4;
      const overlaps = box => Math.abs(labelX - box.x) < (width + box.width) / 2 + 4 &&
        top < box.bottom + 4 && top + height + 4 > box.top;
      if (landmark) {
        if (top + height > scene.size || pinBoxes.some(overlaps) || labelBoxes.some(overlaps)) {
          label.setAttribute("data-hidden", "");
          continue;
        }
      } else {
        const obstacles = [...schoolPinBoxes, ...labelBoxes].sort((a, b) => a.top - b.top);
        for (const box of obstacles) {
          if (overlaps(box)) top = box.bottom + 4;
        }
      }
      labelBoxes.push({ x: labelX, top, bottom: top + height, width });
      label.style.transform = `translate(${labelX}px, ${top}px) translateX(-50%)`;
      label.removeAttribute("data-hidden");
    }
  }

  function applyView() {
    if (!globe) return;
    globe.update({ phi: camera.phi, theta: camera.theta, scale: camera.scale });
  }

  function frame(now) {
    scene.raf = 0;
    if (!scene.visible || document.hidden || reducedMotion.matches) return;
    const dt = scene.last ? Math.min(0.05, (now - scene.last) / 1000) : 1 / 60;
    scene.last = now;
    if (!dragging) {
      camera.phi += config.drift * (scene.hovering ? 0.8 : 1) * dt;
      camera.phi += momentumPhi * dt;
      momentumPhi *= Math.pow(0.95, dt * 60);
      // Release momentum and a soft pull-back toward the route centroid.
      camera.theta += momentumTheta * dt +
        (baseTheta - camera.theta) * Math.min(1, dt * 1.2) * 0.05;
      momentumTheta *= Math.pow(0.95, dt * 60);
    }
    applyView();
    drawOverlay();
    scene.raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(scene.raf);
    scene.raf = 0;
    scene.last = 0;
    container.removeAttribute("data-spinning");
  }

  function update() {
    if (reducedMotion.matches) {
      stop();
      applyView();
      drawOverlay();
      return;
    }
    if (scene.visible && !document.hidden && globe) {
      container.setAttribute("data-spinning", "");
      if (!scene.raf) {
        scene.last = 0;
        scene.raf = requestAnimationFrame(frame);
      }
    } else {
      stop();
    }
  }

  function updateTheme() {
    tokens = readTokens();
    if (globe) {
      const dark = document.body.dataset.mdColorScheme === "slate";
      globe.update({
        dark: dark ? 1 : 0,
        baseColor: toRgb(dark ? tokens.ink : tokens.paper),
        glowColor: dark ? toRgb(tokens.ink) : GLOW_LIGHT,
        arcColor: dark ? LINE_DARK : LINE_LIGHT,
      });
    }
  }

  function resize() {
    const size = Math.max(1, Math.round(container.clientWidth));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    scene.size = size;
    const fill = Number.parseFloat(getComputedStyle(container).getPropertyValue("--kb-globe-fill")) || 1;
    camera.scale = config.zoom * fill;
    floatingCards = !compactScreen.matches && size >= 420 && cards.length === 2;
    cardRow.toggleAttribute("data-floating", floatingCards);
    if (cards.length) container.setAttribute("aria-hidden", String(floatingCards));
    if (!globe) return;
    globe.update({ width: size, height: size, devicePixelRatio: ratio });
    applyView();
    drawOverlay();
  }

  import("./vendor/cobe.esm.js").then(module => {
    if (disposed) return;
    // COBE's dark mode renders a black surface with baseColor dots, so in
    // slate the dots take the light ink color; in light mode the surface
    // takes the paper color and the dots render dark.
    const dark = document.body.dataset.mdColorScheme === "slate";
    globe = module.default(globeCanvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: scene.size || 1,
      height: scene.size || 1,
      phi: camera.phi,
      theta: camera.theta,
      scale: camera.scale,
      dark: dark ? 1 : 0,
      diffuse: 1.5,
      mapSamples: config.samples,
      mapBrightness: 10,
      mapBaseBrightness: 0,
      baseColor: toRgb(dark ? tokens.ink : tokens.paper),
      glowColor: dark ? toRgb(tokens.ink) : GLOW_LIGHT,
      markerColor: LINE_LIGHT,
      markerElevation: MARKER_ELEVATION,
      arcColor: dark ? LINE_DARK : LINE_LIGHT,
      arcWidth: 0.5,
      arcHeight: 0.25,
      arcs: points.slice(0, -1).map((point, i) => ({
        from: [point.lat, point.lng],
        to: [points[i + 1].lat, points[i + 1].lng],
      })),
    });
    resize();
    update();
  });

  return () => {
    disposed = true;
    stop();
    events.abort();
    sizeObserver.disconnect();
    visibilityObserver.disconnect();
    themeObserver.disconnect();
    globe?.destroy();
  };
}

const instances = new Map();

function initialiseHometownGlobes() {
  const containers = document.querySelectorAll("[data-kb-globe]");
  for (const container of [...instances.keys()]) {
    if (![...containers].includes(container)) {
      instances.get(container)();
      instances.delete(container);
    }
  }
  for (const container of containers) {
    if (!instances.has(container)) instances.set(container, createHometownGlobe(container));
  }
}

if (window.document$?.subscribe) {
  window.document$.subscribe(initialiseHometownGlobes);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseHometownGlobes, { once: true });
} else {
  initialiseHometownGlobes();
}
