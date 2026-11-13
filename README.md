# Brinewar

A naval battle on NEAR where the blockchain stays out of sight. You open the site and play: no wallet, no seed phrase, no popup. Every shot is a NEAR transaction, every answer comes with a Merkle proof the contract checks, and your opponent, **the Nauarch**, is an AI admiral whose moves are produced by NEAR AI Cloud inside a TEE, signed there, and verified by the contract before they count. He learns where all captains hide their ships from an on-chain map, keeps a treasury that pays bounties and grows poor when he loses, and remembers you between battles.

Play: **https://brinewar.imbanytui.xyz** · For judges: **https://brinewar.imbanytui.xyz/judges**

Track: **Games**. Network: **NEAR testnet only**.

**Who it is for.** Anyone who runs a game of skill against a house AI has the same problem: players assume the bot cheats, because it could. Brinewar shows the fix on NEAR: the house opponent cannot see your board (Merkle commitments), cannot change its own (sealed before the first shot), and every one of its moves is signed by the model in a TEE and checked by the contract. The player never touches a wallet.

## Try it: do X, see Y

| Do | See |
|---|---|
| Open the site in a fresh browser | The landing shows live numbers from the chain: boards the Nauarch has studied, gold in his treasury, and his first guess with the share of fleets that sat there. A guest account, a flagship, 100 gold and three skins are created in the background. No wallet window, ever. |
| Press **Take command** | The sea chart opens. Tap the water and your flagship sails there: Nauarch patrols cross the sea, real captains from the leaderboard ride at anchor, and the islands lead to the Admiralty map, his treasury, the captains' board and a wreck that replays a battle from the chain. |
| Sail into a patrol and press **Engage** (or **Prepare for battle**) | Drag and turn your ships on a grid, switch on **Heat map** to see where he hunts first and how risky your layout is, pick a name and a skin, then choose the Nauarch (entry and bounty shown) or a friend (free). |
| Press **Set sail**, tap a cell in the fog | Your first shot is open within seconds. Each shot lands with a callout (hit, miss, sunk) and sound. A hit earns another shot, for both sides, and the contract enforces it. After a miss the Nauarch fires back with one line marked **signed ✓**: your browser re-checked the model signature against the key in the contract. When he fires into hot water from the map, the callout says *Hunting from the Admiralty map* with the share of fleets that sat there. |
| Win or lose | The fog lifts, his fleet rises, a **Played fair ✓** seal explains that his fleet matches the board he sealed before the first shot and links to his reveal transaction, and the card shows your gold, XP and rank change. |
| Press **Verify** | `/verify/<id>` reads the battle from the contract and recomputes every Merkle proof, his reveal and every model signature in your browser. |
| Press **Challenge a friend**, send the link | Your friend opens it in any browser, also with no wallet, accepts, and you duel: same Merkle proofs, no gold at stake, XP for both flagships. |
| Open **Admiralty** | The heat map of where captains hide ships, built only from boards the contract verified (one per captain per day). A day slider appears once more than one day is recorded. The Nauarch fires at the hot cells first. |
| Open **Treasury**, press **Simulate 50 battles** | Live treasury, entry fee and bounty, then a fast-forward of 50 battles using the contract's own formulas (labelled as a simulation). |
| Open **For judges**, then **Watch a finished battle** | A real battle the Nauarch won, replayed from the chain with his signed lines, ending with his fleet rising from the root he sealed. The page also holds the demo video once it is published. |
| Open **Fleet** | Your flagship token, rank and XP. Every new rank mints a skin (Lieutenant, Captain, Commodore, Admiral) as a NEP-245 token. |

## How it works

- **Hidden boards.** A board is 100 cells with a 32-byte salt each. Leaves are `sha256(index ‖ cell ‖ salt)`, padded to 128 and hashed into a root that is committed before the first shot. Each answer sends the cell, its salt and a 7-hash proof; the contract checks it against the root. At the end both boards are revealed and the contract checks the fleet shape (1×4, 2×3, 3×2, 4×1, no touching).
- **The Nauarch.** The contract itself builds the model request from public game state (shots so far, the admiralty map snapshot, a dossier on you), with `temperature 0` and a fixed seed. Our server sends it to NEAR AI Cloud byte for byte, fetches the TEE signature over `model:sha256(request):sha256(response)` and submits it. The contract verifies the ed25519 signature with the attested model key, parses `{"shot","line"}` and records both. If the model is late or wrong, the contract plays a deterministic hunt move, and the UI says so.
- **No wallet.** The browser keeps an ed25519 key in `localStorage`. The contract creates `p-<16 hex>.<contract>` with that key as a function-call key limited to the game methods and a 0.25 NEAR allowance. The board and its salts never leave the browser until the reveal.
- **Economy without patches.** Losers' stakes fill the Nauarch's treasury; sinking his fleet pays a bounty of 5% of it, capped. Below a threshold the entry fee rises and bounties shrink, all inside the contract.
- **The map that teaches him.** Every verified board adds to a 10×10 heat map (one per captain per day, battles of 10+ moves). His deterministic hunt and his prompt both use it. "Learns" means statistics over all battles, not a neural network.
- **Flagship.** A NEP-245 token per player with XP, wins, losses and ships sunk. Rank (Ensign → Admiral) is earned only in battle. A transferred flagship keeps its record but its rank freezes. Skins are cosmetic NEP-245 tokens: three at sign-up, one more for each rank reached; they are the only thing meant to be sold.

