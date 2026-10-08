import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from './config.js';

const COOKIE = 'alk_session';
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

// Deriving the signing key from the password means changing APP_PASSWORD logs out every device.
const signingKey = crypto
  .createHmac('sha256', config.sessionSecret)
  .update(config.password)
  .digest();

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', signingKey).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

const failures = new Map();

function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > FAIL_WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > FAIL_WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else entry.count += 1;
}

export function isAuthenticated(req) {
  return Boolean(verify(req.cookies?.[COOKIE]));
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

authRouter.post('/login', (req, res) => {
  const ip = req.ip;
  if (tooManyFailures(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  const password = req.body?.password ?? '';
  if (!crypto.timingSafeEqual(sha(password), sha(config.password))) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  failures.delete(ip);
  const maxAge = config.sessionDays * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE, sign({ exp: Date.now() + maxAge }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge,
    path: '/',
  });
  res.json({ authenticated: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ authenticated: false });
});
