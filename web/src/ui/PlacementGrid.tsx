import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { heatAlpha } from "@/lib/heat";
import { bowFor, hullOf, moveHull, nudgeHull, previewBody, rotateHull, type Hull } from "@/lib/placement";
import { ships } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import { ShipGlyph } from "./ShipGlyph";

const SIZE = 10;
const COLS = "ABCDEFGHIJ";

interface PlacementGridProps {
  readonly cells: readonly number[];
  readonly heat: readonly number[] | null;
  readonly sail: string;
  readonly flag?: string;
  readonly disabled: boolean;
  readonly onChange: (cells: number[]) => void;
}

interface Drag {
  readonly pointer: number;
  readonly hull: Hull;
  readonly grabbed: number;
  readonly over: number;
  readonly moved: boolean;
}

const KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface Pick {
  readonly cells: readonly number[];
  readonly index: number | null;
  readonly note: string | null;
}

function describe(cells: readonly number[], index: number | null): string | null {
  const h = index !== null ? hullOf(cells, index) : null;
  if (!h) return null;
  const at = `${COLS[(h.cells[0] as number) % SIZE]}${Math.floor((h.cells[0] as number) / SIZE) + 1}`;
  const way = h.cells.length === 1 ? "" : h.horizontal ? ", across" : ", down";
  return `Ship of ${h.cells.length} at ${at}${way}. Tap open water to move it, tap it again to turn it.`;
}

export function PlacementGrid({ cells, heat, sail, flag, disabled, onChange }: PlacementGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const fresh = pick !== null && pick.cells === cells;
  const hull = fresh && pick.index !== null ? hullOf(cells, pick.index) : null;
  const note = fresh ? pick.note : null;
  const select = (on: readonly number[], index: number | null, text: string | null): void => setPick({ cells: on, index, note: text });

  const commit = (next: number[] | null, refusal: string): void => {
    if (!next) {
      select(cells, hull ? (hull.cells[0] as number) : null, refusal);
      return;
    }
    const before = new Set(ships(cells).map((s) => s.join()));
    const moved = ships(next).find((s) => !before.has(s.join()));
    const index = moved ? (moved[0] as number) : hull ? (hull.cells[0] as number) : null;
    onChange(next);
    select(next, index, describe(next, index));
  };

  const cellAt = (x: number, y: number): number | null => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const cx = Math.floor(((x - r.left) / r.width) * SIZE);
    const cy = Math.floor(((y - r.top) / r.height) * SIZE);
    return cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE ? null : cy * SIZE + cx;
  };

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (disabled || drag || !e.isPrimary || e.button !== 0) return;
    const at = cellAt(e.clientX, e.clientY);
    if (at === null) return;
    const h = hullOf(cells, at);
    if (h) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ pointer: e.pointerId, hull: h, grabbed: at, over: at, moved: false });
      return;
    }
    if (hull) commit(moveHull(cells, hull, at), "No room there. Ships need open water around them.");
  };

  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const at = cellAt(e.clientX, e.clientY);
    if (at !== null && at !== drag.over) setDrag({ ...drag, over: at, moved: true });
  };

  const up = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      const already = hull !== null && hull.cells.includes(d.grabbed);
      if (already) commit(rotateHull(cells, d.hull), "No room to turn this ship here.");
      else select(cells, d.grabbed, describe(cells, d.grabbed));
      return;
    }
    if (cellAt(e.clientX, e.clientY) === null) return;
    const bow = bowFor(d.hull, d.grabbed, d.over);
    commit(moveHull(cells, d.hull, bow), "No room there. Ships need open water around them.");
  };

  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const all = ships(cells);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const i = hull ? all.findIndex((s) => s.includes(hull.cells[0] as number)) : -1;
      const next = all[(i + 1) % all.length];
      if (next) select(cells, next[0] as number, describe(cells, next[0] as number));
      return;
    }
    if (!hull) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      commit(rotateHull(cells, hull), "No room to turn this ship here.");
      return;
    }
    const delta = KEYS[e.key];
    if (!delta) return;
    e.preventDefault();
    commit(nudgeHull(cells, hull, delta[0], delta[1]), "That way is blocked.");
  };

  const ghost = drag?.moved ? previewBody(drag.hull, bowFor(drag.hull, drag.grabbed, drag.over)) : null;
  const ghostOk = ghost !== null && drag !== null && moveHull(cells, drag.hull, bowFor(drag.hull, drag.grabbed, drag.over)) !== null;

  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-[14px_1fr] gap-1">
        <span />
        <div className="grid grid-cols-10 text-center font-mono text-[9px] text-muted" aria-hidden>
          {[...COLS].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="grid grid-rows-10 items-center font-mono text-[9px] text-muted" aria-hidden>
          {Array.from({ length: SIZE }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div
          ref={gridRef}
          role="application"
          aria-label="Fleet placement. Drag a ship or tap it, then tap open water. Tap a selected ship to turn it. Keyboard: Enter picks a ship, arrows move it, R turns it."
          tabIndex={disabled ? -1 : 0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={(e) => drag?.pointer === e.pointerId && setDrag(null)}
          onKeyDown={key}
          className={cn("relative grid aspect-square touch-none grid-cols-10 overflow-hidden rounded-lg border border-line bg-[#0f3a4f] select-none", disabled && "opacity-60")}
        >
          {cells.map((_, i) => {
            const inGhost = ghost?.includes(i) ?? false;
            const h = heat ? heatAlpha(heat, i) : 0;
            return (
              <div
                key={i}
                className="relative border-[0.5px] border-white/8"
                style={{ backgroundColor: heat && h > 0 ? `rgb(255 106 61 / ${(h * 0.75).toFixed(2)})` : undefined }}
              >
                {inGhost && <span className={cn("absolute inset-[2px] rounded-[3px] border-2", ghostOk ? "border-ok bg-ok/30" : "border-hit bg-hit/30")} />}
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-0">
            {ships(cells).map((ship) => {
              const h = hullOf(cells, ship[0] as number);
              if (!h) return null;
              const bow = h.cells[0] as number;
              const across = h.horizontal || h.cells.length === 1;
              const picked = hull?.cells[0] === bow;
              const lifted = drag?.moved === true && drag.hull.cells[0] === bow;
              return (
                <div
                  key={bow}
                  className={cn("absolute p-[2px] transition-opacity", lifted && "opacity-30", picked && "[filter:drop-shadow(0_0_4px_var(--color-brass))_drop-shadow(0_0_1px_var(--color-brass))]")}
                  style={{ left: `${(bow % SIZE) * 10}%`, top: `${Math.floor(bow / SIZE) * 10}%`, width: `${(across ? h.cells.length : 1) * 10}%`, height: `${(across ? 1 : h.cells.length) * 10}%` }}
                >
                  <ShipGlyph top length={h.cells.length} vertical={!across} sail={sail} flag={flag} className="size-full" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="m-0 min-h-[1.2em] text-[11px] text-muted" aria-live="polite">
        {note ?? "Drag a ship to move it. Tap one to select it."}
      </p>
    </div>
  );
}
