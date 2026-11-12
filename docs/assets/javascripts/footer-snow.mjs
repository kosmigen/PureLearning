// PixelSnow renderer adapted from React Bits by David Haz.
// https://reactbits.dev/backgrounds/pixel-snow
// License: assets/licenses/react-bits.txt

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const SPRITES = {
  square: [
    ['@'],
    ['oo', 'oo'],
    ['xox', 'o@o', 'xox'],
    ['xoox', 'o@@o', 'o@@o', 'xoox'],
    ['xooox', 'oo@oo', 'o@@@o', 'oo@oo', 'xooox'],
    ['xox', 'o@o', 'xox'],
    ['xoox', 'o@@o', 'o@@o', 'xoox'],
    ['xooox', 'oo@oo', 'o@@@o', 'oo@oo', 'xooox']
  ],
  round: [
    ['@'],
    ['.x.', 'x@x', '.x.'],
    ['.xx.', 'x@@x', 'x@@x', '.xx.'],
    ['.xxx.', 'xo@ox', 'x@@@x', 'xo@ox', '.xxx.'],
    ['..xxx..', '.xooox.', 'xoo@oox', 'xo@@@ox', 'xoo@oox', '.xooox.', '..xxx..'],
    ['.xx.', 'x@@x', 'x@@x', '.xx.'],
    ['.xxx.', 'xo@ox', 'x@@@x', 'xo@ox', '.xxx.'],
    ['..xxx..', '.xooox.', 'xoo@oox', 'xo@@@ox', 'xoo@oox', '.xooox.', '..xxx..']
  ],
  snowflake: [
    ['@'],
    ['.x.', 'x@x', '.x.'],
    ['..x..', 'x.o.x', '.o@o.', 'x.o.x', '..x..'],
    ['...x...', '.x.o.x.', '..ooo..', 'xoo@oox', '..ooo..', '.x.o.x.', '...x...'],
    [
      '....x....',
      '.x..o..x.',
      '..o.o.o..',
      '...ooo...',
      'xooo@ooox',
      '...ooo...',
      '..o.o.o..',
      '.x..o..x.',
      '....x....'
    ],
    ['x...x', '.o.o.', '..@..', '.o.o.', 'x...x'],
    ['x..x..x', '.o.o.o.', '..ooo..', 'xoo@oox', '..ooo..', '.o.o.o.', 'x..x..x'],
    [
      'x...x...x',
      '.o..o..o.',
      '..o.o.o..',
      '...ooo...',
      'xooo@ooox',
      '...ooo...',
      '..o.o.o..',
      '.o..o..o.',
      'x...x...x'
    ]
  ]
};

const VARIANTS = ['square', 'round', 'snowflake'];
const CELL = 9;
const LEVELS = 5;
const SLOTS = 8;
const MAX_FLAKES = 4000;
const LEVEL_WEIGHTS = [0.46, 0.27, 0.15, 0.08, 0.04];
const LEVEL_FALL = [16, 24, 34, 48, 66];
const LEVEL_LIGHT = [0.42, 0.58, 0.76, 0.92, 1];
const INTRO_SECONDS = 1.4;

const QUAD_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FLAKE_VERTEX = `#version 300 es
in vec2 aCorner;
in vec4 aFlake;
uniform vec2 uGrid;
uniform vec4 uSizes;
uniform float uLargest;
flat out ivec2 vOrigin;
flat out ivec2 vCell;
flat out int vSize;
flat out float vLight;
void main() {
  int index = int(aFlake.z + 0.5);
  int slot = index % ${SLOTS};
  int variant = index / ${SLOTS};
  int level = slot < ${LEVELS} ? slot : slot - 3;
  float size = level == 0 ? 1.0 : (level == 1 ? uSizes.x : (level == 2 ? uSizes.y : (level == 3 ? uSizes.z : uLargest)));
  vec2 origin = floor(aFlake.xy) - floor(size * 0.5);
  origin.y = uGrid.y - origin.y - size;
  vec2 corner = origin + (aCorner * 0.5 + 0.5) * size;
  gl_Position = vec4(corner / uGrid * 2.0 - 1.0, 0.0, 1.0);
  vOrigin = ivec2(origin);
  vCell = ivec2(slot * ${CELL}, variant * ${CELL});
  vSize = int(size);
  vLight = aFlake.w;
}`;