## What we use from NEAR

| Technology | Where |
|---|---|
| Function-call access keys | every move without a popup |
| Sub-accounts created by the game contract | guest sign-up |
| NEP-245 multi token | gold, flagships and skins in one contract |
| NEAR AI Cloud in a TEE + `ed25519_verify` | the Nauarch's moves, verified by the contract |
| `sha256` host function | Merkle proofs of the boards |
| NEP-297 events | battle history, treasury, map |

## Accounts

| Account | Role |
|---|---|
| [`brinewar.testnet`](https://testnet.nearblocks.io/address/brinewar.testnet) | the game contract (game + NEP-245 + treasury) |
| `admiral.brinewar.testnet` | the Nauarch: holds the treasury, plays through a function-call key |
| `sponsor.brinewar.testnet` | registrar: pays for guest accounts |

Example transactions are linked from the Verify page of any battle. Deployment steps: [`docs/runbook.md`](docs/runbook.md).

## Honest limits

- An illegal fleet is caught only at the final reveal. The cheat loses the battle and the stake, but cannot be stopped earlier. ZK at commit time would fix this.
- Our server keeps the Nauarch's board and salts. It cannot change them after the commit, but it can see them. Moving that into a TEE (OutLayer) is future work.
- The admin pins the NEAR AI model key after checking its attestation; the contract does not verify a TDX quote itself.
- A sponsor account pays for guest accounts and gas.
- The admiralty map was seeded with scripted battles by test captains named `Seed_NN` so it is not empty on day one; the landing and the Admiralty page show the live count of boards it holds.
- The replay rebuilds the captain's fleet from the Nauarch's hits, so it only shows battles he won by sinking the whole fleet. A captain's board is revealed in a transaction, not kept in contract state.
- "Save progress with Google" (NEAR Auth) is not shipped: the shared testnet client only accepts `localhost:3000`. See [`docs/research/2026-11-11-near-auth.md`](docs/research/2026-11-11-near-auth.md).

## Run it locally

Requirements: Rust with `wasm32-unknown-unknown` and `cargo-near`, Node 22.13+, Docker (only if your glibc is older than 2.38, for `near-sandbox`).

```bash
cd contracts/game && cargo test
```
```bash
cd server && npm ci && npm test
```
```bash
cd web && npm ci && npm test
```

Full stack on a local sandbox (contract, the Nauarch with a local signing model, the API):

```bash
cd server && DEV_API_PORT=8797 DEV_STACK_FILE=/tmp/brinewar-dev.json npm run devstack
```
```bash
cd web && BRINEWAR_API_PROXY=http://127.0.0.1:8797 VITE_NEAR_RPC_URL=<rpcUrl from /tmp/brinewar-dev.json> VITE_GAME_CONTRACT=brinewar.test.near npm run dev
```

Without `NEAR_AI_API_KEY` the Nauarch plays only deterministic moves, and the UI labels them. A full scripted battle on the sandbox: `cd server && npm run e2e` (about 10 minutes).

Tests at the time of writing: 120 contract, 61 server, 109 web, plus 2 Playwright runs against the live testnet site (a battle with the Nauarch and a two-browser duel).

## Prior art

Naval battle on NEAR has been done before (a RISC Zero demo in 2022, FleetFaceoff in 2024); neither hides the chain from the player. ZK versions exist on other chains. Brinewar's angle is the invisible sign-in, an AI opponent whose every move is verified on chain, and an economy and map that evolve without a patch.

## Libraries, assets and AI-written code

- Contract: `near-sdk` 5.30.1 (sha256 and ed25519 through host functions), `serde_json`, `hex`. Server: `near-api-js` 7.4.0, Fastify, `node:sqlite`. Web: React 19, Vite 8, Tailwind 4, `radix-ui`, `lucide-react`, three.js with React Three Fiber and drei, `@noble/hashes` and `@noble/curves`.
- 3D ships: [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit), CC0 ([`web/public/models/LICENSE-kenney.txt`](web/public/models/LICENSE-kenney.txt)). Chart, islands and 2D ships: [Kenney Pirate Pack](https://kenney.nl/assets/pirate-pack), CC0 ([`web/public/sprites/LICENSE-kenney.txt`](web/public/sprites/LICENSE-kenney.txt)). Cannon, splash, hit and sinking sounds: [Battle at sea](https://opengameart.org/content/battle-at-sea) by Thimras, CC0 ([`web/public/sfx/LICENSE.txt`](web/public/sfx/LICENSE.txt)). Fonts: Boska and Satoshi from [Fontshare](https://www.fontshare.com), self-hosted.
- The NEAR AI request building and signature check follow the approach of the Psephex project by the same builder.
- Most of the code was written with an AI coding assistant (Claude Code), directed, reviewed and tested by the team. Design decisions are recorded in [`docs/adr/`](docs/adr), research in [`docs/research/`](docs/research).

## License

[MIT](LICENSE). Third-party assets keep their own licenses (see above).
