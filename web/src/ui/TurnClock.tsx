import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const URGENT_MS = 60_000;

export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TurnClock({ deadlineAt }: { readonly deadlineAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = deadlineAt - now;
  return (
    <span className={cn("font-semibold tabular-nums", left < URGENT_MS ? "text-hit" : "text-brass")} aria-label={`${clockText(left)} left for your move`}>
      {clockText(left)} left
    </span>
  );
}
