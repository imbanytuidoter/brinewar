import { shipName } from "@/game/useBattleFeed";
import { FLEET } from "@/lib/fleet";
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

export function FleetTray({ myShips, myMarks, sunkTheirs, enemyLabel, look }: FleetTrayProps) {
  const mine = [...myShips].sort((a, b) => b.length - a.length);
  const theirs = theirTray(sunkTheirs);
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
      <Row label={enemyLabel}>
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
