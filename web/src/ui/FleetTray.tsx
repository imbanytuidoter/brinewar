import { shipName } from "@/game/useBattleFeed";
import { FLEET } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import type { Mark } from "@/scene/types";

const LENGTHS = FLEET.flatMap(([len, count]) => Array.from({ length: count }, () => len));

interface FleetTrayProps {
  readonly myShips: readonly (readonly number[])[];
  readonly myMarks: ReadonlyMap<number, Mark>;
  readonly sunkTheirs: readonly (readonly number[])[];
  readonly enemyLabel: string;
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

export function FleetTray({ myShips, myMarks, sunkTheirs, enemyLabel }: FleetTrayProps) {
  const mine = [...myShips].sort((a, b) => b.length - a.length);
  const theirs = theirTray(sunkTheirs);
  return (
    <aside aria-label="Fleets" className="grid gap-2 rounded-2xl border border-line bg-glass p-2.5 text-[11px] backdrop-blur-md">
      <Row label="Your fleet">
        {mine.map((ship) => {
          const lost = ship.every((c) => myMarks.get(c) === "hit");
          return (
            <span key={ship[0]} title={`${shipName(ship.length)}${lost ? ", sunk" : ""}`} className={cn("flex gap-px", lost && "opacity-35")}>
              {ship.map((c) => (
                <span key={c} className={cn("h-2.5 w-2 rounded-[2px]", myMarks.get(c) === "hit" ? "bg-hit" : "bg-ink/85")} />
              ))}
            </span>
          );
        })}
      </Row>
      <Row label={enemyLabel}>
        {theirs.map((s, i) => (
          <span key={i} title={`${shipName(s.length)}${s.sunk ? ", sunk" : ""}`} className="flex gap-px">
            {Array.from({ length: s.length }, (_, j) => (
              <span key={j} className={cn("h-2.5 w-2 rounded-[2px]", s.sunk ? "bg-hit/80" : "border border-ink/50")} />
            ))}
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
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
