import { Check, Copy, Share2, Swords, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import type { GameView, PlayerView } from "@/lib/contract";

const HEX_KEY = /^[0-9a-f]{64}$/;
const B64_KEY = /^[A-Za-z0-9_-]{43}$/;

function hexToB64url(hex: string): string {
  const bytes = hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToHex(key: string): string {
  const bin = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=");
  return Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export function duelLink(origin: string, gameId: number, secret: string): string {
  return HEX_KEY.test(secret) ? `${origin}/duel/${gameId}#${hexToB64url(secret)}` : `${origin}/duel/${gameId}`;
}

export function duelLinkShown(origin: string, gameId: number): string {
  return `${origin.replace(/^https?:\/\//, "")}/duel/${gameId}`;
}

export interface DuelInviteRef {
  readonly gameId: number;
  readonly secret: string;
}

function secretFrom(hash: string): string {
  const raw = hash.replace(/^#/, "");
  const legacy = new URLSearchParams(raw).get("k");
  if (legacy !== null) return legacy;
  return B64_KEY.test(raw) ? b64urlToHex(raw) : raw;
}

export function duelFromLocation(search: string, hash: string, pathname = "/"): DuelInviteRef | null {
  const path = /^\/duel\/(\d{1,15})\/?$/.exec(pathname)?.[1];
  const raw = path ?? new URLSearchParams(search).get("duel");
  return raw && /^\d{1,15}$/.test(raw) ? { gameId: Number(raw), secret: secretFrom(hash) } : null;
}

interface InviteProps {
  readonly gameId: number;
  readonly secret: string | null;
  readonly busy: boolean;
  readonly onCancel: () => void;
}

export function DuelInvite({ gameId, secret, busy, onCancel }: InviteProps) {
  const link = secret ? duelLink(window.location.origin, gameId, secret) : null;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async (): Promise<void> => {
    try {
      if (!link) return;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="grid w-full animate-rise gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[340px]">
      <p className="m-0 font-display text-xl leading-tight font-bold">Waiting for your friend</p>
      <p className="m-0 text-[13px] text-muted">Send this link to a friend. It opens in any browser, no wallet needed, and stays valid for about an hour.</p>
      <p data-invite={link ?? undefined} className="m-0 truncate rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-[13px] font-semibold">
        {link ? duelLinkShown(window.location.origin, gameId) : "This browser lost the invite. Cancel and open a new duel."}
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Button variant="brass" onClick={() => void copy()} disabled={!link} aria-label="Copy the invite link">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare && link && (
          <Button onClick={() => void navigator.share({ title: "Brinewar duel", text: "Join my naval duel on Brinewar", url: link }).catch(() => undefined)} aria-label="Share the invite">
            <Share2 aria-hidden />
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={busy} aria-label="Cancel the duel">
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}

interface JoinProps {
  readonly cfg: AppConfig;
  readonly gameId: number;
  readonly me: string;
  readonly busy: boolean;
  readonly onShuffle: () => void;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

type Invite = { kind: "loading" } | { kind: "open"; host: string } | { kind: "closed"; why: string };

export function JoinDuel({ cfg, gameId, me, busy, onShuffle, onAccept, onDecline }: JoinProps) {
  const viewer = useMemo(() => makeViewer(cfg.rpcUrl, cfg.contractId), [cfg]);
  const [invite, setInvite] = useState<Invite>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await viewer.view<GameView | null>("get_game", { game_id: gameId });
      if (!g || g.mode !== "PvP") return { kind: "closed", why: "This duel does not exist any more." } as const;
      if (g.a === me) return { kind: "closed", why: "This is your own invite: send it to a friend." } as const;
      if (g.status !== "Waiting") return { kind: "closed", why: "Someone has already taken this duel." } as const;
      const host = await viewer.view<PlayerView | null>("get_player", { account_id: g.a });
      return { kind: "open", host: host?.display_name ?? "A captain" } as const;
    })()
      .then((v) => alive && setInvite(v))
      .catch(() => alive && setInvite({ kind: "closed", why: "Could not read the duel from the chain. Try again in a moment." }));
    return () => {
      alive = false;
    };
  }, [viewer, gameId, me]);
  return (
    <div className="grid w-full animate-rise gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[340px]">
      {invite.kind === "loading" && <p className="m-0 text-sm text-muted">Reading the invite…</p>}
      {invite.kind === "closed" && (
        <>
          <p className="m-0 text-sm">{invite.why}</p>
          <Button onClick={onDecline}>Back to the harbour</Button>
        </>
      )}
      {invite.kind === "open" && (
        <>
          <p className="m-0 font-display text-xl leading-tight font-bold">{invite.host} challenges you</p>
          <p className="m-0 text-xs text-muted">A friendly duel: no gold at stake, XP for both. Your fleet is the one with white sails; shuffle until you like it.</p>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button onClick={onShuffle} disabled={busy} aria-label="Shuffle your fleet">
              <Shuffle aria-hidden />
              Shuffle
            </Button>
            <Button variant="brass" onClick={onAccept} disabled={busy}>
              <Swords aria-hidden />
              Accept the duel
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
            Not now
          </Button>
        </>
      )}
    </div>
  );
}
