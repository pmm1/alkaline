import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import ChatApp from './components/ChatApp.jsx';
import { Drop } from './components/icons.jsx';

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setAuthenticated(r.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <div className="splash" aria-busy="true">
        <Drop size={40} />
      </div>
    );
  }

  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;

  return <ChatApp onSignedOut={() => setAuthenticated(false)} />;
}
