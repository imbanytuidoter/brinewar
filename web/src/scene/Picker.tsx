import type { ThreeEvent } from "@react-three/fiber";
import { useEffect } from "react";
import { BOARD_ORIGIN, cellCenter, SIZE, worldToCell } from "./grid";
import { useRuntime } from "./runtime";
import { OFF_BOARD } from "./seaMaterial";
import type { Mark } from "./types";

const CLICK_SLOP = 6;

interface PickerProps {
  readonly marks: ReadonlyMap<number, Mark>;
  readonly aiming: number | null;
  readonly canFire: boolean;
  readonly onFire: (index: number) => void;
}

export function Picker({ marks, aiming, canFire, onFire }: PickerProps) {
  const { uniforms } = useRuntime();
  const o = BOARD_ORIGIN.enemy;

  const open = (cell: number | null): cell is number => cell !== null && canFire && !marks.has(cell) && cell !== aiming;

  const clearHover = () => uniforms.uHover.value.set(OFF_BOARD, OFF_BOARD);

  useEffect(() => {
    if (!canFire) uniforms.uHover.value.set(OFF_BOARD, OFF_BOARD);
  }, [canFire, uniforms]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== "mouse") return;
    const cell = worldToCell("enemy", e.point.x, e.point.z);
    if (!open(cell)) {
      clearHover();
      document.body.style.cursor = "";
      return;
    }
    const c = cellCenter("enemy", cell);
    uniforms.uHover.value.set(c.x, c.z);
    document.body.style.cursor = "crosshair";
  };

  const onOut = () => {
    clearHover();
    document.body.style.cursor = "";
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return;
    const cell = worldToCell("enemy", e.point.x, e.point.z);
    if (!open(cell)) return;
    e.stopPropagation();
    clearHover();
    onFire(cell);
  };

  return (
    <mesh rotation-x={-Math.PI / 2} position={[o.x + SIZE / 2, 0, o.z + SIZE / 2]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick}>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}
