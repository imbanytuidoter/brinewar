import { ArrowLeftRight } from "lucide-react";
import type { ReactNode } from "react";

export interface Live {
  readonly contract: string;
  readonly nauarch: string;
  readonly model: string | null;
  readonly players: number | null;
  readonly games: number | null;
  readonly startGold: string | null;
  readonly baseEntry: string | null;
  readonly threshold: string | null;
  readonly bountyPct: string | null;
  readonly bountyCap: string | null;
  readonly bountiesPerDay: number | null;
  readonly gamesPerDay: number | null;
  readonly timeoutBlocks: number | null;
  readonly duelTimeoutBlocks: number | null;
  readonly minHeatShots: number | null;
  readonly treasury: string | null;
  readonly entryNow: string | null;
  readonly bountyNow: string | null;
}

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly short: string;
  readonly body: ReactNode;
}

const v = (x: string | number | null): string => (x === null ? "…" : String(x));

function Rows({ rows }: { readonly rows: readonly (readonly ReactNode[])[] }) {
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white/5 text-xs tracking-[0.08em] text-muted uppercase">
          <tr>{head?.map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Flow() {
  const box = "grid gap-1 rounded-xl border border-line bg-white/5 p-3 text-sm";
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
      <div className={box}><b>Your browser</b><span className="text-muted">Holds your board and salts. Signs moves with a game-only key.</span></div>
      <ArrowLeftRight aria-hidden className="mx-auto size-4 text-brass max-sm:rotate-90" />
      <div className={box}><b>Game contract on NEAR</b><span className="text-muted">Checks every proof, signature, turn and deadline. Holds gold and tokens.</span></div>
      <ArrowLeftRight aria-hidden className="mx-auto size-4 text-brass max-sm:rotate-90" />
      <div className={box}><b>The Nauarch</b><span className="text-muted">A server that answers with proofs and asks NEAR AI for signed moves.</span></div>
    </div>
  );
}

export function sections(l: Live): Section[] {
  return [
    {
      id: "overview",
      title: "Overview",
      short: "Overview",
      body: (
        <>
          <p>Brinewar is a naval battle on NEAR that you play straight from the browser. A guest account is made for you in the background, and the game pays the gas, so you never connect a wallet. Each shot is still a real transaction, and the contract rejects any answer that arrives without a proof.</p>
          <p>Your opponent is <b>the Nauarch</b>, an AI admiral. He has studied every board the contract verified, fires first where captains like to hide, and speaks one line per shot. Each move the model makes runs in a trusted enclave on NEAR AI, is signed there, and is checked by the contract before it counts. If the model is late or wrong, the contract fires a deterministic shot instead, labelled as such.</p>
          <p>Live on NEAR testnet: <b>{v(l.players)}</b> captains (including scripted <code>Seed_NN</code> captains that seeded the map), <b>{v(l.games)}</b> battles, contract <code>{l.contract}</code>.</p>
        </>
      ),
    },
    {
      id: "quick-start",
      title: "Quick start",
      short: "Quick start",
      body: (
        <ol>
          <li>Open the site and press <b>Take command</b>. A guest account, a flagship, {v(l.startGold)} gold and three skins are created for you.</li>
          <li>Sail across the sea chart. Meet a Nauarch patrol and press <b>Engage</b>, or press <b>Prepare for battle</b>.</li>
          <li>Place your ships: drag a ship, or tap it and then open water to move it, tap it again to turn it, or press Shuffle. Turn on the heat map to see where he will look first.</li>
          <li>Press <b>Set sail</b>, then tap a cell in the fog to fire. A hit lets you fire again.</li>
          <li>When the battle ends, press <b>Verify</b> to re-check every proof and signature in your browser.</li>
        </ol>
      ),
    },
    {
      id: "rules",
      title: "Rules of the sea",
      short: "Rules",
      body: (
        <>
          <ul>
            <li>Each side has a 10×10 board with one ship of 4 cells, two of 3, three of 2 and four of 1: 20 cells in all.</li>
            <li>Ships are straight lines and never touch, not even at the corners. The contract checks this when the boards are revealed.</li>
            <li>You fire one cell at a time. <b>A hit earns another shot</b>; a miss passes the turn. The rule is the same for the Nauarch and in duels.</li>
            <li>Sink all 20 cells of the enemy fleet to win. Cells around a sunk ship are marked as clear water so you do not waste shots.</li>
            <li>Against the Nauarch each move has {v(l.timeoutBlocks)} blocks (about {l.timeoutBlocks === null ? "…" : Math.round((l.timeoutBlocks * 0.6) / 60)} minutes); in duels, {v(l.duelTimeoutBlocks)} blocks (about {l.duelTimeoutBlocks === null ? "…" : Math.round(l.duelTimeoutBlocks * 0.6)} seconds). Miss it and the other side can claim the win.</li>
            <li><b>Strike colours</b> resigns the battle.</li>
          </ul>
        </>
      ),
    },
    {
      id: "fair-play",
      title: "Fair play: how every shot is proven",
      short: "Proofs",
      body: (
        <>
          <p>Nobody, including our server, can see your board, and nobody can change theirs mid-battle.</p>
          <ol>
            <li><b>Seal.</b> Before the first shot each side commits a Merkle root of its board. Every cell becomes a leaf <code>sha256(index ‖ cell ‖ salt)</code> with a fresh 32-byte salt; 100 leaves are padded to 128 and hashed into a tree of depth 7. Only the root goes on chain.</li>
            <li><b>Answer.</b> When a shot lands, the defender sends <i>hit</i> or <i>miss</i> together with the salt and the Merkle path for that cell. The contract recomputes the root and rejects the answer if it does not match.</li>
            <li><b>Reveal.</b> At the end both boards are opened in full. The contract checks them against the roots and checks the fleet is legal. An illegal fleet loses.</li>
            <li><b>Verify.</b> The Verify page reads the battle from the chain and, in your browser, recomputes the Merkle proof of every answer the Nauarch gave, his reveal against his sealed root, and every model signature. Your own answers are shown as checked by the contract.</li>
          </ol>
          <p>Your board and salts never leave your browser. The prompt for the AI is built by the contract from public data only, so the model never sees either board.</p>
        </>
      ),
    },
    {
      id: "nauarch",
      title: "The Nauarch: a verifiable AI opponent",
      short: "The Nauarch",
      body: (
        <>
          <ul>
            <li><b>Model:</b> <code>{v(l.model)}</code> on NEAR AI Cloud, inside a TEE. Its signing key is stored in the contract.</li>
            <li><b>Request:</b> the contract itself builds the request body with <code>nauarch_request</code>: the history of shots, the captain's record against him, the hottest cells of the Admiralty map. Temperature is 0 and the seed is fixed, so the same public state gives the same request byte for byte.</li>
            <li><b>Signature:</b> the enclave signs the request and the response. <code>submit_ai_move</code> checks the ed25519 signature against the stored key and that the request matches the current game. A stale or altered move is refused.</li>
            <li><b>How he aims:</b> the contract works out which cells make sense and lists them in the request; the model picks one of them and adds his line. A wounded ship comes first: he fires only along it until it sinks. With no wounded ship he hunts the hottest open cells of the Admiralty map, and when those run out, cells spread across the board. He never fires next to a sunk ship or diagonally from a hit, where no ship can be.</li>
            <li><b>Fallback:</b> if the model is late (over a few seconds) or names a cell outside that list, the contract fires the first cell of the list instead, labelled as such. The battle never stalls on the model.</li>
            <li><b>His voice:</b> one line of at most 140 characters, limited to game facts. Each line shows <i>signed ✓</i> once your browser has checked it.</li>
          </ul>
        </>
      ),
    },
    {
      id: "admiralty",
      title: "The Admiralty map",
      short: "Admiralty map",
      body: (
        <>
          <p>The Admiralty map is a heat map of where captains hide their ships. It is built only from boards the contract verified at reveal, which is why the Nauarch can learn from it without trusting anyone.</p>
          <ul>
            <li>A board counts only if the battle ended with a fleet sunk and that side answered at least {v(l.minHeatShots)} shots.</li>
            <li>One board per captain per day, so nobody can flood the map to steer him.</li>
            <li>The Nauarch's own board never counts.</li>
            <li>Every verified board shifts the map, so his hunt changes as captains play. If most captains start hiding in the corners, he starts searching the corners.</li>
            <li>When he fires into a hot cell, the callout tells you: <i>Hunting from the Admiralty map</i>, with the share of fleets that sat there.</li>
          </ul>
        </>
      ),
    },
    {
      id: "economy",
      title: "Gold and the treasury",
      short: "Gold and treasury",
      body: (
        <>
          <p>Gold is a token in the contract (NEP-245 multi-token, id <code>gold</code>). Every captain starts with {v(l.startGold)}. The Nauarch keeps a treasury, and the prices move with it, by formula, with nobody tuning them by hand.</p>
          <Rows
            rows={[
              ["Rule", "Formula", "Right now"],
              ["Entry to fight the Nauarch", `${v(l.baseEntry)} gold while the treasury holds ${v(l.threshold)} or more; below that it rises to at most ${l.baseEntry === null ? "…" : Number(l.baseEntry) * 2}`, `${v(l.entryNow)} gold`],
              ["Bounty for sinking his fleet", `${v(l.bountyPct)}% of the treasury, capped at ${v(l.bountyCap)}; up to ${v(l.bountiesPerDay)} bounties per captain per day`, `${v(l.bountyNow)} gold`],
              ["Treasury", "Grows with every lost entry, shrinks with every bounty", `${v(l.treasury)} gold`],
            ]}
          />
          <ul>
            <li><b>You win by sinking his fleet:</b> your entry comes back plus the bounty.</li>
            <li><b>You lose:</b> your entry goes to his treasury.</li>
            <li><b>Win on time:</b> your entry comes back, no bounty.</li>
            <li><b>Duels:</b> no gold moves at all.</li>
          </ul>
          <p>Limits keep the testnet honest: {v(l.gamesPerDay)} battles per captain per day. The Treasury page plots the real history and can simulate 50 battles with the contract's own formulas.</p>
        </>
      ),
    },
    {
      id: "progression",
      title: "Flagship, ranks and skins",
      short: "Ranks and skins",
      body: (
        <>
          <p>Your flagship is a token too (<code>ship:N</code>). It earns XP in battle: 10 for each hit, 30 for each ship you sink and 100 for a win by sinking the fleet. A win on time earns no win XP; a short duel earns no XP at all.</p>
          <Rows
            rows={[
              ["Rank", "XP", "Class", "Skin unlocked"],
              ["Ensign", "0", "Cutter", "Brine, Coral, Ghost (starter)"],
              ["Lieutenant", "100", "Sloop", "Night watch"],
              ["Captain", "300", "Frigate", "Gilded"],
              ["Commodore", "700", "Ship of the line", "Storm"],
              ["Admiral", "1,500", "Flagship", "Admiral"],
            ]}
          />
          <p>Skins are NEP-245 tokens (<code>skin:…</code>) minted to you by the contract when you reach a rank. They change your sails, flag, hull and cannon trail on the chart and in battle, and they live in the contract like any other NEP-245 token.</p>
        </>
      ),
    },
    {
      id: "duels",
      title: "Duels with a friend",
      short: "Duels",
      body: (
        <ul>
          <li>Press <b>Invite a friend</b> on the chart. You get a link with a secret in the part after <code>#</code>. Browsers never send that part to a web server; the contract stores only its hash until your friend presents the secret to join.</li>
          <li>Your friend opens it in any browser, also without a wallet, places a fleet and accepts. Same proofs and turn rule, with a move deadline of about a minute.</li>
          <li>During the duel you can chat. Each message is signed with your guest key, and only the two captains can read or write it.</li>
          <li>No gold changes hands. Both flagships earn XP when the duel is played out with at least {v(l.minHeatShots)} answered shots per side.</li>
        </ul>
      ),
    },
    {
      id: "accounts",
      title: "Accounts, keys and gas",
      short: "Accounts and gas",
      body: (
        <ul>
          <li>Your browser creates a key pair and asks the harbour for a guest account <code>p-…​.{l.contract}</code>. The sponsor account asks the game contract, which creates the account, funds it and adds your key.</li>
          <li>The key is a function-call key: it can only call game methods on the game contract (new battle, commit, fire, answer, reveal, resign, claim a timeout, set a nickname). It cannot transfer NEAR or tokens.</li>
          <li>Gas is paid from your guest account's balance, which the harbour tops up; the key itself can spend at most 0.25 NEAR. You never see a gas prompt.</li>
          <li>Clearing your browser storage loses the key, and with it the guest account.</li>
        </ul>
      ),
    },
    {
      id: "architecture",
      title: "Architecture",
      short: "Architecture",
      body: (
        <>
          <Flow />
          <ul>
            <li><b>Contract</b> (Rust, near-sdk): game state, Merkle checks, model signature checks, treasury, NEP-245 tokens, events in NEP-297 format (<code>standard: "brinewar"</code>).</li>
            <li><b>Admiral</b> (Node): plays the Nauarch's side. It holds his board, answers shots with proofs, and fetches signed moves from NEAR AI. It cannot see your board or change his own after the commit.</li>
            <li><b>API</b> (Node): guest accounts, the leaderboard, the Admiralty and treasury history, and the evidence your browser needs to check signatures.</li>
            <li><b>Web</b> (React, three.js): the 3D sea, the chart, and the Verify page that re-checks everything client-side.</li>
          </ul>
        </>
      ),
    },
    {
      id: "threats",
      title: "What stops cheating",
      short: "Threat model",
      body: (
        <Rows
          rows={[
            ["Who", "Could try to", "Stopped by"],
            ["Player", "Answer “miss” on a hit", "A Merkle proof with every answer"],
            ["Player", "Place an illegal fleet", "Fleet check at reveal; the cheater loses the entry"],
            ["Player", "Stall forever", "Move deadlines and claim_timeout"],
            ["Player", "Poison the Admiralty map", "Only verified boards, one per captain per day, minimum shots"],
            ["Player", "Inject text through a nickname", "Nicknames limited to A-Z, a-z, 0-9, _ and -"],
            ["Our server", "Peek at your board", "Your board stays in your browser; the prompt is built by the contract"],
            ["Our server", "Move the Nauarch's ships mid-battle", "His root is committed before the first shot"],
            ["Our server", "Pick a convenient AI move", "Contract-built request, temperature 0, fixed seed, TEE signature"],
            ["The model", "Answer nonsense", "Deterministic fallback shot"],
            ["Anyone", "Steal the browser key", "It can only make game moves, never transfer"],
          ]}
        />
      ),
    },
    {
      id: "faq",
      title: "FAQ",
      short: "FAQ",
      body: (
        <>
          <p><b>Is this real money?</b> No. Everything runs on NEAR testnet; gold and skins are testnet tokens.</p>
          <p><b>Can the Nauarch see my ships?</b> No. Neither he nor the model ever gets your board; he learns only from boards revealed after finished battles.</p>
          <p><b>Can I see his board?</b> Not until the end. His root is on chain from the start, and when the battle ends his fleet rises from that root on screen.</p>
          <p><b>I closed the tab mid-battle.</b> Open the site again or press <b>Back to battle</b> on any page; the battle resumes where it was.</p>
          <p><b>Does the Nauarch learn?</b> Yes, from statistics, not by retraining the model. Every board the contract verifies after a finished battle is added to the Admiralty map, and he hunts the hottest cells of that map first. The more captains play, the sharper his first shots get.</p>
          <p><b>Why is a move slow sometimes?</b> Each shot and answer is a transaction; a block takes about 0.6 s, and the Nauarch also waits for the model.</p>
        </>
      ),
    },
  ];
}
