# Brinewar

A naval battle on NEAR where the blockchain stays out of sight. You open the site and play: no wallet, no seed phrase, no popup. Every shot is a NEAR transaction, every answer comes with a Merkle proof the contract checks, and your opponent, **the Nauarch**, is an AI admiral: every move his model makes is produced by NEAR AI Cloud inside a TEE, signed there, and verified by the contract before it counts (if the model is late or wrong, the contract plays a deterministic shot, labelled as such). He learns where all captains hide their ships from an on-chain map, keeps a treasury that pays bounties and grows poor when he loses, and reads your record against him before every move.

Play: **https://brinewar.imbanytui.xyz** · For judges: **https://brinewar.imbanytui.xyz/judges**

Track: **Games**. Network: **NEAR testnet only**.

**Who it is for.** Anyone who runs a game of skill against a house AI has the same problem: players assume the bot cheats, because it could. Brinewar shows the fix on NEAR: the house opponent cannot see your board (Merkle commitments), cannot change its own (sealed before the first shot), and every move its model makes is signed in a TEE and checked by the contract. The player never touches a wallet.

## Try it: do X, see Y

| Do | See |
|---|---|
| Open the site in a fresh browser | The landing shows live numbers from the chain: boards the Nauarch has studied, gold in his treasury, and the hottest cell on his map with the share of fleets that sat there. A guest account, a flagship, 100 gold and three skins are created in the background. No wallet window, ever. |
| Press **Take command** | Your fleet is ready to place in a few seconds. The red cells are where he will look first, learned from the verified boards on the Admiralty map, and the panel says how many of your ship cells sit there. Drag and turn ships into cold water, pick a name and a skin. Entry and bounty are shown before you sail. |
| Press **Back to the chart** (any time before a battle) | The sea chart: tap the water and your flagship sails there. Nauarch patrols cross the sea, real captains from the leaderboard ride at anchor, and the islands lead to the Admiralty map, his treasury, the captains' board and a wreck that replays a battle from the chain. |
| Press **Set sail**, tap a cell in the fog | Your first shot is open within seconds. Each shot lands with a callout (hit, miss, sunk) and sound. A hit earns another shot, for both sides, and the contract enforces it. After a miss the Nauarch fires back with one line marked **signed ✓**: your browser re-checked the model signature against the key in the contract. If the model is late, the contract fires for him and the bubble says so. When he fires into hot water from the map, the callout says *Hunting from the Admiralty map* with the share of fleets that sat there. |
| Win or lose | The fog lifts, his fleet rises, a **Played fair ✓** seal explains that his fleet matches the board he sealed before the first shot and links to his reveal transaction, and the card shows your gold, XP and rank change. |
| Press **Verify** | `/verify/<id>` reads the battle from the contract and, in your browser, recomputes the Merkle proof of every answer the Nauarch gave, his reveal against his sealed root and every model signature. |
| Press **Duel a friend instead**, then **Create the duel link**, and send it | Your friend opens it in any browser, also with no wallet, accepts, and you duel: same Merkle proofs, a one-minute move clock, a chat between the two captains, no gold at stake, XP for both flagships. |
| Open **Admiralty** | The heat map of where captains hide ships, built only from boards the contract verified (one per captain per day). A day slider appears once more than one day is recorded. The Nauarch fires at the hot cells first. |
| Open **Treasury**, press **Simulate 50 battles** | Live treasury, entry fee and bounty, then a fast-forward of 50 battles using the contract's own formulas (labelled as a simulation). |
| Open **Fair play**, then **Watch a finished battle** | A finished battle the Nauarch won by sinking a whole fleet, replayed from the chain with his signed lines, ending with his fleet rising from the root he sealed. |
| Open **Fleet** | Your flagship token, rank and XP. Every new rank mints a skin (Lieutenant, Captain, Commodore, Admiral) as a NEP-245 token. |

## How it works

- **Hidden boards.** A board is 100 cells with a 32-byte salt each. Leaves are `sha256(index ‖ cell ‖ salt)`, padded to 128 and hashed into a root that is committed before the first shot. Each answer sends the cell, its salt and a 7-hash proof; the contract checks it against the root. At the end both boards are revealed and the contract checks the fleet shape (1×4, 2×3, 3×2, 4×1, no touching).
- **The Nauarch.** The contract itself builds the model request from public game state (shots so far, the admiralty map snapshot, a dossier on you), with `temperature 0` and a fixed seed. Our server sends it to NEAR AI Cloud byte for byte, fetches the TEE signature over `model:sha256(request):sha256(response)` and submits it. The contract verifies the ed25519 signature with the attested model key, parses `{"shot","line"}` and records both. The model does not pick from the whole board: the contract lists the sensible cells in the request (the open ends of a wounded ship until it sinks; otherwise the hottest open cells of the admiralty map, then cells spread across the board; never next to a sunk ship or diagonal to a hit). While finishing a ship or hunting the map he must pick one of those; in the open hunt any open cell that is not next to a sunk ship or diagonal to a hit is accepted. If the model is late or names a cell that is not allowed, the contract fires the first listed cell, and the UI says so.
- **Why a language model.** Statistics make him strong; the model makes him a character and keeps him unpredictable. He reads your record and the battle so far, answers in one line, and picks among equally good cells, so his next shot cannot be read from the code. The request is built on chain and the reply is TEE-signed and checked by the contract, which is what an operator needs to put an AI opponent in front of players who do not trust the house.
- **Two transactions per exchange.** An answer can carry the next move: a captain sends "answer his shot, then fire at X" in one call, and the Nauarch sends "answer, then my signed model move" (built from `nauarch_request_after`, the request as it will look once the answer lands). The contract checks the proof, then the turn, then the shot or the model signature, all in one receipt; if any check fails, nothing is applied. A full exchange (your shot, his answer, his shot) takes about 6–9 s on testnet instead of 15–18 s.
- **No wallet.** The browser keeps an ed25519 key in `localStorage`. The contract creates `p-<16 hex>.<contract>` with that key as a function-call key limited to the game methods and a 0.25 NEAR allowance. The board and its salts never leave the browser until the reveal.
- **Economy without patches.** Losers' stakes fill the Nauarch's treasury; sinking his fleet pays a bounty of 5% of it, capped. Below a threshold the entry fee rises and bounties shrink, all inside the contract.
- **The map that teaches him.** Every verified board adds to a 10×10 heat map (one per captain per day, from battles against the Nauarch that end with a fleet sunk, where the captain answered at least 10 shots). His deterministic hunt and his prompt both use it. "Learns" means statistics over all battles, not a neural network.
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
| `sponsor.brinewar.testnet` | registrar: signs guest sign-ups; the game contract creates and funds the accounts |

