import { Anchor, Shuffle, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HarbourProps {
  readonly busy: boolean;
  readonly onShuffle: () => void;
  readonly onSail: () => void;
  readonly onDuel: () => void;
}

export function Harbour({ busy, onShuffle, onSail, onDuel }: HarbourProps) {
  return (
    <div className="grid animate-rise gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[320px]">
      <p className="m-0 text-[13px] text-muted">
        Your fleet is the one with white sails. Only this browser knows where it stands: the chain gets a sealed root.
      </p>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button onClick={onShuffle} disabled={busy} aria-label="Shuffle your fleet">
          <Shuffle aria-hidden />
          Shuffle
        </Button>
        <Button variant="brass" onClick={onSail} disabled={busy} aria-label="Set sail against the Nauarch">
          <Anchor aria-hidden />
          Sail vs the Nauarch
        </Button>
      </div>
      <Button variant="glass" onClick={onDuel} disabled={busy}>
        <Swords aria-hidden />
        Challenge a friend
      </Button>
    </div>
  );
}
