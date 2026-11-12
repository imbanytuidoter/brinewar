import { shipName } from "@/game/useBattleFeed";
import { FLEET } from "@/lib/fleet";
import type { Mark, ShipLook } from "@/scene/types";
import { ShipGlyph } from "./ShipGlyph";

const GLYPH = 18;

const LENGTHS = FLEET.flatMap(([len, count]) => Array.from({ length: count }, () => len));

interface FleetTrayProps {
  readonly myShips: readonly (readonly number[])[];
  readonly myMarks: ReadonlyMap<number, Mark>;
  readonly sunkTheirs: readonly (readonly number[])[];
  readonly enemyLabel: string;
  readonly look?: ShipLook | null;
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
              <ShipGlyph length={ship.length} hits={hits} sunk={lost} sail={look?.sail} className="h-[18px] w-full" />
            </span>
          );
        })}
      </Row>
      <Row label={enemyLabel}>
        {theirs.map((s, i) => (
          <span key={i} title={`${shipName(s.length)}${s.sunk ? ", sunk" : ""}`} style={{ width: s.length * GLYPH }} className={s.sunk ? "" : "text-ink/45"}>
            <ShipGlyph length={s.length} ghost={!s.sunk} sunk={s.sunk} hits={s.sunk ? Array.from({ length: s.length }, () => true) : []} sail="#7a1f3d" className="h-[18px] w-full" />
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
