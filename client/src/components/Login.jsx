import { useState } from 'react';
import { api } from '../api.js';
import { Drop } from './icons.jsx';
import PhStrip from './PhStrip.jsx';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err.message);
      setShake((n) => n + 1);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-glow" aria-hidden="true" />
      <form className="login-card" onSubmit={submit} key={shake} data-shake={shake > 0}>
        <div className="login-mark">
          <Drop size={44} />
        </div>
        <h1 className="wordmark">
          Alkaline<span className="wordmark-dot">.</span>
        </h1>
        <p className="login-tagline">
          Your reflux detox coach, <em>one plate at a time.</em>
        </p>

        <PhStrip />

        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(error)}
          />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" type="submit" disabled={!password || busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
