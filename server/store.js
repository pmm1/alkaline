import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS threads (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread_id, seq);
  CREATE INDEX IF NOT EXISTS threads_updated ON threads (updated_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Columns added after the first release.
const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
if (!messageColumns.includes('links')) db.exec('ALTER TABLE messages ADD COLUMN links TEXT');
if (!messageColumns.includes('link_context')) db.exec('ALTER TABLE messages ADD COLUMN link_context TEXT');

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const q = {
  listThreads: db.prepare(`
    SELECT t.id, t.title, t.created_at, t.updated_at,
           (SELECT substr(content, 1, 120) FROM messages m WHERE m.thread_id = t.id ORDER BY seq DESC LIMIT 1) AS preview
    FROM threads t ORDER BY t.updated_at DESC
  `),
  threadSummary: db.prepare(`
    SELECT t.id, t.title, t.created_at, t.updated_at,
           (SELECT substr(content, 1, 120) FROM messages m WHERE m.thread_id = t.id ORDER BY seq DESC LIMIT 1) AS preview
    FROM threads t WHERE t.id = ?
  `),
  messages: db.prepare('SELECT id, role, content, links, created_at FROM messages WHERE thread_id = ? ORDER BY seq'),
  recentMessages: db.prepare(`
    SELECT role, content, link_context FROM (
      SELECT seq, role, content, link_context FROM messages WHERE thread_id = ? ORDER BY seq DESC LIMIT ?
    ) ORDER BY seq
  `),
  lastMessage: db.prepare('SELECT seq, role FROM messages WHERE thread_id = ? ORDER BY seq DESC LIMIT 1'),
  messageCount: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE thread_id = ?'),
  insertThread: db.prepare('INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'),
  renameThread: db.prepare('UPDATE threads SET title = ? WHERE id = ?'),
  touchThread: db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?'),
  deleteThread: db.prepare('DELETE FROM threads WHERE id = ?'),
  insertMessage: db.prepare(
    'INSERT INTO messages (id, thread_id, role, content, created_at, links, link_context) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  deleteMessage: db.prepare('DELETE FROM messages WHERE seq = ?'),
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ),
};

const toSummary = (row) =>
  row && {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: row.preview ?? '',
  };

const toMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
  ...(row.links ? { links: JSON.parse(row.links) } : {}),
});

export const newId = () => crypto.randomUUID();

export function listThreads() {
  return q.listThreads.all().map(toSummary);
}

export function summary(id) {
  return toSummary(q.threadSummary.get(id)) ?? null;
}

export function getThread(id) {
  const thread = summary(id);
  if (!thread) return null;
  return { ...thread, messages: q.messages.all(id).map(toMessage) };
}

/** The last `limit` messages of a thread, oldest first, shaped for the model (with any linked page text). */
export function recentMessages(threadId, limit) {
  return q.recentMessages.all(threadId, limit).map(({ role, content, link_context }) => ({
    role,
    content: link_context ? `${content}\n\n${link_context}` : content,
  }));
}

export function messageCount(threadId) {
  return q.messageCount.get(threadId).n;
}

export function lastMessageRole(threadId) {
  return q.lastMessage.get(threadId)?.role ?? null;
}

export function createThread(title = 'New chat') {
  const now = new Date().toISOString();
  const id = newId();
  q.insertThread.run(id, title, now, now);
  return { ...summary(id), messages: [] };
}

export function renameThread(id, title) {
  return q.renameThread.run(title, id).changes > 0;
}

export function deleteThread(id) {
  return q.deleteThread.run(id).changes > 0;
}

export function addMessage(threadId, role, content, { links = null, linkContext = null } = {}) {
  const message = { id: newId(), role, content, createdAt: new Date().toISOString(), ...(links?.length ? { links } : {}) };
  transaction(() => {
    q.insertMessage.run(
      message.id,
      threadId,
      role,
      content,
      message.createdAt,
      links?.length ? JSON.stringify(links) : null,
      linkContext || null
    );
    q.touchThread.run(message.createdAt, threadId);
  });
  return message;
}

export function deleteLastAssistantMessage(threadId) {
  const last = q.lastMessage.get(threadId);
  if (last?.role === 'assistant') q.deleteMessage.run(last.seq);
}

export function getSettings() {
  return { detoxStart: q.getSetting.get('detoxStart')?.value ?? null };
}

export function updateSettings({ detoxStart }) {
  q.setSetting.run('detoxStart', detoxStart);
  return getSettings();
}

// One-time import from the old JSON store (data/db.json), which is then renamed to db.json.migrated.
function migrateFromJson() {
  const legacy = config.legacyJsonFile;
  if (!fs.existsSync(legacy)) return;
  if (db.prepare('SELECT COUNT(*) AS n FROM threads').get().n > 0) return;

  const data = JSON.parse(fs.readFileSync(legacy, 'utf8'));
  transaction(() => {
    for (const t of data.threads ?? []) {
      q.insertThread.run(t.id, t.title, t.createdAt, t.updatedAt);
      for (const m of t.messages ?? []) {
        q.insertMessage.run(m.id, t.id, m.role, m.content, m.createdAt, null, null);
      }
    }
    if (data.settings?.detoxStart) q.setSetting.run('detoxStart', data.settings.detoxStart);
  });
  fs.renameSync(legacy, `${legacy}.migrated`);
  console.log(`Imported ${data.threads?.length ?? 0} chats from ${path.basename(legacy)} into SQLite.`);
}

migrateFromJson();

export function close() {
  db.close();
}
