import { Drop } from './icons.jsx';

const SUGGESTIONS = [
  { label: 'Can I have coffee this morning?', kind: 'Ask' },
  { label: 'Give me a quick detox-safe breakfast', kind: 'Recipe' },
  { label: 'What should I cook for lunch today?', kind: 'Recipe' },
  { label: 'Is skyr allowed on the detox?', kind: 'Ask' },
  { label: 'Plan my meals for tomorrow', kind: 'Plan' },
  { label: 'What can I order at a restaurant?', kind: 'Ask' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Welcome({ settings, onPick, disabled }) {
  const status = settings?.status;
  const dayNote =
    status?.phase === 'detox'
      ? `Day ${status.day} of your detox`
      : status?.phase === 'transition'
        ? 'Transition phase'
        : null;

  return (
    <div className="welcome">
      <div className="welcome-mark rise" style={{ '--d': '0ms' }}>
        <Drop size={36} />
      </div>
      <p className="welcome-kicker rise" style={{ '--d': '60ms' }}>
        {greeting()}
        {dayNote && <span className="welcome-day"> · {dayNote}</span>}
      </p>
      <h1 className="welcome-title rise" style={{ '--d': '120ms' }}>
        What’s on your <em>plate</em> today?
      </h1>
      <p className="welcome-sub rise" style={{ '--d': '180ms' }}>
        Ask if a food is allowed, get a detox-safe recipe, or plan your day.
      </p>
      <div className="suggestions">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.label}
            className="suggestion rise"
            style={{ '--d': `${240 + i * 50}ms` }}
            onClick={() => onPick(s.label)}
            disabled={disabled}
          >
            <span className="suggestion-kind">{s.kind}</span>
            <span className="suggestion-text">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
