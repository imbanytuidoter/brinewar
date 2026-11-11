import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { REVEAL_END } from "./grid";
import { useRuntime } from "./runtime";

const REVEAL_RATE = 0.45;

export function useReveal(revealed: boolean): void {
  const { reveal, reduced } = useRuntime();

  useEffect(() => {
    if (!revealed) {
      reveal.progress = -1;
      return;
    }
    if (reveal.progress < 0) reveal.progress = reduced ? REVEAL_END : 0;
  }, [revealed, reveal, reduced]);

  useFrame((_, delta) => {
    if (reveal.progress < 0 || reveal.progress >= REVEAL_END) return;
    reveal.progress = Math.min(REVEAL_END, reveal.progress + Math.min(delta, 0.05) * REVEAL_RATE);
  });
}
