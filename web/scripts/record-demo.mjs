import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.DEMO_BASE_URL;
if (!BASE) throw new Error("set DEMO_BASE_URL to the running web app, for example https://brinewar.example");
const OUT = resolve(process.env.DEMO_OUT ?? "demo-out");
const SIZE = { width: 1280, height: 720 };
const FPS = 30;

const PLAN = [
  { scene: "reveal", seconds: 10, title: "The finale", line: "The fog lifts, his fleet rises, the reveal is verified on chain." },
  { scene: "play", seconds: 10, title: "Play with no wallet", line: "A guest account in seconds, every shot a transaction, his reply signed in a TEE." },
  { scene: "admiralty", seconds: 10, title: "He hunts where you hide", line: "The admiralty map from every verified board, day by day." },
  { scene: "verify", seconds: 8, title: "Verify", line: "Your browser rechecks every proof and signature against the contract." },
  { scene: "end", seconds: 3, title: "No wallet. No popups.", line: "Every shot proven." },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function scene(name, run) {
  const dir = join(OUT, name);
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, colorScheme: "dark" });
  const page = await context.newPage();
  const t0 = Date.now();
  const mark = () => (Date.now() - t0) / 1000;
  const marks = await run(page, mark, context);
  await context.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!file) throw new Error(`no video for ${name}`);
  return { name, file: join(dir, file), ...marks };
}

const pause = (page, ms) => page.waitForTimeout(ms);
const FULL_GAME = process.env.DEMO_FULL_GAME === "1";
const ENDED = /Victory, Captain\.|The Nauarch prevails\./;

const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

function neighbours8(i) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = (i % 10) + dx;
      const y = Math.floor(i / 10) + dy;
      if ((dx || dy) && x >= 0 && x < 10 && y >= 0 && y < 10) out.push(y * 10 + x);
    }
  return out;
}

function groups(hits) {
  const left = new Set(hits);
  const out = [];
  for (const h of hits) {
    if (!left.has(h)) continue;
    const g = [];
    const stack = [h];
    left.delete(h);
    while (stack.length) {
      const c = stack.pop();
      g.push(c);
      for (const n of [c - 10, c + 10, c % 10 > 0 ? c - 1 : -1, c % 10 < 9 ? c + 1 : -1]) if (left.has(n)) (left.delete(n), stack.push(n));
    }
    out.push(g.sort((a, b) => a - b));
  }
  return out;
}

function ends(g, blocked) {
  const horizontal = g.length > 1 ? g[1] - g[0] === 1 : null;
  const cand = [];
  const a = g[0];
  const b = g[g.length - 1];
  if (horizontal !== false) {
    if (a % 10 > 0) cand.push(a - 1);
    if (b % 10 < 9) cand.push(b + 1);
  }
  if (horizontal !== true) {
    if (a >= 10) cand.push(a - 10);
    if (b < 90) cand.push(b + 10);
  }
  return cand.filter((c) => !blocked.has(c));
}

function nextTarget(mine) {
  const fired = new Set(mine.map((s) => s.index));
  const hits = mine.filter((s) => s.result === "Hit").map((s) => s.index);
  const blocked = new Set(fired);
  const diag = (a, b) => Math.abs((a % 10) - (b % 10)) === 1 && Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) === 1;
  for (const h of hits) for (const n of neighbours8(h)) if (diag(h, n)) blocked.add(n);
  const live = [];
  const remaining = [...FLEET];
  for (const g of groups(hits)) {
    if (g.length > 1) {
      const horizontal = g[1] - g[0] === 1;
      for (const c of g) for (const n of neighbours8(c)) if (!diag(c, n) && !g.includes(n) && (horizontal ? Math.floor(n / 10) !== Math.floor(c / 10) : n % 10 !== c % 10)) blocked.add(n);
    }
    const open = ends(g, blocked);
    if (open.length && g.length < 4) live.push({ g, open });
    else {
      for (const c of g) for (const n of neighbours8(c)) blocked.add(n);
      const k = remaining.indexOf(g.length);
      if (k >= 0) remaining.splice(k, 1);
    }
  }
  const heat = new Array(100).fill(0);
  for (const len of remaining)
    for (let start = 0; start < 100; start++)
      for (const horizontal of [true, false]) {
        const x = start % 10;
        const y = Math.floor(start / 10);
        if (horizontal ? x + len > 10 : y + len > 10) continue;
        const body = Array.from({ length: len }, (_, k) => (horizontal ? start + k : start + k * 10));
        if (body.some((c) => blocked.has(c))) continue;
        for (const c of body) heat[c] += 1;
      }
  const pick = (cells) => cells.reduce((best, c) => (heat[c] > heat[best] ? c : best), cells[0]);
  if (live.length) return pick(live.flatMap((l) => l.open));
  const free = Array.from({ length: 100 }, (_, c) => c).filter((c) => !blocked.has(c));
  if (free.length) return pick(free);
  return Array.from({ length: 100 }, (_, c) => c).find((c) => !fired.has(c));
}

const cellName = (i) => `${"ABCDEFGHIJ"[i % 10]}${Math.floor(i / 10) + 1}`;

async function myShots(id) {
  const res = await fetch(`${BASE}/api/game/${id}/proofs`);
  if (!res.ok) throw new Error(`proofs ${res.status}`);
  const p = await res.json();
  return p.history.filter((s) => s.by === p.game.a);
}

