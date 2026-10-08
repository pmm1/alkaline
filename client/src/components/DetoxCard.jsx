import { useState } from 'react';

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function Ring({ progress }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r={r} className="ring-track" />
      <circle
        cx="26"
        cy="26"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
}

export default function DetoxCard({ settings, onSave }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');

  if (!settings) return <div className="detox-card skeleton" />;

  const status = settings.status;

  if (editing || !settings.detoxStart) {
    return (
      <form
        className="detox-card form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(date || todayIso());
          setEditing(false);
        }}
      >
        <span className="detox-kicker">Detox start date</span>
        <div className="detox-form-row">
          <input
            type="date"
            value={date || settings.detoxStart || todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="submit" className="btn-small">Save</button>
        </div>
        {settings.detoxStart && (
          <div className="detox-form-links">
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onSave(null);
                setEditing(false);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </form>
    );
  }

  let headline;
  let sub;
  let progress = 0;
  if (status.phase === 'not started') {
    headline = `Starts in ${1 - status.day}d`;
    sub = 'Detox coming up';
  } else if (status.phase === 'detox') {
    headline = `Day ${status.day}`;
    sub = `of ${status.detoxDays} · strict detox`;
    progress = status.day / status.detoxDays;
  } else {
    headline = `Day ${status.day}`;
    sub = 'Transition · test one food at a time';
    progress = 1;
  }

  return (
    <button
      className="detox-card"
      onClick={() => {
        setDate(settings.detoxStart);
        setEditing(true);
      }}
      title="Change start date"
    >
      <Ring progress={progress} />
      <span className="detox-text">
        <span className="detox-headline">{headline}</span>
        <span className="detox-sub">{sub}</span>
      </span>
    </button>
  );
}
