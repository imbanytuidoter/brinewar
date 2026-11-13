import { ArrowLeft, BadgeCheck, CircleAlert, Link2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildReport, type Check, type Report } from "@/game/verify";
import { loadModelKeys, modelOfRequest } from "@/lib/nauarch";
import { makeViewer } from "@/lib/chain";
import { txLink, type AppConfig } from "@/lib/config";
import type { GameView, ModelView, PlayerView, ShotView } from "@/lib/contract";
import { fetchEvidence } from "@/lib/proofs";
import { cellName, short } from "@/lib/utils";
import { MiniBoard } from "@/ui/MiniBoard";
import { SiteHeader } from "@/ui/SiteHeader";
import { REASONS } from "@/ui/EndCard";

interface VerifyPageProps {
  readonly cfg: AppConfig;
  readonly gameId: number;
}

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ok"; game: GameView; evidenceTx: string | null; report: Report; model: ModelView | null; names: Names };

interface Names {
  readonly a: string;
  readonly b: string;
}

export function VerifyPage({ cfg, gameId }: VerifyPageProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const viewer = useMemo(() => makeViewer(cfg.rpcUrl, cfg.contractId), [cfg]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      viewer.view<GameView | null>("get_game", { game_id: gameId }),
      viewer.view<ShotView[]>("get_history", { game_id: gameId }),
      viewer.view<ModelView | null>("model").catch(() => null),
      fetchEvidence(cfg.apiUrl, gameId).catch(() => null),
    ])
      .then(async ([game, history, model, ev]) => {
        if (!game) return alive && setLoad({ kind: "missing" });
        const name = async (account: string, fallback: string): Promise<string> =>
          (await viewer.view<PlayerView | null>("get_player", { account_id: account }).catch(() => null))?.display_name ?? fallback;
        const names = game.mode === "PvP" ? { a: await name(game.a, "Captain A"), b: await name(game.b, "Captain B") } : { a: await name(game.a, "Captain"), b: "The Nauarch" };
        const keys = await loadModelKeys(viewer, ev?.moves ?? []);
        const usedName = (ev?.moves ?? []).map((m) => modelOfRequest(m.request)).find((n): n is string => n !== null);
        const usedKey = usedName ? keys.get(usedName) : undefined;
        const played = usedName && usedKey ? { model: usedName, public_key: usedKey } : model;
        if (alive) setLoad({ kind: "ok", game, model: played, names, evidenceTx: ev?.reveal?.tx ?? null, report: buildReport(game, history, ev, keys) });
      })
      .catch(() => alive && setLoad({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [cfg, gameId, viewer]);

  return (
    <main className="min-h-full bg-[radial-gradient(120%_80%_at_50%_0%,#174b61,#0b2230_60%)] pb-16">
      <SiteHeader />
      <div className="mx-auto grid max-w-4xl gap-8 px-4 pt-4">
        <header className="grid gap-2">
          <a href="/" className="inline-flex items-center gap-1.5 justify-self-start text-xs text-muted hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to sea
          </a>
          <h1 className="m-0 font-display text-4xl leading-none font-bold sm:text-5xl">{load.kind === "missing" ? `No battle #${gameId}` : load.kind === "ok" ? `Battle #${gameId}, proven` : `Battle #${gameId}`}</h1>
          <p className="m-0 max-w-2xl text-muted">
            Nothing here needs trust in our server. Your browser reads the game straight from the contract, recomputes every Merkle proof against the roots the
            contract stored at the start, and re-checks every signature from the NEAR AI model.
          </p>
        </header>
        {load.kind === "loading" && (
          <p className="inline-flex items-center gap-2 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Fetching the logbook…
          </p>
        )}
        {load.kind === "missing" && <p className="text-muted">No battle with this number.</p>}
        {load.kind === "error" && <p className="text-hit">Could not reach the harbour. Try again in a moment.</p>}
        {load.kind === "ok" && <ReportView cfg={cfg} game={load.game} revealTx={load.evidenceTx} report={load.report} model={load.model} names={load.names} />}
      </div>
    </main>
  );
}

function Mark({ check }: { readonly check: Check }) {
  if (check === "ok")
    return (
      <span className="inline-flex items-center gap-1 text-ok">
        <BadgeCheck className="size-3.5" aria-hidden />
        proof ✓
      </span>
    );
  if (check === "bad")
    return (
      <span className="inline-flex items-center gap-1 text-hit">
        <CircleAlert className="size-3.5" aria-hidden />
        mismatch
      </span>
    );
  return <span className="text-muted">checked by contract</span>;
}

function Tx({ cfg, hash }: { readonly cfg: AppConfig; readonly hash: string | null }) {
  const href = txLink(cfg, hash);
  if (!hash) return <span className="text-muted">·</span>;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-brass hover:underline">
      <Link2 className="size-3" aria-hidden />
      {short(hash)}
    </a>
  ) : (
    <span className="font-mono text-muted">{short(hash)}</span>
  );
}

interface ReportViewProps {
  readonly cfg: AppConfig;
  readonly game: GameView;
  readonly revealTx: string | null;
  readonly report: Report;
  readonly model: ModelView | null;
  readonly names: Names;
}