const FLAKE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
flat in ivec2 vOrigin;
flat in ivec2 vCell;
flat in int vSize;
flat in float vLight;
out vec4 outColor;
void main() {
  ivec2 local = ivec2(gl_FragCoord.xy) - vOrigin;
  if (local.x < 0 || local.y < 0 || local.x >= vSize || local.y >= vSize) discard;
  vec4 texel = texelFetch(uAtlas, vCell + local, 0);
  if (texel.r < 0.5) discard;
  outColor = vec4(vLight, texel.g * vLight, 0.0, 1.0);
}`;

const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uTarget;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec4 sum = texture(uSource, uv) * 4.0;
  sum += texture(uSource, uv - uTexel);
  sum += texture(uSource, uv + uTexel);
  sum += texture(uSource, uv + vec2(uTexel.x, -uTexel.y));
  sum += texture(uSource, uv - vec2(uTexel.x, -uTexel.y));
  outColor = sum / 8.0;
}`;

const UP = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
uniform vec2 uTarget;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec2 h = uTexel * 0.5;
  vec4 sum = texture(uSource, uv + vec2(-h.x * 2.0, 0.0));
  sum += texture(uSource, uv + vec2(h.x * 2.0, 0.0));
  sum += texture(uSource, uv + vec2(0.0, -h.y * 2.0));
  sum += texture(uSource, uv + vec2(0.0, h.y * 2.0));
  sum += texture(uSource, uv + vec2(-h.x, h.y)) * 2.0;
  sum += texture(uSource, uv + h) * 2.0;
  sum += texture(uSource, uv + vec2(h.x, -h.y)) * 2.0;
  sum += texture(uSource, uv - h) * 2.0;
  outColor = (sum / 12.0 + texture(uBase, uv)) * 0.5;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uSnow;
uniform sampler2D uGlowMap;
uniform vec2 uResolution;
uniform vec2 uGrid;
uniform float uPixel;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uGlow;
uniform float uFade;
uniform float uOpacity;
uniform float uLightMode;
out vec4 outColor;

float smootherstep(float edge, float x) {
  float t = clamp(x / max(edge, 0.0001), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  ivec2 cell = ivec2(floor(gl_FragCoord.xy / uPixel));
  vec4 snow = texelFetch(uSnow, clamp(cell, ivec2(0), ivec2(uGrid) - 1), 0);
  vec2 glow = texture(uGlowMap, gl_FragCoord.xy / (uGrid * uPixel)).rg;
  float edge = uFade * 0.5;
  float mask = smootherstep(edge, uv.x) * smootherstep(edge, 1.0 - uv.x) * smootherstep(edge, uv.y) * smootherstep(edge, 1.0 - uv.y);
  mask *= uOpacity;
  float body = clamp(snow.r * uBrightness, 0.0, 1.0);
  float core = clamp(snow.g * uBrightness, 0.0, 1.0);
  float halo = clamp(glow.r * uGlow * uBrightness, 0.0, 1.0);
  if (uLightMode > 0.5) {
    vec3 tint = mix(uColor, vec3(1.0), clamp(core / max(body, 0.001), 0.0, 1.0) * 0.45);
    float alpha = body * 0.95;
    vec4 color = vec4(tint * alpha, alpha);
    float soft = halo * 0.22 * (1.0 - alpha);
    color += vec4(uColor * soft, soft);
    outColor = color * mask;
  } else {
    vec3 color = uColor * (body * 0.82 + core * 0.18) + uColor * halo * 0.55;
    color = 1.0 - exp(-color * 1.6);
    color *= mask;
    outColor = vec4(color, max(color.r, max(color.g, color.b)));
  }
}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const seeded = seed => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl, vertexSource, fragmentSource, attributes) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name));
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

const buildAtlas = () => {
  const width = CELL * SLOTS;
  const height = CELL * VARIANTS.length;
  const data = new Uint8Array(width * height * 4);
  VARIANTS.forEach((variant, row) => {
    SPRITES[variant].forEach((rows, level) => {
      rows.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          const mark = line[x];
          if (mark === '.') continue;
          const offset = ((row * CELL + y) * width + level * CELL + x) * 4;
          data[offset] = 255;
          data[offset + 1] = mark === '@' ? 255 : mark === 'o' ? 128 : 0;
          data[offset + 3] = 255;
        }
      });
    });
  });
  return { data, width, height };
};

