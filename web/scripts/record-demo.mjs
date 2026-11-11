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

let gameId = null;
const played = await scene("play", async (page, mark) => {
  await page.goto(`${BASE}/`);
  const sail = page.getByRole("button", { name: "Set sail against the Nauarch" });
  await sail.waitFor({ timeout: 90_000 });
  await pause(page, 1500);
  const start = mark();
  await sail.click();
  await page.getByText("Your turn").first().waitFor({ timeout: 120_000 });
  for (const cell of ["E5", "F6"]) {
    await page.getByLabel("Target").pressSequentially(cell, { delay: 120 });
    await page.getByRole("button", { name: "Fire", exact: true }).click();
    await page.getByText("is studying the sea").first().waitFor({ timeout: 120_000 });
    await page.getByText("Your turn").first().waitFor({ timeout: 180_000 });
    await pause(page, 1500);
  }
  const end = mark();
  const href = await page.getByRole("link", { name: "Verify" }).first().getAttribute("href");
  gameId = href?.split("/").pop() ?? null;
  await page.getByRole("button", { name: "Strike colours" }).click();
  await page.getByText("The Nauarch prevails.").waitFor({ timeout: 120_000 });
  const revealStart = mark();
  await page.getByText("verified", { exact: false }).first().waitFor({ timeout: 120_000 });
  await pause(page, 6000);
  return { start, end, revealStart, revealEnd: mark() };
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
  chapters.push({ at: Math.round(at), title: p.title, line: p.line });
  at += p.seconds;
}
const list = join(OUT, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
const final = join(OUT, "brinewar.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", final]);
writeFileSync(join(OUT, "chapters.json"), `${JSON.stringify(chapters, null, 2)}\n`);
const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final]).toString().trim();
console.log(JSON.stringify({ video: final, seconds: Number(probe), chapters, gameId }, null, 2));
