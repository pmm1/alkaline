import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, StopIcon } from './icons.jsx';

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export default function Composer({ onSend, onStop, streaming, autoFocusKey }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!isTouch()) ref.current?.focus();
  }, [autoFocusKey]);

  function submit() {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text);
    setValue('');
  }

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder="Can I eat…?"
          aria-label="Message"
          enterKeyHint="send"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Enter adds a line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {streaming ? (
          <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop answering">
            <StopIcon />
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!value.trim()} aria-label="Send">
            <ArrowUpIcon />
          </button>
        )}
      </form>
      <p className="composer-note">Based on Dr. Koufman's Reflux Detox Diet</p>
    </div>
  );
}