function createPixelSnow(container, canvas) {
  const settings = {
    color: '#ffffff',
    variant: VARIANTS.indexOf('snowflake'),
    density: 0.42,
    speed: 0.65,
    wind: 0.25,
    sway: 0.5,
    flakeSize: 0.8,
    pixelSize: 2,
    depth: 0.6,
    brightness: 0.85,
    glow: 0.65,
    twinkle: 0.35,
    mouseInteraction: true,
    intro: true,
    fade: 0.25,
    opacity: 0.58,
    lightMode: false,
    dpr: 1.5,
  };

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false
  });
  if (!gl) return () => {};

  const programs = {
    flake: link(gl, FLAKE_VERTEX, FLAKE_FRAGMENT, ['aCorner', 'aFlake']),
    down: link(gl, QUAD_VERTEX, DOWN, ['aPosition']),
    up: link(gl, QUAD_VERTEX, UP, ['aPosition']),
    composite: link(gl, QUAD_VERTEX, COMPOSITE, ['aPosition'])
  };
  if (Object.values(programs).some(entry => !entry)) {
    for (const entry of Object.values(programs)) if (entry) gl.deleteProgram(entry.program);
    return () => {};
  }

  const atlas = buildAtlas();
  const atlasTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas.width, atlas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const quadBuffer = gl.createBuffer();
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const cornerBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  const flakeVao = gl.createVertexArray();
  gl.bindVertexArray(flakeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);

  const createTarget = filter => {
    const target = { texture: gl.createTexture(), framebuffer: gl.createFramebuffer(), width: 0, height: 0 };
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return target;
  };
  const sizeTarget = (target, width, height) => {
    if (target.width === width && target.height === height) return;
    target.width = width;
    target.height = height;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  };
  const snow = createTarget(gl.NEAREST);
  const down = [createTarget(gl.LINEAR), createTarget(gl.LINEAR), createTarget(gl.LINEAR)];
  const up = [createTarget(gl.LINEAR), createTarget(gl.LINEAR)];

  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const toRgb = value => {
    if (colorCache.has(value)) return colorCache.get(value);
    let rgb = [1, 1, 1];
    if (probe) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#ffffff';
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      rgb = [r / 255, g / 255, b / 255];
    }
    colorCache.set(value, rgb);
    return rgb;
  };

  const rng = seeded(4271);
  const flakes = [];
  const view = { width: 1, height: 1, ratio: 1, pixel: 1, gridWidth: 1, gridHeight: 1 };
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false, time: 0 };
  const state = { time: 0, intro: settings.intro && !reducedMotion.matches ? 0 : 1, push: 0 };
  const instances = new Float32Array(MAX_FLAKES * 4);
  let raf = 0;
  let last = 0;
  let visible = false;

  const pickLevel = (r, s) => {
    const shift = s.flakeSize - 1;
    let total = 0;
    const weights = LEVEL_WEIGHTS.map((weight, level) => weight * Math.pow(2.2, shift * (level - 1.5)));
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let level = 0; level < LEVELS; level++) {
      total += weights[level] / sum;
      if (r <= total) return level;
    }
    return LEVELS - 1;
  };

  const spawn = (flake, s, top) => {
    flake.level = pickLevel(rng(), s);
    flake.x = rng() * (view.width + 40) - 20;
    flake.y = top ? -10 - rng() * 30 : rng() * view.height;
    flake.vx = 0;
    flake.vy = LEVEL_FALL[flake.level];
    flake.phase = rng() * Math.PI * 2;
    flake.rate = 0.6 + rng() * 0.9;
    flake.sparkle = rng() * 100;
    flake.drift = 0.7 + rng() * 0.6;
    flake.alt = rng() < 0.5;
    flake.reveal = rng();
    flake.levelSize = s.flakeSize;
  };

  const populate = s => {
    const target = Math.round(clamp((view.width * view.height * s.density) / 1100, 0, MAX_FLAKES));
    while (flakes.length < target) {
      const flake = {};
      spawn(flake, s, false);
      flakes.push(flake);
    }
    if (flakes.length > target) flakes.length = target;
  };

  const simulate = (s, dt) => {
    const fall = s.speed;
    const windSpeed = s.wind * 46;
    const radius = 120;
    const pushing = state.push > 0.001 && pointer.inside;
    const margin = 24;
    for (const flake of flakes) {
      if (flake.levelSize !== s.flakeSize) {
        flake.level = pickLevel(rng(), s);
        flake.levelSize = s.flakeSize;
      }
      const level = flake.level;
      const parallax = 1 - s.depth * (1 - (level + 1) / LEVELS) * 0.75;
      const swing = Math.sin(state.time * flake.rate + flake.phase) * s.sway * (6 + level * 7);
      const targetX = (windSpeed * parallax + swing) * flake.drift;
      const targetY = LEVEL_FALL[level] * parallax * fall * flake.drift;
      const ease = 1 - Math.exp(-dt * 2.2);
      flake.vx += (targetX - flake.vx) * ease;
      flake.vy += (targetY - flake.vy) * ease;
      if (pushing) {
        const dx = flake.x - pointer.x;
        const dy = flake.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < radius && distance > 0.001) {
          const near = 1 - distance / radius;
          const repel = near * near * near * state.push * 1500 * dt;
          const carry = near * near * state.push * dt * 5;
          flake.vx += (dx / distance) * repel + pointer.vx * carry;
          flake.vy += (dy / distance) * repel + pointer.vy * carry;
        }
      }
      flake.x += flake.vx * dt;
      flake.y += flake.vy * dt;
      if (fall >= 0 ? flake.y > view.height + margin : flake.y < -margin) {
        spawn(flake, s, true);
        flake.reveal = -1;
        if (fall < 0) flake.y = view.height + 10 + rng() * 30;
      }
      if (flake.x < -margin) flake.x += view.width + margin * 2;
      else if (flake.x > view.width + margin) flake.x -= view.width + margin * 2;
    }
  };

  const run = (entry, target, width, height) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(entry.program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const bindTexture = (entry, name, unit, texture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(entry.uniforms[name], unit);
  };

  const render = () => {
    const s = settings;
    sizeTarget(snow, view.gridWidth, view.gridHeight);
    let count = 0;
    const sizes = SPRITES[VARIANTS[s.variant]].map(rows => rows.length);
    const sweep = state.intro * 1.75;
    for (const flake of flakes) {
      const level = flake.level;
      const depthLight = 1 - s.depth * (1 - LEVEL_LIGHT[level]);
      const spark = Math.pow(Math.max(0, Math.sin(state.time * 0.9 + flake.sparkle)), 60) * s.twinkle;
      const reveal =
        flake.reveal < 0 || state.intro >= 1
          ? 1
          : clamp((sweep - flake.y / view.height - flake.reveal * 0.25) / 0.35, 0, 1);
      if (reveal <= 0) continue;
      const slot = level >= 2 && flake.alt ? level + 3 : level;
      const o = count * 4;
      instances[o] = flake.x / view.pixel;
      instances[o + 1] = flake.y / view.pixel;
      instances[o + 2] = s.variant * SLOTS + slot;
      instances[o + 3] = Math.min(1, depthLight * (0.85 + spark * 0.6)) * reveal * reveal;
      count++;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, snow.framebuffer);
    gl.viewport(0, 0, snow.width, snow.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count > 0) {
      const flake = programs.flake;
      gl.useProgram(flake.program);
      gl.uniform2f(flake.uniforms.uGrid, snow.width, snow.height);
      gl.uniform4f(flake.uniforms.uSizes, sizes[1], sizes[2], sizes[3], 0);
      gl.uniform1f(flake.uniforms.uLargest, sizes[4]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(flake.uniforms.uAtlas, 0);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.bindVertexArray(flakeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, instances.subarray(0, count * 4), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    }

    gl.bindVertexArray(quadVao);
    let source = snow;
    for (let level = 0; level < down.length; level++) {
      const target = down[level];
      sizeTarget(target, Math.max(1, Math.ceil(source.width / 2)), Math.max(1, Math.ceil(source.height / 2)));
      gl.useProgram(programs.down.program);
      gl.uniform2f(programs.down.uniforms.uTexel, 1 / source.width, 1 / source.height);
      gl.uniform2f(programs.down.uniforms.uTarget, target.width, target.height);
      bindTexture(programs.down, 'uSource', 0, source.texture);
      run(programs.down, target, target.width, target.height);
      source = target;
    }
    for (let level = up.length - 1; level >= 0; level--) {
      const from = level === up.length - 1 ? down[down.length - 1] : up[level + 1];
      const target = up[level];
      sizeTarget(target, down[level].width, down[level].height);
      gl.useProgram(programs.up.program);
      gl.uniform2f(programs.up.uniforms.uTexel, 1 / from.width, 1 / from.height);
      gl.uniform2f(programs.up.uniforms.uTarget, target.width, target.height);
      bindTexture(programs.up, 'uSource', 0, from.texture);
      bindTexture(programs.up, 'uBase', 1, down[level].texture);
      run(programs.up, target, target.width, target.height);
    }

    const composite = programs.composite;
    const c = composite.uniforms;
    gl.useProgram(composite.program);
    gl.uniform2f(c.uResolution, canvas.width, canvas.height);
    gl.uniform2f(c.uGrid, snow.width, snow.height);
    gl.uniform1f(c.uPixel, view.pixel * view.ratio);
    gl.uniform3fv(c.uColor, toRgb(s.color));
    gl.uniform1f(c.uBrightness, s.brightness);
    gl.uniform1f(c.uGlow, s.glow);
    gl.uniform1f(c.uFade, s.fade);
    gl.uniform1f(c.uOpacity, s.opacity);
    gl.uniform1f(c.uLightMode, s.lightMode ? 1 : 0);
    bindTexture(composite, 'uSnow', 0, snow.texture);
    bindTexture(composite, 'uGlowMap', 1, up[0].texture);
    run(composite, null, canvas.width, canvas.height);
  };

  const frame = now => {
    raf = 0;
    if (!visible || document.hidden || reducedMotion.matches || gl.isContextLost()) return;
    const s = settings;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!s.intro) state.intro = 1;
    else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);
    const goal = s.mouseInteraction && pointer.inside ? 1 : 0;
    state.push += (goal - state.push) * (1 - Math.exp(-dt * (goal ? 6 : 3)));
    pointer.vx *= Math.exp(-dt * 6);
    pointer.vy *= Math.exp(-dt * 6);
    populate(s);
    state.time += dt;
    simulate(s, dt);
    render();
    raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!raf && visible && !document.hidden && !reducedMotion.matches && !gl.isContextLost()) {
      raf = requestAnimationFrame(frame);
    }
  };

  const resize = () => {
    const s = settings;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
    view.width = width;
    view.height = height;
    view.ratio = ratio;
    view.pixel = Math.max(1, Math.round(s.pixelSize * ratio)) / ratio;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    view.gridWidth = Math.max(1, Math.ceil(width / view.pixel));
    view.gridHeight = Math.max(1, Math.ceil(height / view.pixel));
    populate(s);
    wake();
  };

  const onPointerMove = event => {
    if (event.pointerType === 'touch' || !visible || reducedMotion.matches) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();
    if (pointer.inside && pointer.time) {
      const elapsed = Math.max(1, now - pointer.time) / 1000;
      pointer.vx = clamp((x - pointer.x) / elapsed, -3000, 3000);
      pointer.vy = clamp((y - pointer.y) / elapsed, -3000, 3000);
    }
    pointer.x = x;
    pointer.y = y;
    pointer.time = now;
    pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    wake();
  };

  const onPointerLeave = () => {
    pointer.inside = false;
    wake();
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    pointer.inside = false;
  };

  const update = () => {
    if (visible && !document.hidden && !reducedMotion.matches) wake();
    else stop();
  };

  const updateTheme = () => {
    settings.color = getComputedStyle(canvas).color;
    settings.lightMode = document.body.dataset.mdColorScheme !== 'slate';
    update();
  };

  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  intersection.observe(container);
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });

  const events = new AbortController();
  const { signal } = events;
  container.addEventListener('pointermove', onPointerMove, { passive: true, signal });
  container.addEventListener('pointerleave', onPointerLeave, { signal });
  document.addEventListener('visibilitychange', update, { signal });
  reducedMotion.addEventListener('change', update, { signal });
  window.addEventListener('pagehide', stop, { signal });
  window.addEventListener('pageshow', update, { signal });

  updateTheme();
  resize();

  return () => {
    stop();
    events.abort();
    sizeObserver.disconnect();
    intersection.disconnect();
    themeObserver.disconnect();
    for (const target of [snow, ...down, ...up]) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    for (const entry of Object.values(programs)) gl.deleteProgram(entry.program);
    gl.deleteTexture(atlasTexture);
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(cornerBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteVertexArray(quadVao);
    gl.deleteVertexArray(flakeVao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

let currentFooter;
let dispose = () => {};

function initialiseFooterSnow() {
  const footer = document.querySelector('.kb-footer');
  if (footer === currentFooter) return;
  dispose();
  dispose = () => {};
  currentFooter = footer;
  const canvas = footer?.querySelector('.kb-footer__snow');
  if (!canvas) return;

  let visible = false;
  let cleanup;
  function mount() {
    if (!visible || reducedMotion.matches || cleanup) return;
    cleanup = createPixelSnow(footer, canvas);
    observer.disconnect();
    reducedMotion.removeEventListener('change', mount);
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    mount();
  });
  observer.observe(footer);
  reducedMotion.addEventListener('change', mount);
  dispose = () => {
    observer.disconnect();
    reducedMotion.removeEventListener('change', mount);
    cleanup?.();
  };
}

if (window.document$?.subscribe) {
  window.document$.subscribe(initialiseFooterSnow);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialiseFooterSnow, { once: true });
} else {
  initialiseFooterSnow();
}
