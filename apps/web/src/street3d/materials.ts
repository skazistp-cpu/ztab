import { Color, DoubleSide, FrontSide, GLSL3, ShaderMaterial, Vector2, Vector3, Vector4, Matrix4, NoBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, type Texture } from 'three';
import { C } from './palette.ts';

/** How many lamps the material knows (bulbs, light pools on the pavement). */
export const LAMPS = 24;
/** How many glow slots (the vault door, the packets, ...). */
export const GLOWS = 8;

/** Uniforms shared by every toon material: one place to set the sun, the shadow, the time and the lamps. */
export const shared = {
  uSunDir: { value: new Vector3(-1, 2.0, 0.7).normalize() },
  uShadowMap: { value: null as Texture | null },
  uShadowMatrix: { value: new Matrix4() },
  uShadowTexel: { value: new Vector2(1 / 2048, 1 / 2048) },
  uShadowOn: { value: 0 },
  uTime: { value: 0 },
  /** xyz: the bulb's place; w: how lit it is (0 to 1). */
  uLamp: { value: Array.from({ length: LAMPS }, () => new Vector3()) as Vector3[] },
  uLampOn: { value: new Float32Array(LAMPS) },
  uGlow: { value: new Float32Array(GLOWS) },
  /** The gold inlay down the street: x the line's z, y and z where it starts and ends (x), w its width. */
  uInlay: { value: new Vector4(0.5, 0, 40, 0.05) },
  /** The lit stretch of the inlay (x from, x to). */
  uInlayLit: { value: new Vector2(0, 0) },
  /** The short stubs from the line into each station: their x, how lit each is, and how far back they run (z). */
  uStubX: { value: new Float32Array(5) },
  uStubLit: { value: new Float32Array(5) },
  uStubZ: { value: -1.7 },
  /** The table QR's face: its top-left corner, its column and row directions, its size. */
  uQrO: { value: new Vector3() },
  uQrU: { value: new Vector3(1, 0, 0) },
  uQrV: { value: new Vector3(0, -1, 0) },
  uQrSize: { value: 0.3 },
  /** The scan line across the QR, 0 to 1 from its top; below 0, none. */
  uScan: { value: -1 },
  /** Nightfall, 0 (day) to 1 (night): the palette goes to blue-grey ink, every light glows warm. */
  uNight: { value: 0 },
  /** Where a shimmer is running along the inlay (x), far away when none. */
  uShimmer: { value: -999 },
  /** A pulse along each of the six wires (0 to 1 along it; below 0, none). */
  uPulse: { value: new Float32Array(6).fill(-1) },
  /** A light sweeping across each card's frame as it forms: xyz its centre, w the sweep (below -0.9, none). */
  uSheen: { value: Array.from({ length: 6 }, () => new Vector4(0, 0, 0, -1)) as Vector4[] },
  /** A ring of light spreading on the vault door: xy its centre, z its radius, w its strength. */
  uRipple: { value: new Vector4(0, 0, 0, 0) },
  /** The ledger's rows (top to bottom): how bright each is. */
  uRowGlow: { value: new Float32Array(6) },
  /** The ledger board's ruling: the bottom of its rows, a row's height. */
  uLedger: { value: new Vector2(0.72, 0.24) },
};

const linear = (hex: number): Color => new Color(hex);

