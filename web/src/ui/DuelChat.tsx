import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAT_MAX, chatClient, type ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;
const SHOWN = 6;
const DOWN_AFTER = 3;
const QUICK = ["Good luck!", "Nice shot!", "Close one", "GG"] as const;

interface DuelChatProps {
  readonly apiUrl: string;
  readonly gameId: number;
  readonly me: string;
  readonly secretKey: string;
  readonly rival: string;
}

function merge(have: readonly ChatMessage[], fresh: readonly ChatMessage[]): ChatMessage[] {
  const seen = new Set(have.map((m) => m.n));
  return [...have, ...fresh.filter((m) => !seen.has(m.n))];
}

export function DuelChat({ apiUrl, gameId, me, secretKey, rival }: DuelChatProps) {
  const client = useMemo(() => chatClient(apiUrl, me, secretKey), [apiUrl, me, secretKey]);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches);
  const [seen, setSeen] = useState(0);
  const [failed, setFailed] = useState(false);
  const [misses, setMisses] = useState(0);
  const last = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pull = async (): Promise<void> => {
      const fresh = await client.read(gameId, last.current);
      if (!alive) return;
      setMisses((n) => (fresh === null ? n + 1 : 0));
      if (fresh && fresh.length > 0) {
        last.current = fresh[fresh.length - 1]?.n ?? last.current;
        setMessages((m) => merge(m, fresh));
      }
      timer = setTimeout(() => void pull(), POLL_MS);
    };
    void pull();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, gameId]);

  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);

  const send = async (text: string): Promise<void> => {
    const t = text.trim().slice(0, CHAT_MAX);
    if (!t) return;
    setDraft("");
    const ok = await client.send(gameId, t);
    setFailed(!ok);
    if (!ok) {
      setDraft(t);
      return;
    }
    const fresh = await client.read(gameId, last.current);
    if (fresh && fresh.length > 0) {
      last.current = fresh[fresh.length - 1]?.n ?? last.current;
      setMessages((m) => merge(m, fresh));
    }
  };

  const unread = messages.slice(seen).filter((m) => m.account !== me).length;

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-2 rounded-full border border-line bg-glass px-3.5 py-2 text-sm font-semibold backdrop-blur-md hover:border-brass"
      >
        <MessageCircle className="size-4" aria-hidden />
        Chat with {rival}
        {unread > 0 && <span className="rounded-full bg-hit px-1.5 text-xs font-bold text-white">{unread}</span>}
      </button>
    );

  return (
    <section aria-label={`Chat with ${rival}`} className="grid w-[min(340px,calc(100vw-32px))] gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="m-0 text-sm font-semibold">Chat with {rival}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Hide the chat" className="text-muted hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ol aria-live="polite" className="m-0 grid max-h-[180px] list-none gap-1.5 overflow-y-auto p-0">
        {messages.length === 0 && <li className="text-xs text-muted">Say hello. Only you and {rival} can read this.</li>}
        {messages.slice(-SHOWN).map((m) => {
          const mine = m.account === me;
          return (
            <li key={m.n} className={cn("max-w-[85%] rounded-xl px-2.5 py-1.5 text-sm break-words", mine ? "justify-self-end bg-brass text-[#241a05]" : "justify-self-start bg-white/10")}>
              {!mine && <span className="block text-[11px] font-semibold text-brass">{rival}</span>}
              {m.text}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brass">
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX}
          placeholder="Message"
          aria-label={`Message to ${rival}`}
          className="min-w-0 flex-1 rounded-lg border border-line bg-black/25 px-2.5 py-1.5 text-sm outline-none focus:border-brass"
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim()} className="rounded-lg bg-brass px-2.5 text-[#241a05] disabled:opacity-50">
          <Send className="size-4" aria-hidden />
        </button>
      </form>
      {failed && <p className="m-0 text-xs text-hit">The message did not go through. Try again.</p>}
      {misses >= DOWN_AFTER && <p className="m-0 text-xs text-hit">The chat is not reachable right now. The battle itself is not affected.</p>}
    </section>
  );
}
