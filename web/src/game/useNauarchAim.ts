import { useEffect, useState } from "react";
import type { GameSession } from "./session";

interface Offer {
  readonly key: string;
  readonly cells: readonly number[];
}

export function useNauarchAim(session: GameSession, gameId: number | null, theirShots: number): readonly number[] | null {
  const [offer, setOffer] = useState<Offer | null>(null);
  const key = `${gameId}:${theirShots}`;
  useEffect(() => {
    if (gameId === null) return;
    let alive = true;
    session
      .nauarchAim(gameId)
      .then((cells) => {
        if (alive && cells.length > 0) setOffer({ key, cells });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session, gameId, key]);
  return offer && offer.key === key ? offer.cells : null;
}
