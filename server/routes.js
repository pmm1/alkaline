import { Router } from 'express';
import * as store from './store.js';
import { streamChat } from './llm.js';
import { buildSystemPrompt, detoxStatus } from './prompt.js';

const MAX_MESSAGE_CHARS = 8000;
const HISTORY_LIMIT = 40;

export const apiRouter = Router();

function makeTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean || 'New chat';
}

function settingsResponse() {
  const settings = store.getSettings();
  return { ...settings, status: detoxStatus(settings.detoxStart) };
}

apiRouter.get('/settings', (req, res) => res.json(settingsResponse()));

apiRouter.put('/settings', (req, res) => {
  const { detoxStart } = req.body ?? {};
  if (detoxStart !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(detoxStart))) {
    return res.status(400).json({ error: 'detoxStart must be YYYY-MM-DD or null' });
  }
  store.updateSettings({ detoxStart });
  res.json(settingsResponse());
});

apiRouter.get('/threads', (req, res) => res.json(store.listThreads()));

apiRouter.post('/threads', (req, res) => {
  res.status(201).json(store.createThread());
});

apiRouter.get('/threads/:id', (req, res) => {
  const thread = store.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Chat not found' });
  res.json(thread);
});

apiRouter.patch('/threads/:id', (req, res) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 80);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!store.renameThread(req.params.id, title)) return res.status(404).json({ error: 'Chat not found' });
  res.json(store.summary(req.params.id));
});

apiRouter.delete('/threads/:id', (req, res) => {
  if (!store.deleteThread(req.params.id)) return res.status(404).json({ error: 'Chat not found' });
  res.status(204).end();
});

// Adds a user message and streams the assistant's reply as Server-Sent Events.
apiRouter.post('/threads/:id/messages', async (req, res) => {
  const threadId = req.params.id;
  if (!store.summary(threadId)) return res.status(404).json({ error: 'Chat not found' });

  const content = String(req.body?.content ?? '').trim();
  if (!content) return res.status(400).json({ error: 'Message is empty' });
  if (content.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: 'Message is too long' });

  if (store.messageCount(threadId) === 0) store.renameThread(threadId, makeTitle(content));
  const userMessage = store.addMessage(threadId, 'user', content);

  await streamReply(threadId, res, { userMessage });
});

// Retries the reply to the last user message (after an error or to get a different answer).
apiRouter.post('/threads/:id/regenerate', async (req, res) => {
  const threadId = req.params.id;
  if (!store.summary(threadId)) return res.status(404).json({ error: 'Chat not found' });
  store.deleteLastAssistantMessage(threadId);
  if (store.lastMessageRole(threadId) !== 'user') return res.status(400).json({ error: 'Nothing to answer' });
  await streamReply(threadId, res, {});
});

async function streamReply(threadId, res, meta) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send('meta', { thread: store.summary(threadId), ...meta });

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const messages = [
    { role: 'system', content: buildSystemPrompt(store.getSettings()) },
    ...store.recentMessages(threadId, HISTORY_LIMIT),
  ];

  let text = '';
  let sentThinking = false;
  try {
    await streamChat({
      messages,
      signal: controller.signal,
      onThinking: () => {
        if (!sentThinking) send('thinking', {});
        sentThinking = true;
      },
      onDelta: (chunk) => {
        text += chunk;
        send('delta', { text: chunk });
      },
    });
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error('Chat stream failed:', err.message);
      send('error', { message: err.message || 'Something went wrong talking to the model.' });
    }
  }

  // Keep whatever was generated, even if the user pressed stop.
  // The chat may have been deleted while the answer was streaming.
  if (text.trim() && store.summary(threadId)) {
    const message = store.addMessage(threadId, 'assistant', text);
    if (!res.writableEnded && !controller.signal.aborted) send('done', { message, thread: store.summary(threadId) });
  }
  if (!res.writableEnded) res.end();
}
