import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter, requireAuth } from './auth.js';
import { apiRouter } from './routes.js';
import { close as closeStore } from './store.js';

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

app.use('/api', authRouter);
app.use('/api', requireAuth, apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, { index: false, maxAge: '7d' }));
  app.get('/{*splat}', (req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(path.join(config.distDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('Frontend not built yet. Run "npm run build", or use "npm run dev:client" during development.'));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Alkaline running on http://${config.host}:${config.port} (model ${config.zai.model})`);
});

function shutdown() {
  server.close();
  closeStore();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
