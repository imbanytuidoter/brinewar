import * as THREE from "three";
import type { Wave } from "./gerstner";
import { BOARD_ORIGIN } from "./grid";

export const SEA_FOG = "#cfeeff";
export const FOG_NEAR = 38;
export const FOG_FAR = 95;
export const OFF_BOARD = 999;

export type SeaUniforms = {
  uTime: THREE.IUniform<number>;
  uFogReveal: THREE.IUniform<number>;
  uAim: THREE.IUniform<THREE.Vector2>;
  uHover: THREE.IUniform<THREE.Vector2>;
  uWaves: THREE.IUniform<THREE.Vector4[]>;
  uSpeeds: THREE.IUniform<number[]>;
  uDeep: THREE.IUniform<THREE.Color>;
  uShallow: THREE.IUniform<THREE.Color>;
  uFoam: THREE.IUniform<THREE.Color>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uCam: THREE.IUniform<THREE.Vector3>;
  uBoardA: THREE.IUniform<THREE.Vector2>;
  uBoardB: THREE.IUniform<THREE.Vector2>;
};

export function createSeaUniforms(waves: readonly Wave[]): SeaUniforms {
  return {
    uTime: { value: 0 },
    uFogReveal: { value: -0.2 },
    uAim: { value: new THREE.Vector2(OFF_BOARD, OFF_BOARD) },
    uHover: { value: new THREE.Vector2(OFF_BOARD, OFF_BOARD) },
    uWaves: { value: waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.a)) },
    uSpeeds: { value: waves.map((w) => w.c) },
    uDeep: { value: new THREE.Color("#0f5f86") },
    uShallow: { value: new THREE.Color("#3fb6c9") },
    uFoam: { value: new THREE.Color("#f2fbff") },
    uFogColor: { value: new THREE.Color(SEA_FOG) },
    uCam: { value: new THREE.Vector3() },
    uBoardA: { value: new THREE.Vector2(BOARD_ORIGIN.mine.x, BOARD_ORIGIN.mine.z) },
    uBoardB: { value: new THREE.Vector2(BOARD_ORIGIN.enemy.x, BOARD_ORIGIN.enemy.z) },
  };
}

const VERTEX = `
uniform float uTime; uniform vec4 uWaves[3]; uniform float uSpeeds[3];
varying vec3 vPos; varying vec3 vNormal; varying float vCrest;
void main() {
  vec3 p = position.xzy; p.z = -p.z;
  vec3 pos = p; vec3 tx = vec3(1.,0.,0.); vec3 tz = vec3(0.,0.,1.); float crest = 0.;
  for (int i = 0; i < 3; i++) {
    vec4 w = uWaves[i]; float f = w.z * (dot(w.xy, p.xz) - uSpeeds[i] * uTime);
    pos.y += w.w * sin(f);
    pos.xz += w.xy * w.w * cos(f) * 0.6;
    float d = w.w * w.z * cos(f);
    tx.y += w.x * d; tz.y += w.y * d;
    crest += sin(f) * w.w;
  }
  vNormal = normalize(cross(tz, tx));
  vPos = pos; vCrest = crest;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const FRAGMENT = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uFogColor; uniform vec3 uCam;
uniform float uTime; uniform float uFogReveal; uniform vec2 uAim; uniform vec2 uHover; uniform vec2 uBoardA; uniform vec2 uBoardB;
varying vec3 vPos; varying vec3 vNormal; varying float vCrest;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float board(vec2 p, vec2 o) {
  vec2 q = p - o; if (q.x < 0. || q.y < 0. || q.x > 10. || q.y > 10.) return 0.;
  vec2 g = abs(fract(q) - 0.5); float l = smoothstep(0.47, 0.5, max(g.x, g.y));
  float edge = smoothstep(9.93, 10., max(q.x, q.y)) + (1. - smoothstep(0., 0.07, min(q.x, q.y)));
  return clamp(l * 0.55 + edge, 0., 1.);
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCam - vPos);
  float fres = pow(1. - max(dot(n, v), 0.), 3.);
  vec3 col = mix(uShallow, uDeep, clamp(0.55 - vCrest * 2.2 + 0.25 * fres, 0., 1.));
  col = mix(col, vec3(0.86, 0.95, 1.0), fres * 0.55);
  float sparkle = pow(max(dot(reflect(-v, n), normalize(vec3(-0.5, 0.8, 0.4))), 0.), 160.);
  col += sparkle * 0.9;
  float n1 = 0.65 * noise(vPos.xz * 1.3 + vec2(uTime * 0.18, uTime * 0.11)) + 0.35 * noise(vPos.xz * 3.7 - uTime * 0.22);
  float foam = smoothstep(0.62, 0.8, n1) * smoothstep(-0.02, 0.12, vCrest);
  col = mix(col, uFoam, foam * 0.3);
  float ga = board(vPos.xz, uBoardA);
  float gb = board(vPos.xz, uBoardB);
  col = mix(col, vec3(1.), (ga + gb) * 0.5);
  vec2 hov = abs(vPos.xz - uHover);
  if (hov.x < 0.5 && hov.y < 0.5) col = mix(col, vec3(1.0), 0.28);
  vec2 aim = abs(vPos.xz - uAim);
  if (aim.x < 0.5 && aim.y < 0.5) col = mix(col, vec3(1.0, 0.82, 0.35), 0.35 + 0.2 * sin(uTime * 6.));
  vec2 q = vPos.xz - uBoardB;
  if (q.x > -0.4 && q.y > -0.4 && q.x < 10.4 && q.y < 10.4) {
    float edge = q.x - uFogReveal * 12.;
    float mist = smoothstep(-0.8, 0.8, edge) * (0.55 + 0.35 * noise(vPos.xz * 0.9 + vec2(uTime * 0.15, 0.)));
    col = mix(col, vec3(0.88, 0.93, 0.96), mist * 0.75);
  }
  float d = length(uCam - vPos);
  col = mix(col, uFogColor, smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, d));
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

export function createSeaMaterial(uniforms: SeaUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT });
}
