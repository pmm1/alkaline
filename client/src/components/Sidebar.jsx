import { useState } from 'react';
import DetoxCard from './DetoxCard.jsx';
import { CloseIcon, Drop, LogoutIcon, PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

function groupLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'This month';
  return 'Earlier';
}

function groupThreads(threads) {
  const groups = [];
  for (const t of threads) {
    const label = groupLabel(t.updatedAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

function ThreadItem({ thread, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);

  function commit() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== thread.title) onRename(thread.id, next);
    else setTitle(thread.title);
  }

  if (editing) {
    return (
      <li className="thread-item editing">
        <input
          autoFocus
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setTitle(thread.title);
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  return (
    <li className={`thread-item${active ? ' active' : ''}`}>
      <button className="thread-link" onClick={() => onSelect(thread.id)} title={thread.title}>
        {thread.title}
      </button>
      <div className="thread-actions">
        <button
          className="mini-btn"
          aria-label="Rename chat"
          onClick={() => {
            setTitle(thread.title);
            setEditing(true);
          }}
        >
          <PencilIcon />
        </button>
        <button
          className="mini-btn danger"
          aria-label="Delete chat"
          onClick={() => {
            if (confirm(`Delete "${thread.title}"?`)) onDelete(thread.id);
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

export default function Sidebar({ threads, activeId, settings, onSelect, onNew, onRename, onDelete, onSaveDetoxStart, onClose, onSignOut }) {
  return (
    <aside className="sidebar" aria-label="Chats">
      <div className="sidebar-head">
        <div className="brand">
          <Drop size={26} />
          <span className="brand-name">Alkaline</span>
        </div>
        <button className="icon-btn only-mobile" onClick={onClose} aria-label="Close menu">
          <CloseIcon />
        </button>
      </div>

      <button className="new-chat" onClick={onNew}>
        <PlusIcon width={18} height={18} />
        New chat
      </button>

      <DetoxCard settings={settings} onSave={onSaveDetoxStart} />

      <nav className="thread-list">
        {threads.length === 0 && <p className="empty-note">Your chats will show up here.</p>}
        {groupThreads(threads).map((group) => (
          <section key={group.label}>
            <h3 className="group-label">{group.label}</h3>
            <ul>
              {group.items.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  active={t.id === activeId}
                  onSelect={onSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sidebar-foot">
        <span className="foot-note">Dr. Koufman's Reflux Detox</span>
        <button className="mini-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}
