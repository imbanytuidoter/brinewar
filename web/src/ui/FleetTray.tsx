import { shipName } from "@/game/useBattleFeed";
import { SHIP_CELLS } from "@/lib/contract";
import { FLEET } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import type { SkinLook } from "@/lib/skins";
import type { Mark } from "@/scene/types";
import { SpriteShip } from "./SpriteShip";

const GLYPH = 24;

const LENGTHS = FLEET.flatMap(([len, count]) => Array.from({ length: count }, () => len));

interface FleetTrayProps {
  readonly myShips: readonly (readonly number[])[];
  readonly myMarks: ReadonlyMap<number, Mark>;
  readonly sunkTheirs: readonly (readonly number[])[];
  readonly enemyLabel: string;
  readonly look?: SkinLook | null;
  readonly enemyMarks?: ReadonlyMap<number, Mark>;
}

export function theirTray(sunk: readonly (readonly number[])[]): { readonly length: number; readonly sunk: boolean }[] {
  const left = sunk.map((s) => s.length).sort((a, b) => b - a);
  return LENGTHS.map((length) => {
    const i = left.indexOf(length);
    if (i < 0) return { length, sunk: false };
    left.splice(i, 1);
    return { length, sunk: true };
  });
}

export function FleetTray({ myShips, myMarks, sunkTheirs, enemyLabel, look, enemyMarks }: FleetTrayProps) {
  const mine = [...myShips].sort((a, b) => b.length - a.length);
  const theirs = theirTray(sunkTheirs);
  const hits = enemyMarks ? [...enemyMarks.values()].filter((m) => m === "hit").length : sunkTheirs.reduce((s, c) => s + c.length, 0);
  return (
    <aside aria-label="Fleets" className="grid gap-2.5 rounded-2xl border border-line bg-glass p-3 text-[11px] backdrop-blur-md">
      <Row label="Your fleet">
        {mine.map((ship) => {
          const hits = ship.map((c) => myMarks.get(c) === "hit");
          const lost = hits.every(Boolean);
          return (
            <span key={ship[0]} title={`${shipName(ship.length)}${lost ? ", sunk" : ""}`} style={{ width: ship.length * GLYPH }}>
              <SpriteShip vertical={false} length={ship.length} hits={hits} state={lost ? "sunk" : hits.some(Boolean) ? "damaged" : "intact"} sail={look?.sprite ?? 1} flag={look?.pennant ?? 5} className="h-[24px] w-full" />
            </span>
          );
        })}
      </Row>
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">{enemyLabel}</span>
          <span className="font-semibold tabular-nums">
            <span className="text-hit">{hits}</span>/{SHIP_CELLS} hit · {sunkTheirs.length} sunk
          </span>
        </div>
        <div className="flex gap-0.5" role="img" aria-label={`${hits} of ${SHIP_CELLS} cells of his fleet hit, ${sunkTheirs.length} ships sunk`}>
          {Array.from({ length: SHIP_CELLS }, (_, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-[2px]", i < hits ? "bg-hit" : "bg-white/15")} />
          ))}
        </div>
      </div>
      <Row label="His ships, sunk ones burn">
        {theirs.map((s, i) => (
          <span key={i} title={`${shipName(s.length)}${s.sunk ? ", sunk" : ""}`} style={{ width: s.length * GLYPH }} >
            <SpriteShip vertical={false} length={s.length} state={s.sunk ? "sunk" : "intact"} sail={2} flag={2} className={s.sunk ? "h-[24px] w-full" : "h-[24px] w-full opacity-30 grayscale"} />
          </span>
        ))}
      </Row>
    </aside>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">{children}</div>
    </div>
  );
}