const VERT = /* glsl */ `
attribute vec4 aInfo;
attribute vec4 aAnim;
uniform mat4 uShadowMatrix;
uniform float uTime;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec4 vShadowCoord;
flat varying vec4 vInfo;
flat varying float vInst;

void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
    vInst = float(gl_InstanceID);
  #else
    mat4 m = modelMatrix;
    vInst = 0.0;
  #endif
  vec3 pos = position;
  float mode = aAnim.w;
  if (mode > 2.5 && aAnim.x > 0.0) {
    // A bird's wings beat: the further from its body, the more they rise and fall.
    pos.y += sin(uTime * 9.0 + aAnim.z + vInst * 2.1) * aAnim.x * abs(pos.x);
  }
  vec4 world = m * vec4(pos, 1.0);
  if (aAnim.x > 0.0 && mode < 0.5) {
    // Idle sway: the higher above its root, the more a leaf moves; and a little rustle of its own.
    float h = max(0.0, world.y - aAnim.y);
    float s = sin(uTime * 1.3 + aAnim.z) * 0.65 + sin(uTime * 2.3 + aAnim.z * 1.7) * 0.35;
    float rustle = sin(uTime * 4.3 + dot(world.xyz, vec3(3.1, 2.3, 2.7))) * 0.22;
    world.x += (s + rustle) * aAnim.x * h * h;
    world.z += (cos(uTime * 1.05 + aAnim.z * 0.8) * 0.5 + rustle * 0.7) * aAnim.x * h * h;
  } else if (aAnim.x > 0.0 && mode < 1.5) {
    // Hanging things sway: string lights most at mid-span (their amplitude is set per vertex), a lamp on its rod
    // more the further below its pivot.
    float d = aAnim.x * (aAnim.y > 0.0 ? max(0.0, aAnim.y - world.y) : 1.0);
    world.x += d * sin(uTime * 1.7 + aAnim.z);
    world.z += d * 0.6 * sin(uTime * 1.3 + aAnim.z * 1.3);
  } else if (aAnim.x > 0.0 && mode < 2.5) {
    // An awning's scalloped edge ripples, a wave running along it.
    float below = clamp((aAnim.y - world.y) / 0.25, 0.0, 1.0);
    world.z += aAnim.x * sin(uTime * 2.2 + world.x * 4.0 + aAnim.z) * below;
    world.y += aAnim.x * 0.3 * cos(uTime * 2.2 + world.x * 4.0 + aAnim.z) * below;
  }
  vec3 n = mat3(m) * normal;
  vWorldNormal = normalize(n);
  vViewNormal = normalize(mat3(viewMatrix) * vWorldNormal);
  vWorldPos = world.xyz;
  vShadowCoord = uShadowMatrix * world;
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DShadow;
uniform vec3 uSunDir;
uniform sampler2DShadow uShadowMap;
uniform vec2 uShadowTexel;
uniform float uShadowOn;
uniform float uTime;
uniform vec3 uLamp[${LAMPS}];
uniform float uLampOn[${LAMPS}];
uniform float uGlow[${GLOWS}];
uniform vec4 uInlay;
uniform vec2 uInlayLit;
uniform float uStubX[5];
uniform float uStubLit[5];
uniform float uStubZ;
uniform vec3 uQrO;
uniform vec3 uQrU;
uniform vec3 uQrV;
uniform float uQrSize;
uniform float uScan;
uniform float uNight;
uniform float uShimmer;
uniform float uPulse[6];
uniform vec4 uSheen[6];
uniform vec4 uRipple;
uniform float uRowGlow[6];
uniform vec2 uLedger;
uniform vec3 uGoldDim;
uniform vec3 uGoldLit;
uniform vec3 uQrInk;
uniform vec3 uGlass;
uniform vec3 uGrout;
uniform vec3 uBevel;
uniform vec3 uBulbOff;
uniform vec3 uBulbOn;
uniform vec3 uWarm;
uniform float uOpacity;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec4 vShadowCoord;
flat varying vec4 vInfo;
flat varying float vInst;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** Large soft cloud shadows drifting over the street (where the sun's ray through this point meets the ground). */
float cloudAt(vec3 p) {
  vec2 g = p.xz - uSunDir.xz / uSunDir.y * p.y;
  vec2 q = g * 0.07 + uTime * vec2(0.022, 0.009);
  float n = vnoise(q) * 0.6 + vnoise(q * 2.03 + 7.1) * 0.28 + vnoise(q * 4.1 + 3.7) * 0.12;
  return smoothstep(0.5, 0.74, n);
}

float shadowAt() {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vShadowCoord.xyz / vShadowCoord.w;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float z = p.z - 0.0015;
  float s = 0.0;
  // 16 hardware-filtered taps over a 4x4 grid: a soft, smooth edge (the pictures' shadows are soft, not dithered).
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      vec2 o = (vec2(float(i), float(j)) - 1.5) * uShadowTexel * 1.35;
      s += texture(uShadowMap, vec3(p.xy + o, z));
    }
  }
  return s / 16.0;
}

/* The toon ramp in linear light, fitted to the station pictures' faces (measured: lit faces 0.916, right faces
   0.732 in sRGB luminance): shade 0.56, a middle step for round things, left faces 0.92, tops 1. Each step is
   anti-aliased over a pixel. */
float ramp(float x) {
  float aa = max(fwidth(x), 0.002) * 0.8;
  float t1 = smoothstep(0.06 - aa, 0.06 + aa, x);
  float t2 = smoothstep(0.2 - aa, 0.2 + aa, x);
  float t3 = smoothstep(0.5 - aa, 0.5 + aa, x);
  return 0.56 + 0.18 * t1 + 0.18 * t2 + 0.08 * t3;
}

/* The decorative table code: three finder squares and a scatter of modules on a 23-module grid. 23 is not a size
   any QR version has, and the modules are noise, so no reader can decode it (checked with jsQR). */
float finder(vec2 l) {
  vec2 c = abs(l - 3.0);
  float d = max(c.x, c.y);
  return (d > 2.5 || d < 1.5) ? 1.0 : 0.0;
}
float qrDark(vec2 m) {
  const float N = 23.0;
  if (m.x < 0.0 || m.y < 0.0 || m.x >= N || m.y >= N) return 0.0;
  if (m.x < 7.0 && m.y < 7.0) return finder(m);
  if (m.x >= N - 7.0 && m.y < 7.0) return finder(vec2(m.x - (N - 7.0), m.y));
  if (m.x < 7.0 && m.y >= N - 7.0) return finder(vec2(m.x, m.y - (N - 7.0)));
  if (m.x < 8.0 && m.y < 8.0) return 0.0;
  if (m.x >= N - 8.0 && m.y < 8.0) return 0.0;
  if (m.x < 8.0 && m.y >= N - 8.0) return 0.0;
  if (abs(m.x - 11.0) < 2.5 && abs(m.y - 11.0) < 2.5) return (abs(m.x - 11.0) < 1.5 && abs(m.y - 11.0) < 1.5) ? 1.0 : 0.0;
  return step(0.53, hash12(m * 1.37 + 11.0));
}

/** A thin line across a coordinate's integer steps, about w (in its units) wide, anti-aliased. */
float gridLine(float coord, float w) {
  float f = abs(fract(coord + 0.5) - 0.5);
  float aa = fwidth(coord) * 0.75;
  return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, f);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 VN = normalize(vViewNormal);
  if (!gl_FrontFacing) { N = -N; VN = -VN; }
  float pat = vInfo.z;
  float param = vInfo.w;
  vec3 albedo = vColor;
  float light;
  vec3 emit = vec3(0.0);
  bool unlit = false;
  // How much of this surface keeps its own light at night (bulbs, lit windows, screens, the inlay's glow).
  float keep = 0.0;

  // ── Patterns ──
  if (pat > 1.5 && pat < 2.5) {
    // Tiles with grout, each tile a hair different (stone is never one flat colour).
    vec2 t = vWorldPos.xz / param;
    vec2 cell = floor(t);
    albedo *= 0.985 + 0.03 * hash12(cell);
    float g = max(gridLine(t.x, 0.026 / param), gridLine(t.y, 0.026 / param));
    albedo = mix(albedo, uGrout, g * 0.9);
    // The gold inlay: a line down the street and a stub into each station; lit where the story has passed.
    float aaz = fwidth(vWorldPos.z) * 0.75, aax = fwidth(vWorldPos.x) * 0.75;
    float hw = uInlay.w * 0.5;
    float x = vWorldPos.x;
    float main = (1.0 - smoothstep(hw - aaz, hw + aaz, abs(vWorldPos.z - uInlay.x)))
      * smoothstep(uInlay.y - hw - aax, uInlay.y - hw + aax, x) * (1.0 - smoothstep(uInlay.z + hw - aax, uInlay.z + hw + aax, x));
    float lit = smoothstep(uInlayLit.x - 0.05, uInlayLit.x + 0.05, x) * (1.0 - smoothstep(uInlayLit.y - 0.05, uInlayLit.y + 0.35, x));
    float head = exp(-pow((x - uInlayLit.y) * 2.2, 2.0)) * step(uInlayLit.x + 0.01, uInlayLit.y);
    float inlay = main;
    float glow = main * max(lit, head);
    for (int k = 0; k < 5; k++) {
      float sx = abs(x - uStubX[k]);
      float along = smoothstep(uStubZ - hw - aaz, uStubZ - hw + aaz, vWorldPos.z) * (1.0 - smoothstep(uInlay.x - aaz, uInlay.x + aaz, vWorldPos.z));
      float stub = (1.0 - smoothstep(hw - aax, hw + aax, sx)) * along;
      inlay = max(inlay, stub);
      glow = max(glow, stub * uStubLit[k]);
    }
    glow = max(glow, uNight * 0.85);
    // Now and then a slow shimmer runs down the line in the day.
    float shimmer = main * exp(-pow((x - uShimmer) / 0.9, 2.0)) * (1.0 - uNight);
    glow = max(glow, shimmer * 0.9);
    albedo = mix(albedo, mix(uGoldDim, uGoldLit, glow), inlay);
    emit += uWarm * glow * inlay * (0.55 + 0.9 * uNight);
    keep = max(keep, glow * inlay);
  } else if (pat > 5.5 && pat < 6.5) {
    // Setts in running bond: rows along x, every other row shifted by half.
    vec2 t = vec2(vWorldPos.x / param, vWorldPos.z / (param * 0.5));
    float row = floor(t.y);
    t.x += mod(row, 2.0) * 0.5;
    albedo *= 0.975 + 0.05 * hash12(vec2(floor(t.x), row));
    float g = max(gridLine(t.x, 0.03 / param), gridLine(t.y, 0.03 / (param * 0.5)));
    albedo = mix(albedo, uGrout * 0.97, g * 0.85);
  } else if (pat > 3.5 && pat < 4.5) {
    // A slab's side: a joint every tile, and a bevel of light along its top.
    vec3 along = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    float s = dot(vWorldPos, along);
    float j = gridLine(s, 0.022);
    albedo = mix(albedo, albedo * 0.72, j);
    float top = param - vWorldPos.y;
    float bevel = 1.0 - smoothstep(0.012, 0.012 + fwidth(vWorldPos.y) * 1.2, top);
    albedo = mix(albedo, uBevel, bevel);
  } else if (pat > 0.5 && pat < 1.5) {
    // Slats: a fine groove every param along the wall.
    vec3 along = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    if (abs(N.y) < 0.5) {
      float s = dot(vWorldPos, along) / param;
      float j = gridLine(s, 0.09);
      albedo = mix(albedo, albedo * 0.8, j);
    }
  } else if (pat > 6.5 && pat < 7.5) {
    float j = gridLine(vWorldPos.y / param, 0.08);
    albedo = mix(albedo, albedo * 0.8, j);
  } else if (pat > 13.5 && pat < 14.5) {
    // The ledger's board: ruled rows, each brightening as its tick lands.
    float y = (vWorldPos.y - uLedger.x) / uLedger.y;
    float j = gridLine(y, 0.06);
    float r = clamp(floor(y), 0.0, 5.0);
    float g = uRowGlow[int(5.0 - r + 0.5)];
    albedo = mix(albedo, vec3(1.0, 0.93, 0.74), g * 0.35);
    albedo = mix(albedo, albedo * 0.78, j);
    emit += uWarm * g * 0.22;
  }

  // ── Light ──
  float ndl = max(dot(N, uSunDir), 0.0);
  float sh = shadowAt();
  if (mod(floor(vInfo.y / 2.0), 2.0) > 0.5) sh = 1.0;
  sh = mix(sh, 1.0, uNight * 0.6);
  float bare = ramp(ndl);
  light = mix(min(bare, 0.56), bare, sh);
  // Cloud shadows: about seven per cent, gone by nightfall.
  light *= 1.0 - 0.075 * cloudAt(vWorldPos) * (1.0 - uNight);

  if (pat > 2.5 && pat < 3.5) {
    // A bulb: off it is milky glass; lit it glows by itself.
    int k = int(param + 0.5);
    float on = uLampOn[k];
    albedo = mix(uBulbOff, uBulbOn, on);
    light = mix(light, 1.0, on);
    emit = uBulbOn * on * (0.35 + 0.5 * uNight);
    keep = on;
  } else if (pat > 4.5 && pat < 5.5) {
    unlit = true;
    // Bright unlit things (a lit doorway) keep their light at night; dark ones (a slot) stay dark.
    keep = step(0.35, dot(albedo, vec3(0.2126, 0.7152, 0.0722)));
  } else if (pat > 8.5 && pat < 9.5) {
    int k = int(param + 0.5);
    float g = uGlow[k];
    light = mix(light, 1.0, g);
    emit = mix(albedo, uWarm, 0.55) * g * (0.75 + 0.6 * uNight);
    keep = g;
    if (k == 0) {
      // The vault door: a ring of gold spreads across it as each coin goes in.
      float d = length(vWorldPos.xy - uRipple.xy);
      float ring = exp(-pow((d - uRipple.z) / 0.04, 2.0)) * uRipple.w;
      albedo = mix(albedo, vec3(0.86, 0.52, 0.1), ring * 0.85);
      emit = mix(emit, uWarm * 0.5, ring * 0.6);
      keep = max(keep, ring);
    }
  } else if (pat > 11.5 && pat < 12.5) {
    // A gold wire: a bright pulse runs along it with its packet (param: the wire's number + how far along).
    int k = int(floor(param));
    float a = fract(param);
    float pulse = uPulse[k] < 0.0 ? 0.0 : exp(-pow((a - uPulse[k]) / 0.06, 2.0));
    light = mix(light, 1.0, pulse);
    emit += mix(uWarm, vec3(1.0), 0.35) * pulse * 1.1;
    keep = pulse;
  } else if (pat > 12.5 && pat < 13.5) {
    // A card's gold frame: a light sweeps across it as the card forms.
    vec4 sw = uSheen[int(vInst + 0.5)];
    if (sw.w > -0.9) {
      float d = dot(vWorldPos - sw.xyz, normalize(vec3(0.62, 0.48, -0.62)));
      float band = exp(-pow((d - sw.w) / 0.045, 2.0));
      emit += vec3(1.0, 0.95, 0.78) * band * 0.95;
    }
  } else if (pat > 10.5 && pat < 11.5) {
    // A shop window: dark glass by day, warm light once its lamp is lit.
    int k = int(param + 0.5);
    float on = uLampOn[k];
    float sheen = 0.06 * smoothstep(0.0, 1.0, fract(dot(vWorldPos, vec3(0.6, 0.9, 0.6))));
    albedo = mix(uGlass + sheen, uBulbOn * vec3(1.0, 0.86, 0.6), on);
    unlit = true;
    keep = on;
    emit += uBulbOn * vec3(1.0, 0.8, 0.5) * on * uNight * 0.35;
  } else if (pat > 9.5 && pat < 10.5) {
    vec3 d = vWorldPos - uQrO;
    vec2 uv = vec2(dot(d, uQrU), dot(d, uQrV)) / uQrSize;
    vec2 g = uv * 23.0;
    float dark = qrDark(floor(g));
    // Too small to draw cleanly: an even tone instead of sparkle.
    float fine = smoothstep(0.35, 0.8, max(fwidth(g.x), fwidth(g.y)));
    dark = mix(dark, 0.45, fine);
    albedo = mix(albedo, uQrInk, dark);
    if (uScan >= 0.0) {
      float sl = 1.0 - smoothstep(0.0, 0.05, abs(uv.y - uScan));
      emit += uWarm * sl * 0.9;
    }
  } else if (pat > 7.5 && pat < 8.5) {
    // A screen: a little brighter, as if it caught the sky; at night it glows a little.
    light = mix(light, 1.0, 0.6);
    keep = 0.6;
  }

  // Lamps throw warm pools of light on the pavement (and a little on everything near them).
  vec3 pool = vec3(0.0);
  for (int i = 0; i < ${LAMPS}; i++) {
    // The six street lamps light the pavement whenever they are on; the shop windows only after dark.
    float on = uLampOn[i] * (i < 6 ? 1.0 : uNight);
    if (on <= 0.001) continue;
    vec3 d = vWorldPos - uLamp[i];
    float r2 = dot(d.xz, d.xz) + d.y * d.y * 0.35;
    // Strongest on the side that faces the lamp (a crown catches it on its lit side).
    float facing = 0.35 + 0.65 * max(0.0, dot(N, normalize(-d)));
    pool += uWarm * on * exp(-r2 * 0.5) * 0.28 * facing;
  }

  // The pictures' shade is warm: a touch more red, less blue, the deeper it is.
  float deep = clamp((1.0 - light) / 0.44, 0.0, 1.0);
  vec3 tint = mix(vec3(1.0), vec3(1.02, 0.99, 0.93), deep);
  vec3 base = unlit ? albedo : albedo * light * tint;
  // Nightfall: what does not glow goes to muted blue-grey ink (its light and shade kept), the lamps' pools grow.
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 nightBase = lum * vec3(0.072, 0.088, 0.145) + base * 0.018;
  base = mix(base, mix(nightBase, base, keep), uNight);
  vec3 col = base + emit + pool * albedo * (1.0 + 3.2 * uNight);
  // A whisper of grain so wide flat faces never band.
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(toSRGB(col), uOpacity);
  bool crease = mod(vInfo.y, 2.0) > 0.5;
  bool soft = mod(floor(vInfo.y / 4.0), 2.0) > 0.5;
  outInfo = vec4(VN.xy * 0.5 + 0.5, fract(vInfo.x * 0.61803398875), crease ? 1.0 : (soft ? 0.5 : 0.0));
}
`;

