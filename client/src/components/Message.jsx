import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckIcon, CopyIcon, RetryIcon } from './icons.jsx';

function firstText(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.length ? firstText(node[0]) : '';
  if (node?.props?.children) return firstText(node.props.children);
  return '';
}

const VERDICTS = [
  ['✅', 'yes'],
  ['⚠️', 'limited'],
  ['⚠', 'limited'],
  ['❌', 'no'],
];

function verdictOf(children) {
  const text = firstText(children).trimStart();
  return VERDICTS.find(([emoji]) => text.startsWith(emoji))?.[1] ?? null;
}

// Paragraphs that start with the assistant's verdict emoji get styled as a verdict pill.
const markdownComponents = {
  p({ children }) {
    const verdict = verdictOf(children);
    return <p className={verdict ? `verdict verdict-${verdict}` : undefined}>{children}</p>;
  },
  li({ children }) {
    const verdict = verdictOf(children);
    return <li className={verdict ? `verdict-li verdict-${verdict}` : undefined}>{children}</li>;
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

function Message({ message, streaming = false, thinking = false, canRetry = false, onRetry }) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className={`msg msg-user${message.pending ? ' pending' : ''}`}>
        <div className="bubble">{message.content}</div>
      </div>
    );
  }

  const empty = !message.content;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className={`msg msg-assistant${streaming ? ' streaming' : ''}`}>
      {empty && streaming ? (
        <div className="typing" aria-label={thinking ? 'Thinking' : 'Writing'}>
          <span />
          <span />
          <span />
          {thinking && <em>thinking</em>}
        </div>
      ) : (
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
      {!streaming && !empty && (
        <div className="msg-actions">
          <button className="mini-btn" onClick={copy} aria-label="Copy answer" title="Copy">
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {canRetry && (
            <button className="mini-btn" onClick={onRetry} aria-label="Regenerate answer" title="Regenerate">
              <RetryIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(Message);
