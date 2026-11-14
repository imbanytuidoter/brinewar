import { CELLS } from "./merkle";

const SIZE = 10;
export const FLEET: ReadonlyArray<readonly [length: number, count: number]> = [
  [4, 1],
  [3, 2],
  [2, 3],
  [1, 4],
];

export type Rng = () => number;

function neighbours8(i: number): number[] {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) out.push(ny * SIZE + nx);
    }
  return out;
}

export function ships(cells: readonly number[]): number[][] {
  const seen = new Array<boolean>(CELLS).fill(false);
  const out: number[][] = [];
  for (let start = 0; start < CELLS; start++) {
    if (cells[start] !== 1 || seen[start]) continue;
    const stack = [start];
    const ship: number[] = [];
    seen[start] = true;
    while (stack.length) {
      const i = stack.pop() as number;
      ship.push(i);
      for (const n of neighbours8(i))
        if (cells[n] === 1 && !seen[n]) {
          seen[n] = true;
          stack.push(n);
        }
    }
    out.push(ship.sort((a, b) => a - b));
  }
  return out;
}

export function isLegalFleet(cells: readonly number[]): boolean {
  if (cells.length !== CELLS || cells.some((c) => c !== 0 && c !== 1)) return false;
  if (cells.filter((c) => c === 1).length !== 20) return false;
  const counts = new Map<number, number>();
  for (const ship of ships(cells)) {
    const xs = ship.map((i) => i % SIZE);
    const ys = ship.map((i) => Math.floor(i / SIZE));
    const row = ys.every((y) => y === ys[0]);
    const col = xs.every((x) => x === xs[0]);
    const span = row ? Math.max(...xs) - Math.min(...xs) + 1 : col ? Math.max(...ys) - Math.min(...ys) + 1 : -1;
    if (span !== ship.length || span > 4) return false;
    counts.set(span, (counts.get(span) ?? 0) + 1);
  }
  return FLEET.every(([len, n]) => counts.get(len) === n);
}

export function placeFleet(rng: Rng): number[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = new Array<number>(CELLS).fill(0);
    const blocked = new Array<boolean>(CELLS).fill(false);
    let ok = true;
    for (const [len, count] of FLEET) {
      for (let k = 0; k < count && ok; k++) {
        const options: number[][] = [];
        for (let start = 0; start < CELLS; start++)
          for (const horizontal of [true, false]) {
            const x = start % SIZE;
            const y = Math.floor(start / SIZE);
            if (horizontal ? x + len > SIZE : y + len > SIZE) continue;
            const body = Array.from({ length: len }, (_, j) => (horizontal ? start + j : start + j * SIZE));
            if (!body.some((c) => blocked[c])) options.push(body);
          }
        const chosen = options[Math.floor(rng() * options.length)];
        if (!chosen) {
          ok = false;
          break;
        }
        for (const c of chosen) {
          cells[c] = 1;
          blocked[c] = true;
          for (const n of neighbours8(c)) blocked[n] = true;
        }
      }
      if (!ok) break;
    }
    if (ok && isLegalFleet(cells)) return cells;
  }
  throw new Error("could not place a fleet");
}

export function cryptoRng(): Rng {
  return () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] as number) / 0x1_0000_0000;
  };
}

export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}