Example transactions are linked from the Verify page of any battle.

## Honest limits

- An illegal fleet is caught only at the final reveal. The cheat loses the battle and the stake, but cannot be stopped earlier. ZK at commit time would fix this.
- Our server keeps the Nauarch's board and salts. It cannot change them after the commit, but it can see them. Moving that into a TEE (OutLayer) is future work.
- The admin pins the NEAR AI model key after checking its attestation; the contract does not verify a TDX quote itself.
- The game contract funds guest accounts and their gas; a sponsor account signs the sign-ups.
- To protect testnet funds the harbour signs on at most 6 new guests per network address per hour and 12 per day (300 in all per day); judges sharing one address may see "too many new captains from this address".
- The admiralty map was seeded with scripted battles by test captains named `Seed_NN` so it was not empty on day one, and most of its boards so far come from them; the landing and the Admiralty page show the live count.
- A shot's result takes a few seconds (about 3–6 s on testnet): your transaction lands in about 2 s and the Nauarch's proven answer reaches your browser right after. The cannonball flies on the click so the wait is not dead air, but a full battle still takes 10–15 minutes.
- The replay rebuilds the captain's fleet from the Nauarch's hits, so it only shows battles he won by sinking the whole fleet. A captain's board is revealed in a transaction, not kept in contract state.
- "Save progress with Google" (NEAR Auth) is not shipped: the shared testnet client only accepts `localhost:3000`. See [`docs/research/2026-11-11-near-auth.md`](docs/research/2026-11-11-near-auth.md).

## What's next

Not built yet; these build on what is already on chain.

- **Skins as collectibles.** Every skin is already a NEP-245 token in the game contract, and `mt_transfer` moves it between registered captains today (it needs a full-access key, since a guest key cannot attach the 1 yoctoNEAR deposit). Next: limited and artist editions, plus NEP-245 approvals so skins can be listed on NEAR marketplaces; the contract refuses approvals for now.
- **Money never buys an edge.** Skins change how a ship looks and nothing else. Rank is earned only in battle: a flagship that changes hands keeps its record, but its rank freezes. Selling skins can fund the game without selling advantage.
- **The trusted house AI as a product.** The same pattern, sealed boards plus model moves signed in a TEE and checked by the contract, fits other games of skill where players need to trust the house bot.

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

Tests at the time of writing: 136 contract, 100 server, 178 web, plus 2 Playwright runs against the live testnet site (a battle with the Nauarch and a two-browser duel).

## Prior art

Naval battle on NEAR has been done before (a RISC Zero demo in 2022, FleetFaceoff in 2024); neither hides the chain from the player. ZK versions exist on other chains. Brinewar's angle is the invisible sign-in, an AI opponent whose every move is verified on chain, and an economy and map that evolve without a patch.

## Libraries, assets and AI-written code

- Contract: `near-sdk` 5.30.1 (sha256 and ed25519 through host functions), `serde_json`, `hex`. Server: `near-api-js` 7.4.0, Fastify, `node:sqlite`. Web: React 19, Vite 8, Tailwind 4, `radix-ui`, `lucide-react`, three.js with React Three Fiber and drei, `@noble/hashes` and `@noble/curves`.
- 3D ships: [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit), CC0 ([`web/public/models/LICENSE-kenney.txt`](web/public/models/LICENSE-kenney.txt)). Chart, islands and 2D ships: [Kenney Pirate Pack](https://kenney.nl/assets/pirate-pack), CC0 ([`web/public/sprites/LICENSE-kenney.txt`](web/public/sprites/LICENSE-kenney.txt)). Cannon, splash, hit and sinking sounds: [Battle at sea](https://opengameart.org/content/battle-at-sea) by Thimras, CC0 ([`web/public/sfx/LICENSE.txt`](web/public/sfx/LICENSE.txt)). Music (harbour and battle themes, victory and defeat stings): tracks by lavenderJunction, supplied by the team ([`web/public/music/CREDITS.txt`](web/public/music/CREDITS.txt)). Fonts: Archivo and Bespoke Stencil from [Fontshare](https://www.fontshare.com) (free licence), self-hosted.
- The NEAR AI request building and signature check follow the approach of the Psephex project by the same builder.
- Most of the code was written with an AI coding assistant (Claude Code), directed, reviewed and tested by the team. Design decisions are recorded in [`docs/adr/`](docs/adr), research in [`docs/research/`](docs/research).

## License

[MIT](LICENSE). Third-party assets keep their own licenses (see above).
