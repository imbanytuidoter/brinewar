import type { Mark } from "@/scene/types";

const SIZE = 10;
const LONGEST = 4;

function cluster(hits: ReadonlySet<number>, start: number, seen: Set<number>): number[] {
  const out: number[] = [];
  const stack = [start];
  seen.add(start);
  while (stack.length) {
    const i = stack.pop() as number;
    out.push(i);
    const x = i % SIZE;
    for (const n of [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, i - SIZE, i + SIZE])
      if (n >= 0 && n < SIZE * SIZE && hits.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
  }
  return out.sort((a, b) => a - b);
}

function closed(marks: ReadonlyMap<number, Mark>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return true;
  return marks.get(y * SIZE + x) === "miss";
}

function isSunk(marks: ReadonlyMap<number, Mark>, ship: readonly number[]): boolean {
  if (ship.length >= LONGEST) return true;
  const xs = ship.map((i) => i % SIZE);
  const ys = ship.map((i) => Math.floor(i / SIZE));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const horizontalEnds = closed(marks, x0 - 1, y0) && closed(marks, x1 + 1, y0);
  const verticalEnds = closed(marks, x0, y0 - 1) && closed(marks, x0, y1 + 1);
  if (ship.length === 1) return horizontalEnds && verticalEnds;
  return y0 === y1 ? horizontalEnds : verticalEnds;
}

export function confirmedSunk(marks: ReadonlyMap<number, Mark>): number[][] {
  const hits = new Set([...marks].filter(([, m]) => m === "hit").map(([i]) => i));
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const i of [...hits].sort((a, b) => a - b)) {
    if (seen.has(i)) continue;
    const ship = cluster(hits, i, seen);
    if (isSunk(marks, ship)) out.push(ship);
  }
  return out;
}

export function sunkOwn(ships: readonly (readonly number[])[], marks: ReadonlyMap<number, Mark>): number[][] {
  return ships.filter((s) => s.every((c) => marks.get(c) === "hit")).map((s) => [...s]);
}

export function shipAt(ships: readonly (readonly number[])[], cell: number): readonly number[] | null {
  return ships.find((s) => s.includes(cell)) ?? null;
}
