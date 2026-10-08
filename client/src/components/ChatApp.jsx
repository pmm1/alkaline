import { useCallback, useEffect, useRef, useState } from 'react';
import { api, stream, AuthError } from '../api.js';
import Sidebar from './Sidebar.jsx';
import Welcome from './Welcome.jsx';
import Message from './Message.jsx';
import Composer from './Composer.jsx';
import { MenuIcon, PlusIcon, RetryIcon } from './icons.jsx';

const threadFromHash = () => location.hash.match(/^#\/c\/([\w-]+)$/)?.[1] ?? null;

export default function ChatApp({ onSignedOut }) {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesByThread, setMessagesByThread] = useState({});
  const [loadingThread, setLoadingThread] = useState(false);
  const [streaming, setStreaming] = useState(null); // { threadId, text, thinking }
  const [error, setError] = useState(null); // { threadId, message }
  const [settings, setSettings] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  const messages = (activeId && messagesByThread[activeId]) || [];
  const activeThread = threads.find((t) => t.id === activeId);
  const isStreamingHere = streaming && streaming.threadId === activeId;

  const fail = useCallback(
    (err) => {
      if (err instanceof AuthError) onSignedOut();
      else console.error(err);
    },
    [onSignedOut]
  );

  const upsertThread = useCallback((summary) => {
    setThreads((prev) => [summary, ...prev.filter((t) => t.id !== summary.id)]);
  }, []);

  const setThreadMessages = useCallback((threadId, update) => {
    setMessagesByThread((prev) => ({
      ...prev,
      [threadId]: typeof update === 'function' ? update(prev[threadId] || []) : update,
    }));
  }, []);

  const selectThread = useCallback(
    async (id) => {
      setActiveId(id);
      setSidebarOpen(false);
      setError(null);
      history.replaceState(null, '', id ? `#/c/${id}` : location.pathname);
      stickToBottom.current = true;
      if (!id) return;
      setLoadingThread(true);
      try {
        const thread = await api.thread(id);
        setThreadMessages(id, thread.messages);
      } catch (err) {
        if (err instanceof AuthError) return onSignedOut();
        setActiveId(null);
        history.replaceState(null, '', location.pathname);
      } finally {
        setLoadingThread(false);
      }
    },
    [onSignedOut, setThreadMessages]
  );

  useEffect(() => {
    Promise.all([api.threads(), api.settings()])
      .then(([list, s]) => {
        setThreads(list);
        setSettings(s);
        const fromHash = threadFromHash();
        if (fromHash && list.some((t) => t.id === fromHash)) selectThread(fromHash);
      })
      .catch(fail);
  }, [fail, selectThread]);

  // Keep the view pinned to the newest message unless the user scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text, streaming?.thinking, error, loadingThread]);

  function onScroll() {
    const el = scrollRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function runStream(threadId, path, body) {
    const controller = new AbortController();
    abortRef.current = controller;
    stickToBottom.current = true;
    setError(null);
    setStreaming({ threadId, text: '', thinking: false });

    let text = '';
    let finished = false;
    let errorMessage = null;

    try {
      await stream(path, body, {
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === 'meta') {
            upsertThread(data.thread);
            if (data.userMessage) {
              setThreadMessages(threadId, (list) =>
                list.map((m) => (m.pending ? data.userMessage : m))
              );
            }
          } else if (event === 'thinking') {
            setStreaming((s) => s && { ...s, thinking: true });
          } else if (event === 'delta') {
            text += data.text;
            setStreaming((s) => s && { ...s, text, thinking: false });
          } else if (event === 'done') {
            finished = true;
            setThreadMessages(threadId, (list) => [...list, data.message]);
            upsertThread(data.thread);
          } else if (event === 'error') {
            errorMessage = data.message;
          }
        },
      });
    } catch (err) {
      if (err instanceof AuthError) return onSignedOut();
      if (err.name !== 'AbortError') errorMessage = err.message || 'Connection lost.';
    }

    // Stopped or interrupted mid-answer: the server keeps the partial text, so show it too.
    if (!finished && text.trim()) {
      setThreadMessages(threadId, (list) => [
        ...list,
        { id: `local-${Date.now()}`, role: 'assistant', content: text, createdAt: new Date().toISOString() },
      ]);
    }
    if (errorMessage && !text.trim()) setError({ threadId, message: errorMessage });
    setThreadMessages(threadId, (list) => list.map((m) => (m.pending ? { ...m, pending: false } : m)));
    setStreaming(null);
    abortRef.current = null;
  }

  async function send(content) {
    if (streaming) return;
    let threadId = activeId;
    if (!threadId) {
      try {
        const thread = await api.createThread();
        threadId = thread.id;
        upsertThread({ ...thread, preview: '' });
        setThreadMessages(threadId, []);
        setActiveId(threadId);
        history.replaceState(null, '', `#/c/${threadId}`);
      } catch (err) {
        return fail(err);
      }
    }
    setThreadMessages(threadId, (list) => [
      ...list,
      { id: `pending-${Date.now()}`, role: 'user', content, pending: true, createdAt: new Date().toISOString() },
    ]);
    await runStream(threadId, `/threads/${threadId}/messages`, { content });
  }

  async function regenerate() {
    if (streaming || !activeId) return;
    setThreadMessages(activeId, (list) => (list.at(-1)?.role === 'assistant' ? list.slice(0, -1) : list));
    await runStream(activeId, `/threads/${activeId}/regenerate`, {});
  }

  async function renameThread(id, title) {
    try {
      upsertThread(await api.renameThread(id, title));
    } catch (err) {
      fail(err);
    }
  }

  async function deleteThread(id) {
    try {
      await api.deleteThread(id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
      setMessagesByThread(({ [id]: _, ...rest }) => rest);
      if (id === activeId) selectThread(null);
    } catch (err) {
      fail(err);
    }
  }

  async function saveDetoxStart(detoxStart) {
    try {
      setSettings(await api.saveSettings({ detoxStart }));
    } catch (err) {
      fail(err);
    }
  }

  async function signOut() {
    await api.logout().catch(() => {});
    onSignedOut();
  }

  const showWelcome = !activeId || (!loadingThread && messages.length === 0 && !isStreamingHere);
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  return (
    <div className={`shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar
        threads={threads}
        activeId={activeId}
        settings={settings}
        onSelect={selectThread}
        onNew={() => selectThread(null)}
        onRename={renameThread}
        onDelete={deleteThread}
        onSaveDetoxStart={saveDetoxStart}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
      />
      <button className="scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setSidebarOpen(false)} />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setSidebarOpen(true)} aria-label="Open chats">
            <MenuIcon />
          </button>
          <h2 className="topbar-title">{activeThread?.title || 'New chat'}</h2>
          <button className="icon-btn only-mobile" onClick={() => selectThread(null)} aria-label="New chat">
            <PlusIcon />
          </button>
        </header>

        <div className="scroller" ref={scrollRef} onScroll={onScroll}>
          {showWelcome ? (
            <Welcome settings={settings} onPick={send} disabled={Boolean(streaming)} />
          ) : (
            <div className="thread">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  canRetry={i === lastAssistantIndex && i === messages.length - 1 && !streaming}
                  onRetry={regenerate}
                />
              ))}
              {isStreamingHere && (
                <Message
                  message={{ id: 'streaming', role: 'assistant', content: streaming.text }}
                  streaming
                  thinking={streaming.thinking}
                />
              )}
              {error && error.threadId === activeId && (
                <div className="error-card" role="alert">
                  <p>{error.message}</p>
                  <button className="btn-ghost" onClick={regenerate}>
                    <RetryIcon /> Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <Composer
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          streaming={Boolean(streaming)}
          autoFocusKey={activeId}
        />
      </main>
    </div>
  );
}
