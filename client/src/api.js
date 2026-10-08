export class AuthError extends Error {}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/login') throw new AuthError('Not signed in');
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => request('/me'),
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  logout: () => request('/logout', { method: 'POST' }),
  threads: () => request('/threads'),
  thread: (id) => request(`/threads/${id}`),
  createThread: () => request('/threads', { method: 'POST' }),
  renameThread: (id, title) => request(`/threads/${id}`, { method: 'PATCH', body: { title } }),
  deleteThread: (id) => request(`/threads/${id}`, { method: 'DELETE' }),
  settings: () => request('/settings'),
  saveSettings: (settings) => request('/settings', { method: 'PUT', body: settings }),
};

/**
 * POSTs to a streaming endpoint and calls onEvent(name, data) for each Server-Sent Event.
 * path is e.g. `/threads/:id/messages` or `/threads/:id/regenerate`.
 */
export async function stream(path, body, { signal, onEvent }) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (res.status === 401) throw new AuthError('Not signed in');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