function ReportView({ cfg, game: g, revealTx, report, model, names }: ReportViewProps) {
  const duel = g.mode === "PvP";
  const nauarchAnswers = report.shots.filter((s) => !s.byNauarch && s.result !== "Pending").length;
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        {duel ? (
          <Stat label="Answers checked on chain" value={String(report.shots.filter((s) => s.result !== "Pending").length)} />
        ) : (
  <Stat label="Answers proven" value={`${report.proofsOk}/${nauarchAnswers}`} sub={report.proofsBad ? `${report.proofsBad} mismatched` : undefined} />
        )}
        {duel ? <Stat label="Mode" value="Duel" sub="both captains answered with proofs checked by the contract" /> : <Stat label="Signed Nauarch moves" value={`${report.signedOk}/${report.moves.length}`} />}
        <Stat label="Result" value={g.winner ? `${g.winner === g.a ? names.a : names.b} won` : g.status} sub={g.finish_reason ? (REASONS[g.finish_reason] ?? g.finish_reason) : undefined} />
      </section>

      <section className="grid gap-4 rounded-2xl border border-line bg-glass p-4 backdrop-blur-md">
        <h2 className="m-0 font-display text-2xl font-bold">Sealed boards</h2>
        <dl className="m-0 grid gap-2 font-mono text-xs break-all">
          <div>
            <dt className="text-muted">{names.a} · {g.a}</dt>
            <dd className="m-0">{g.root_a ?? "not committed"}</dd>
          </div>
          <div>
            <dt className="text-muted">{names.b} · {g.b}</dt>
            <dd className="m-0">{g.root_b ?? "not committed"}</dd>
          </div>
        </dl>
        <div className="grid gap-6 sm:grid-cols-2">
          <MiniBoard title={`${names.a}'s shots at ${names.b}`} shots={report.shots.filter((s) => !s.byNauarch)} fleet={report.nauarchFleet} />
          <MiniBoard title={`${names.b}'s shots at ${names.a}`} shots={report.shots.filter((s) => s.byNauarch)} fleet={null} />
        </div>
        {report.revealCheck && (
          <p className="m-0 inline-flex items-center gap-2 text-sm">
            <Mark check={report.revealCheck} />
            {report.revealCheck === "ok" ? "The Nauarch's revealed fleet rebuilds his sealed root and is a legal fleet." : "The revealed fleet does not match his sealed root."}
            <Tx cfg={cfg} hash={revealTx} />
          </p>
        )}
        {report.sunkCheck && (
          <p className="m-0 inline-flex items-center gap-2 text-sm">
            <Mark check={report.sunkCheck} />
            {report.sunkCheck === "ok"
              ? `All ${report.sunkCount} of his "sunk" announcements match ships in his revealed fleet.`
              : report.sunkCheck === "bad"
                ? `His "sunk" announcements do not match his revealed fleet.`
                : `${report.sunkCount} "sunk" announcements will be checked when he reveals his fleet.`}
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="m-0 font-display text-2xl font-bold">Every shot</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-glass backdrop-blur-md">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Cell</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Answer</th>
                <th className="px-3 py-2 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {report.shots.map((s) => (
                <tr key={s.n} className="border-t border-line">
                  <td className="px-3 py-2 tabular-nums">{s.n + 1}</td>
                  <td className="px-3 py-2">{s.byNauarch ? `${names.b}${duel || s.source === "Model" ? "" : ` (${s.source})`}` : names.a}</td>
                  <td className="px-3 py-2 font-mono">{cellName(s.index)}</td>
                  <td className={s.result === "Hit" ? "px-3 py-2 text-hit" : "px-3 py-2"}>{s.result}</td>
                  <td className="px-3 py-2">
                    <Mark check={s.proof} />
                  </td>
                  <td className="px-3 py-2">
                    <Tx cfg={cfg} hash={s.tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!duel && (
      <section className="grid gap-3">
        <h2 className="m-0 font-display text-2xl font-bold">The Nauarch's signed words</h2>
        <p className="m-0 text-xs text-muted">
          Model {model ? `${model.model}, key ${short(model.public_key, 8, 6)}` : "unknown"}. Each reply is signed in a TEE over model:sha256(request):sha256(response); the contract
          rebuilt the request from public game state.
        </p>
        <ul className="m-0 grid list-none gap-2 p-0">
          {report.moves.map((m, i) => (
            <li key={i} className="grid gap-1 rounded-xl border border-line bg-glass px-3 py-2 backdrop-blur-md sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
              <span>{m.line ?? <em className="text-muted">no line</em>}</span>
              <span className="text-xs">{m.signed === "ok" ? <span className="text-ok">signed ✓</span> : m.signed === "bad" ? <span className="text-hit">does not match</span> : <span className="text-muted">{m.source}</span>}</span>
              <Tx cfg={cfg} hash={m.tx} />
            </li>
          ))}
        </ul>
      </section>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { readonly label: string; readonly value: string; readonly sub?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-line bg-glass p-4 backdrop-blur-md">
      <p className="m-0 text-xs tracking-[0.12em] text-muted uppercase">{label}</p>
      <p className="m-0 font-display text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="m-0 text-xs text-muted">{sub}</p>}
    </div>
  );
}
