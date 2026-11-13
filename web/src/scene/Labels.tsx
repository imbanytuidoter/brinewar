import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { BOARD_ORIGIN, SIZE } from "./grid";
import type { Side } from "./types";

const TEX = 1024;
const COLUMNS = "ABCDEFGHIJ";
const BODY_FONT = "600 34px Archivo, system-ui, sans-serif";
const TITLE_FONT = "700 52px \"Bespoke Stencil\", Archivo, sans-serif";

const INK = "#ffffff";
const SHADE = "rgba(6, 22, 32, 0.78)";
const PLATE = "rgba(6, 22, 32, 0.82)";

function draw(canvas: HTMLCanvasElement, title: string): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const s = TEX / 12;
  g.clearRect(0, 0, TEX, TEX);
  g.font = BODY_FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = SHADE;
  g.fillStyle = INK;
  const mark = (text: string, x: number, y: number): void => {
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  };
  COLUMNS.split("").forEach((ch, i) => mark(ch, s * (i + 1.5), s * 0.55));
  for (let i = 0; i < SIZE; i++) mark(String(i + 1), s * 0.5, s * (i + 1.5));
  g.font = TITLE_FONT;
  g.textAlign = "left";
  const pad = s * 0.28;
  const width = Math.min(g.measureText(title).width, s * 10.4);
  const top = s * 11.08;
  const height = s * 0.94;
  g.fillStyle = PLATE;
  g.beginPath();
  if (typeof g.roundRect === "function") g.roundRect(s * 1.05 - pad, top, width + pad * 2, height, height / 2);
  else g.rect(s * 1.05 - pad, top, width + pad * 2, height);
  g.fill();
  g.fillStyle = INK;
  g.fillText(title, s * 1.05, top + height / 2 + 2, s * 10.4);
}

interface BoardLabelProps {
  readonly side: Side;
  readonly title: string;
}

function BoardLabel({ side, title }: BoardLabelProps) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX;
    c.height = TEX;
    draw(c, title);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: t };
  }, [title]);

  useEffect(() => {
    let live = true;
    const fonts = document.fonts;
    if (!fonts) return;
    Promise.all([fonts.load(BODY_FONT), fonts.load(TITLE_FONT)])
      .catch(() => [])
      .then(() => {
        if (!live) return;
        draw(canvas, title);
        texture.needsUpdate = true;
      });
    return () => {
      live = false;
    };
  }, [canvas, texture, title]);

  useEffect(() => () => texture.dispose(), [texture]);

  const o = BOARD_ORIGIN[side];
  return (
    <mesh rotation-x={-Math.PI / 2} position={[o.x + 5, 0.42, o.z + 5]} renderOrder={1}>
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
}

export function Labels({ enemy }: { readonly enemy: string }) {
  return (
    <>
      <BoardLabel side="mine" title="Your fleet" />
      <BoardLabel key={enemy} side="enemy" title={enemy} />
    </>
  );
}
