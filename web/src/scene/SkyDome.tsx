import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Mood } from "./moods";

const RADIUS = 240;

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}`;

const FRAGMENT = `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.1 + 3.7) + 0.2 * noise(p * 4.3 + 9.1); }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.);
  vec3 col = mix(uBottom, uMid, smoothstep(0., 0.2, h));
  col = mix(col, uTop, smoothstep(0.16, 0.7, h));
  float s = max(dot(d, uSunDir), 0.);
  col += uSun * (pow(s, 5.) * 0.16 + pow(s, 48.) * 0.3);
  col = mix(col, mix(uSun, vec3(1.), 0.6), smoothstep(0.9990, 0.9996, s));
  vec2 uv = d.xz / (d.y + 0.22) * 1.5 + vec2(uTime * 0.006, uTime * 0.002);
  float cover = smoothstep(0.5, 0.74, fbm(uv)) * smoothstep(0.03, 0.2, d.y) * (1. - 0.5 * smoothstep(0.5, 0.9, d.y));
  vec3 cloud = mix(uBottom, vec3(1.), 0.7) + uSun * 0.18 * pow(s, 3.);
  col = mix(col, cloud, cover * 0.72);
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

export function SkyDome({ mood }: { readonly mood: Mood }) {
  const geometry = useMemo(() => new THREE.SphereGeometry(RADIUS, 32, 16), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color() },
          uMid: { value: new THREE.Color() },
          uBottom: { value: new THREE.Color() },
          uSun: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uTime: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    const u = material.uniforms;
    (u.uTop as THREE.IUniform<THREE.Color>).value.set(mood.sky[0]);
    (u.uMid as THREE.IUniform<THREE.Color>).value.set(mood.sky[1]);
    (u.uBottom as THREE.IUniform<THREE.Color>).value.set(mood.sky[2]);
    (u.uSun as THREE.IUniform<THREE.Color>).value.set(mood.sun);
    (u.uSunDir as THREE.IUniform<THREE.Vector3>).value.set(...mood.sunAt).normalize();
  }, [material, mood]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }) => {
    (material.uniforms.uTime as THREE.IUniform<number>).value = clock.elapsedTime;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />;
}