export interface ToonOptions {
  doubleSide?: boolean;
  instanced?: boolean;
}

/** The street's one material. Every mesh drawn into the main pass uses it (it writes colour and the outline info). */
export function toon(opts: ToonOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    side: opts.doubleSide ? DoubleSide : FrontSide,
    uniforms: {
      ...shared,
      uGrout: { value: linear(C.grout) },
      uBevel: { value: linear(C.bevel) },
      uBulbOff: { value: linear(C.bulbOff) },
      uBulbOn: { value: linear(C.bulbOn) },
      uWarm: { value: linear(C.glow) },
      uGoldDim: { value: linear(0xc89a3a) },
      uGoldLit: { value: linear(0xffd86e) },
      uQrInk: { value: linear(0xb3862c) },
      uGlass: { value: linear(0x3b3a3d) },
      uOpacity: { value: 1 },
    },
  });
}

// ── The ink: outlines from the main pass's info and depth, then the colour ─────────────────────────────────────────

const FULL_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const INK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tInfo;
uniform sampler2D tDepth;
uniform float uLine;
uniform float uDepthK;
uniform vec3 uInk;
uniform vec3 uInkNight;
uniform float uNight;
layout(location = 0) out vec4 outColor;

vec3 nrm(vec4 i) {
  vec2 xy = i.xy * 2.0 - 1.0;
  return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(tColor, 0);
  vec4 c0 = texelFetch(tColor, p, 0);
  vec4 i0 = texelFetch(tInfo, p, 0);
  vec3 n0 = nrm(i0);
  float d0 = texelFetch(tDepth, p, 0).r * uDepthK;
  float half_ = uLine * 0.5;
  float ink = 0.0;

  // Twelve neighbours: the four beside, the four diagonal, the four two away. Each one that belongs to another part
  // (or folds away at a crease) puts ink on this pixel, the more the nearer it is: a soft line about uLine wide.
  const ivec2 offs[12] = ivec2[12](
    ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1),
    ivec2(1, 1), ivec2(-1, 1), ivec2(1, -1), ivec2(-1, -1),
    ivec2(2, 0), ivec2(-2, 0), ivec2(0, 2), ivec2(0, -2)
  );
  for (int k = 0; k < 12; k++) {
    float dist = k < 4 ? 1.0 : (k < 8 ? 1.4142 : 2.0);
    float w = clamp(half_ + 1.0 - dist, 0.0, 1.0);
    if (w <= 0.0) continue;
    ivec2 q = clamp(p + offs[k], ivec2(0), size - 1);
    vec4 i1 = texelFetch(tInfo, q, 0);
    float e = 0.0;
    if (abs(i1.z - i0.z) > 0.0025) {
      e = 1.0;
    } else {
      float d1 = texelFetch(tDepth, q, 0).r * uDepthK;
      // The same part folding over itself (a chair's back over its seat): a step in depth. Not between the lobes of
      // a soft part (a tree's crown), which is inked only round its outside.
      bool soft = abs(i0.w - 0.5) < 0.1 && abs(i1.w - 0.5) < 0.1;
      if (!soft && abs(d1 - d0) > 0.22 * dist) e = 0.9;
      else if (i0.w > 0.75 && i1.w > 0.75) {
        float c = dot(n0, nrm(i1));
        e = smoothstep(0.93, 0.8, c) * 0.78;
      }
    }
    ink = max(ink, e * w);
  }

  float a = c0.a;
  // At night the lines soften: a blue-grey ink, a little lighter.
  vec3 inkC = mix(uInk, uInkNight, uNight);
  ink *= 1.0 - 0.3 * uNight;
  vec3 rgb = mix(c0.rgb * a, inkC, ink);
  outColor = vec4(rgb, max(a, ink));
}
`;

export function inkMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULL_VERT,
    fragmentShader: INK_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    uniforms: {
      tColor: { value: null },
      tInfo: { value: null },
      tDepth: { value: null },
      uLine: { value: 2.6 },
      uDepthK: { value: 100 },
      uInk: { value: new Color(C.ink).convertLinearToSRGB() },
      uInkNight: { value: new Color(0x1a2033).convertLinearToSRGB() },
      uNight: shared.uNight,
    },
  });
}

// ── Halos: the bulbs' and the packets' glow, drawn last over the inked picture ─────────────────────────────────────

const HALO_VERT = /* glsl */ `
attribute vec4 aHalo;   // xyz: centre, w: radius (world units)
attribute float aOn;    // 0 to 1
uniform float uNear;
uniform float uNight;
uniform float uFar;
varying vec2 vUv;
varying float vOn;
varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0);
  vDepth = (-mv.z - uNear) / (uFar - uNear);
  mv.xy += position.xy * aHalo.w * (0.6 + 0.4 * aOn) * (1.0 + 0.5 * uNight);
  vUv = position.xy;
  vOn = aOn;
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform vec3 uGlow;
uniform float uSlack;
uniform float uNight;
uniform float uStrength;
varying vec2 vUv;
varying float vOn;
varying float vDepth;
layout(location = 0) out vec4 outColor;
void main() {
  if (vOn <= 0.001) discard;
  float r = length(vUv);
  if (r > 1.0) discard;
  float scene = texture(tDepth, gl_FragCoord.xy / uRes).r;
  // Behind something nearer than the bulb's own size: hidden.
  float seen = 1.0 - smoothstep(0.0, uSlack, vDepth - scene - uSlack);
  float core = exp(-r * r * 9.0);
  float wide = exp(-r * r * 2.6) * (1.0 - r);
  float a = (core * 0.55 + wide * 0.32) * vOn * seen * (1.0 + 0.55 * uNight) * uStrength;
  a = min(a, 0.95);
  outColor = vec4(uGlow * a, a);
}
`;

export function haloMaterial(colour = 0xffe6a6, strength = 1): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    uniforms: {
      tDepth: { value: null },
      uRes: { value: new Vector2(1, 1) },
      uGlow: { value: new Color(colour).convertLinearToSRGB() },
      uNear: { value: 1 },
      uFar: { value: 300 },
      uSlack: { value: 0.004 },
      uNight: shared.uNight,
      uStrength: { value: strength },
    },
  });
}

// ── Beams: soft rays of light between two points (the table code's scan), drawn over the inked picture ─────────────

const BEAM_VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aW;     // x: width (world units), y: strength 0 to 1
uniform float uStroke;
varying vec2 vUv;
varying float vOn;
void main() {
  vec4 a = viewMatrix * vec4(aA, 1.0);
  vec4 b = viewMatrix * vec4(aB, 1.0);
  vec2 d = normalize(b.xy - a.xy + vec2(1e-5));
  vec2 nrm = vec2(-d.y, d.x);
  vec4 mv = mix(a, b, position.x);
  // Wider at the far end (a fan of light from the code to the phone), or even (a stroke).
  mv.xy += nrm * position.y * aW.x * (uStroke > 0.5 ? 1.0 : 0.35 + 0.65 * position.x);
  vUv = position.xy;
  vOn = aW.y;
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uGlow;
uniform float uStroke;
varying vec2 vUv;
varying float vOn;
layout(location = 0) out vec4 outColor;
void main() {
  if (vOn <= 0.001) discard;
  float across = 1.0 - vUv.y * vUv.y;
  float along = uStroke > 0.5 ? 1.0 : smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
  float a = (uStroke > 0.5 ? smoothstep(0.0, 0.55, across) * 0.8 : across * across * 0.55) * along * vOn;
  outColor = vec4(uGlow * a, a);
}
`;

export function beamMaterial(colour = 0xffd979, stroke = false): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    uniforms: { uGlow: { value: new Color(colour).convertLinearToSRGB() }, uStroke: { value: stroke ? 1 : 0 } },
  });
}
