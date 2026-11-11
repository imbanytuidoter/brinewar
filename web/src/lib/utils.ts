import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function short(hash: string, head = 6, tail = 4): string {
  return hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}

export function cellName(index: number): string {
  return `${"ABCDEFGHIJ"[index % 10] ?? "?"}${Math.floor(index / 10) + 1}`;
}

export function parseCell(raw: string): number | null {
  const m = /^\s*([A-Ja-j])\s*(10|[1-9])\s*$/.exec(raw);
  if (!m) return null;
  const col = (m[1] as string).toUpperCase().charCodeAt(0) - 65;
  return (Number(m[2]) - 1) * 10 + col;
}