async function fire(page, cell, typed) {
  const input = page.getByLabel("Target");
  if (typed) await input.pressSequentially(cell, { delay: 120 });
  else await input.fill(cell);
  await page.getByRole("button", { name: "Fire", exact: true }).click();
  await page.waitForFunction(() => !(document.querySelector("[role=status]")?.textContent ?? "").includes("Your turn"), null, { timeout: 30_000 });
  await page.waitForFunction(
    (re) => (document.querySelector("[role=status]")?.textContent ?? "").includes("Your turn") || new RegExp(re).test(document.body.innerText),
    ENDED.source,
    { timeout: 300_000 },
  );
}

const isOver = async (page) => ENDED.test(await page.locator("body").innerText());

let gameId = null;
const played = await scene("play", async (page, mark) => {
  await page.goto(`${BASE}/`);
  const command = page.getByRole("button", { name: "Take command" });
  await command.waitFor({ timeout: 90_000 });
  await pause(page, 2500);
  await command.click();
  const sail = page.getByRole("button", { name: "Set sail against the Nauarch" });
  await sail.waitFor({ timeout: 90_000 });
  await pause(page, 1500);
  const start = mark();
  await sail.click();
  await page.getByText("Your turn").first().waitFor({ timeout: 120_000 });
  const href = await page.getByRole("link", { name: "Verify" }).first().getAttribute("href");
  gameId = href?.split("/").pop() ?? null;
  if (!gameId) throw new Error("no game id on the page");
  for (const cell of ["E5", "F6"]) {
    await fire(page, cell, true);
    await pause(page, 1500);
  }
  const end = mark();
  if (FULL_GAME) {
    let shots = 2;
    while (!(await isOver(page)) && shots < 100) {
      await fire(page, cellName(nextTarget(await myShots(gameId))), false);
      shots += 1;
    }
  } else {
    await page.getByRole("button", { name: "Strike colours" }).click();
  }
  await page.getByText(ENDED).first().waitFor({ timeout: 300_000 });
  const outcome = (await page.getByText(ENDED).first().innerText()).trim();
  const revealStart = mark();
  await page.getByText("verified", { exact: false }).first().waitFor({ timeout: 120_000 });
  await pause(page, 6000);
  return { start, end, revealStart, revealEnd: mark(), outcome };
});
const revealed = { name: "reveal", file: played.file, start: played.revealStart, end: played.revealEnd };

const mapped = await scene("admiralty", async (page, mark) => {
  await page.goto(`${BASE}/admiralty`);
  await page.getByRole("heading", { name: "Where the Nauarch hunts now" }).waitFor();
  await pause(page, 1500);
  const start = mark();
  const slider = page.getByRole("slider", { name: "Day" });
  if (await slider.count()) {
    const max = Number(await slider.getAttribute("max"));
    for (let v = 0; v <= max; v++) {
      await slider.fill(String(v));
      await pause(page, Math.max(250, 6000 / (max + 1)));
    }
  }
  const cells = page.locator('svg[role="img"] g');
  if (await cells.count()) {
    for (const k of [11, 12, 44, 45]) {
      await cells.nth(k).hover();
      await pause(page, 700);
    }
  } else {
    await pause(page, 3000);
  }
  return { start, end: mark() };
});

const verified = await scene("verify", async (page, mark) => {
  if (!gameId) throw new Error("no game id from the play scene");
  await page.goto(`${BASE}/verify/${gameId}`);
  await page.getByText("proof ✓").first().waitFor({ timeout: 60_000 });
  await pause(page, 800);
  const start = mark();
  for (let y = 0; y < 1600; y += 40) {
    await page.mouse.wheel(0, 40);
    await pause(page, 60);
  }
  await pause(page, 1500);
  return { start, end: mark() };
});

const ended = await scene("end", async (page, mark) => {
  await page.goto(`${BASE}/judges`);
  await page.setContent(
    `<body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(120% 80% at 50% 0%,#2a8db6,#0b2230 70%);color:#f4f7f8;font:600 44px Georgia,serif;text-align:center">
      <div>No wallet. No popups.<br/><span style="color:#ffcf5a">Every shot proven.</span><div style="font:500 18px system-ui;margin-top:18px;opacity:.8">Brinewar · NEAR</div></div>
    </body>`,
  );
  await pause(page, 400);
  const start = mark();
  await pause(page, 3200);
  return { start, end: mark() };
});

await browser.close();

const clips = { play: played, reveal: revealed, admiralty: mapped, verify: verified, end: ended };
const parts = [];
const chapters = [];
let at = 0;
for (const p of PLAN) {
  const c = clips[p.scene];
  const span = c.end - c.start;
  const speed = span / p.seconds;
  const part = join(OUT, `${p.scene}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", c.start.toFixed(2), "-t", span.toFixed(2), "-i", c.file,
    "-vf", `setpts=PTS/${speed.toFixed(4)},fps=${FPS},scale=${SIZE.width}:${SIZE.height}`,
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", part,
  ]);
  parts.push(part);
  chapters.push({ at: Math.round(at * 10) / 10, title: p.title, line: p.line });
  at += Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", part]).toString().trim());
}
const list = join(OUT, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
const final = join(OUT, "brinewar.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", final]);
writeFileSync(join(OUT, "chapters.json"), `${JSON.stringify(chapters, null, 2)}\n`);
const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final]).toString().trim();
console.log(JSON.stringify({ video: final, seconds: Number(probe), chapters, gameId, outcome: played.outcome }, null, 2));
