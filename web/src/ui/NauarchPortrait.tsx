import { cn } from "@/lib/utils";

export type Mood = "calm" | "smug" | "vexed" | "thinking";

const BROWS: Readonly<Record<Mood, readonly [string, string]>> = {
  calm: ["M22 33 L30 32", "M38 32 L46 33"],
  smug: ["M22 32 L30 33", "M38 31 L46 29"],
  vexed: ["M22 30 L30 34", "M38 34 L46 30"],
  thinking: ["M22 31 L30 31", "M38 30 L46 32"],
};

const MOUTHS: Readonly<Record<Mood, string>> = {
  calm: "M28 49 Q34 51 40 49",
  smug: "M28 49 Q35 53 41 47",
  vexed: "M28 51 Q34 47 40 51",
  thinking: "M30 50 L38 50",
};

export function NauarchPortrait({ mood, className }: { readonly mood: Mood; readonly className?: string }) {
  const [left, right] = BROWS[mood];
  const look = mood === "thinking" ? 2 : 0;
  return (
    <svg viewBox="0 0 68 68" className={cn("block", className)} aria-hidden>
      <defs>
        <radialGradient id="np-bg" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#2b4a5c" />
          <stop offset="1" stopColor="#0b2230" />
        </radialGradient>
        <clipPath id="np-clip">
          <circle cx="34" cy="34" r="32" />
        </clipPath>
      </defs>
      <circle cx="34" cy="34" r="32" fill="url(#np-bg)" />
      <g clipPath="url(#np-clip)">
        <path d="M6 68 Q10 52 24 50 L44 50 Q58 52 62 68 Z" fill="#14324a" />
        <path d="M24 50 L34 62 L44 50" fill="#f4f7f8" />
        <path d="M20 52 L26 66 M48 52 L42 66" stroke="#ffcf5a" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="34" cy="58" r="1.6" fill="#ffcf5a" />
        <path d="M24 26 Q24 50 34 53 Q44 50 44 26 Z" fill="#d9a77f" />
        <path d="M25 42 Q26 54 34 55 Q42 54 43 42 Q38 47 34 46 Q30 47 25 42 Z" fill="#9aa9b0" />
        <path d={left} stroke="#2b2118" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d={right} stroke="#2b2118" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle cx={27 + look} cy="37" r="1.7" fill="#1a1410" />
        <circle cx={41 + look} cy="37" r="1.7" fill="#1a1410" />
        <path d={MOUTHS[mood]} stroke="#4a2a1c" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M8 26 Q34 4 60 26 Q50 22 34 23 Q18 22 8 26 Z" fill="#0f2433" stroke="#ffcf5a" strokeWidth="1.6" />
        <path d="M30 14 L34 9 L38 14" stroke="#ffcf5a" strokeWidth="1.6" fill="none" />
        <circle cx="34" cy="17" r="2.4" fill="#b02a6b" />
      </g>
      <circle cx="34" cy="34" r="32" fill="none" stroke="#ffcf5a" strokeWidth="2.5" />
    </svg>
  );
}
