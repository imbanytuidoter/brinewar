import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS boards (game_id INTEGER PRIMARY KEY, root TEXT NOT NULL, sealed TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS answers (game_id INTEGER NOT NULL, idx INTEGER NOT NULL, cell INTEGER NOT NULL, salt TEXT NOT NULL, proof TEXT NOT NULL, tx TEXT, at INTEGER NOT NULL, PRIMARY KEY (game_id, idx));
CREATE TABLE IF NOT EXISTS reveals (game_id INTEGER PRIMARY KEY, cells TEXT NOT NULL, salts TEXT NOT NULL, tx TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, chat_id TEXT, request TEXT, response TEXT, signature TEXT, signed_text TEXT, error TEXT, tx TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, action TEXT NOT NULL, ok INTEGER NOT NULL, tx TEXT, error TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guests (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, account TEXT NOT NULL, tx TEXT, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ok');
CREATE TABLE IF NOT EXISTS samples (kind TEXT NOT NULL, at INTEGER NOT NULL, block INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sunk (game_id INTEGER NOT NULL, cells TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, cells));
CREATE TABLE IF NOT EXISTS chat (n INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, account TEXT NOT NULL, text TEXT NOT NULL, signed_at INTEGER NOT NULL, at INTEGER NOT NULL, UNIQUE (game_id, account, signed_at));
CREATE INDEX IF NOT EXISTS chat_game ON chat (game_id, n);
CREATE INDEX IF NOT EXISTS guests_ip_at ON guests (ip, at);
CREATE INDEX IF NOT EXISTS samples_kind_at ON samples (kind, at);
`;

export interface AnswerRow {
  idx: number;
  cell: number;
  salt: string;
  proof: string[];
  tx: string | null;
}

export interface AiMoveRow {
  kind: string;
  source: string;
  chat_id: string | null;
  request: string | null;
  response: string | null;
  signature: string | null;
  signed_text: string | null;
  error: string | null;
  tx: string | null;
  at: number;
}

export interface AiMoveInput {
  gameId: number;
  kind: string;
  source: string;
  chatId?: string | null;
  request?: string | null;
  response?: string | null;
  signature?: string | null;
  signedText?: string | null;
  error?: string | null;
  tx?: string | null;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  addChat(gameId: number, account: string, text: string, signedAt: number): number | null {
    const r = this.db.prepare("INSERT OR IGNORE INTO chat (game_id, account, text, signed_at, at) VALUES (?, ?, ?, ?, ?)").run(gameId, account, text, signedAt, this.now());
    return r.changes > 0 ? Number(r.lastInsertRowid) : null;
  }

  chat(gameId: number, after: number, limit: number): { n: number; account: string; text: string; at: number }[] {
    return this.db.prepare("SELECT n, account, text, at FROM chat WHERE game_id = ? AND n > ? ORDER BY n LIMIT ?").all(gameId, after, limit) as { n: number; account: string; text: string; at: number }[];
  }

  chatCount(gameId: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM chat WHERE game_id = ?").get(gameId) as { c: number }).c;
  }

  chatCountSince(account: string, since: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM chat WHERE account = ? AND at > ?").get(account, since) as { c: number }).c;
  }

  saveBoard(gameId: number, root: string, sealed: string): void {
    this.db.prepare("INSERT OR IGNORE INTO boards (game_id, root, sealed, created_at) VALUES (?, ?, ?, ?)").run(gameId, root, sealed, this.now());
  }

  board(gameId: number): { root: string; sealed: string } | undefined {
    return this.db.prepare("SELECT root, sealed FROM boards WHERE game_id = ?").get(gameId) as { root: string; sealed: string } | undefined;
  }

  saveAnswer(gameId: number, a: AnswerRow): void {
    this.db
      .prepare("INSERT OR REPLACE INTO answers (game_id, idx, cell, salt, proof, tx, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(gameId, a.idx, a.cell, a.salt, JSON.stringify(a.proof), a.tx, this.now());
  }

  saveSunk(gameId: number, cells: readonly number[]): void {
    this.db.prepare("INSERT OR IGNORE INTO sunk (game_id, cells, at) VALUES (?, ?, ?)").run(gameId, JSON.stringify([...cells].sort((x, y) => x - y)), this.now());
  }

  sunk(gameId: number): number[][] {
    const rows = this.db.prepare("SELECT cells FROM sunk WHERE game_id = ? ORDER BY at").all(gameId) as Array<{ cells: string }>;
    return rows.map((r) => JSON.parse(r.cells) as number[]);
  }

  answer(gameId: number, idx: number): AnswerRow | undefined {
    const r = this.db.prepare("SELECT idx, cell, salt, proof, tx FROM answers WHERE game_id = ? AND idx = ? LIMIT 1").get(gameId, idx) as (Omit<AnswerRow, "proof"> & { proof: string }) | undefined;
    return r ? { ...r, proof: JSON.parse(r.proof) as string[] } : undefined;
  }

  answers(gameId: number): AnswerRow[] {
    const rows = this.db.prepare("SELECT idx, cell, salt, proof, tx FROM answers WHERE game_id = ? ORDER BY at").all(gameId) as Array<Omit<AnswerRow, "proof"> & { proof: string }>;
    return rows.map((r) => ({ ...r, proof: JSON.parse(r.proof) as string[] }));
  }

  saveReveal(gameId: number, cells: string, salts: string[], tx: string | null): void {
    this.db.prepare("INSERT OR REPLACE INTO reveals (game_id, cells, salts, tx, at) VALUES (?, ?, ?, ?, ?)").run(gameId, cells, JSON.stringify(salts), tx, this.now());
  }

  reveal(gameId: number): { cells: string; salts: string[]; tx: string | null } | undefined {
    const r = this.db.prepare("SELECT cells, salts, tx FROM reveals WHERE game_id = ?").get(gameId) as { cells: string; salts: string; tx: string | null } | undefined;
    return r && { cells: r.cells, salts: JSON.parse(r.salts) as string[], tx: r.tx };
  }

  saveAiMove(m: AiMoveInput): void {
    this.db
      .prepare("INSERT INTO ai_moves (game_id, kind, source, chat_id, request, response, signature, signed_text, error, tx, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(m.gameId, m.kind, m.source, m.chatId ?? null, m.request ?? null, m.response ?? null, m.signature ?? null, m.signedText ?? null, m.error ?? null, m.tx ?? null, this.now());
  }

  aiMoves(gameId: number): AiMoveRow[] {
    return this.db
      .prepare("SELECT kind, source, chat_id, request, response, signature, signed_text, error, tx, at FROM ai_moves WHERE game_id = ? ORDER BY id")
      .all(gameId) as unknown as AiMoveRow[];
  }

  logAction(gameId: number, action: string, ok: boolean, tx: string | null, error: string | null): void {
    this.db.prepare("INSERT INTO actions (game_id, action, ok, tx, error, at) VALUES (?, ?, ?, ?, ?, ?)").run(gameId, action, ok ? 1 : 0, tx, error, this.now());
  }

  failures(gameId: number, action: string): number {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM actions WHERE game_id = ? AND action = ? AND ok = 0").get(gameId, action) as { n: number };
    return Number(r.n);
  }

  reserveGuest(ip: string, account: string, perIp: number, perDay: number, hourAgo: number, dayAgo: number): number | "ip" | "day" {
    if (perIp > 0 && this.guestsSince(hourAgo, ip) >= perIp) return "ip";
    if (this.guestsSince(dayAgo) >= perDay) return "day";
    const r = this.db.prepare("INSERT INTO guests (ip, account, tx, at, status) VALUES (?, ?, NULL, ?, 'pending')").run(ip, account, this.now());
    return Number(r.lastInsertRowid);
  }

  finishGuest(id: number, tx: string | null, ok: boolean): void {
    this.db.prepare("UPDATE guests SET tx = ?, status = ? WHERE id = ?").run(tx, ok ? "ok" : "failed", id);
  }

  recordGuest(ip: string, account: string, tx: string | null): void {
    this.db.prepare("INSERT INTO guests (ip, account, tx, at) VALUES (?, ?, ?, ?)").run(ip, account, tx, this.now());
  }

  guestsSince(sinceMs: number, ip?: string): number {
    const r = ip
      ? (this.db.prepare("SELECT COUNT(*) AS n FROM guests WHERE ip = ? AND at >= ?").get(ip, sinceMs) as { n: number })
      : (this.db.prepare("SELECT COUNT(*) AS n FROM guests WHERE at >= ?").get(sinceMs) as { n: number });
    return Number(r.n);
  }

  addSample(kind: string, block: number, data: unknown): void {
    this.db.prepare("INSERT INTO samples (kind, at, block, data) VALUES (?, ?, ?, ?)").run(kind, this.now(), block, JSON.stringify(data));
  }

  lastSample(kind: string): { at: number; block: number; data: unknown } | undefined {
    const r = this.db.prepare("SELECT at, block, data FROM samples WHERE kind = ? ORDER BY at DESC, rowid DESC LIMIT 1").get(kind) as { at: number; block: number; data: string } | undefined;
    return r && { at: r.at, block: r.block, data: JSON.parse(r.data) };
  }

  samples(kind: string, limit: number): Array<{ at: number; block: number; data: unknown }> {
    const rows = this.db.prepare("SELECT at, block, data FROM samples WHERE kind = ? ORDER BY at DESC, rowid DESC LIMIT ?").all(kind, limit) as Array<{ at: number; block: number; data: string }>;
    return rows.reverse().map((r) => ({ at: r.at, block: r.block, data: JSON.parse(r.data) }));
  }

  get(k: string): string | undefined {
    return (this.db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined)?.v;
  }

  set(k: string, v: string): void {
    this.db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").run(k, v);
  }
}
