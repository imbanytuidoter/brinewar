import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { BOARD_ORIGIN, SIZE } from "./grid";
import type { Side } from "./types";

const TEX = 1024;
const COLUMNS = "ABCDEFGHIJ";
const BODY_FONT = "600 34px Archivo, system-ui, sans-serif";
const TITLE_FONT = "700 44px \"Bespoke Stencil\", Archivo, sans-serif";

function draw(canvas: HTMLCanvasElement, title: string): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const s = TEX / 12;
  g.clearRect(0, 0, TEX, TEX);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.font = BODY_FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  COLUMNS.split("").forEach((ch, i) => g.fillText(ch, s * (i + 1.5), s * 0.55));
  for (let i = 0; i < SIZE; i++) g.fillText(String(i + 1), s * 0.5, s * (i + 1.5));
  g.font = TITLE_FONT;
  g.textAlign = "left";
  g.fillText(title, s * 1.05, s * 11.55);
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
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
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
