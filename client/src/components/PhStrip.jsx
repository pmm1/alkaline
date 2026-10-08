// Decorative pH scale: the detox rule is "nothing below pH 5".
export default function PhStrip({ compact = false }) {
  return (
    <div className={`ph-strip${compact ? ' compact' : ''}`} aria-hidden="true">
      <div className="ph-bar">
        <span className="ph-line" style={{ left: `${((5 - 2) / (8 - 2)) * 100}%` }} />
      </div>
      {!compact && (
        <div className="ph-labels">
          <span>pH 2</span>
          <span className="ph-five">5 · the detox line</span>
          <span>8</span>
        </div>
      )}
    </div>
  );
}
