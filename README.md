# Alkaline

A private chat coach for Dr. Koufman's Reflux Detox Diet. It runs on Node and React and uses Z.ai GLM-5.3-Flash as the model. It has one password and one user.

- Ask "can I eat X?" and get a ✅ / ⚠️ / ❌ verdict with a swap.
- Get detox-safe recipes and meal plans.
- Paste a recipe link and it reads the page, flags the problem ingredients, and rewrites the recipe to be detox-safe.
- Use multiple chat threads, saved on the server, so they show up on your phone and computer.
- Set your detox start date to track your detox day. The assistant knows which phase you're in.
- Works on mobile, and you can add it to your iPhone home screen.

## How it's put together

```
server/        Express API: login, threads, link reading, streaming chat to Z.ai
knowledge/     Markdown the assistant uses as its source of truth (diet rules, Q&A, recipes)
client/        React frontend (Vite)
data/alkaline.db  Your chats: SQLite database (created automatically)
dist/          Built frontend (npm run build)
```

To change what the assistant knows, edit or add `.md` files in `knowledge/` and restart the app.

## Run it locally

```bash
npm install
npm run build
npm run dev
```

Then open http://localhost:8080.

To work on the UI with hot reload, run `npm run dev` and `npm run dev:client` in two terminals, then open http://localhost:5173.

## Configuration (`.env`)

| Variable | What it does |
|---|---|
| `APP_PASSWORD` | Your login password. **Change it.** The app refuses to start in production with `change-me`. |
| `SESSION_SECRET` | Random string that signs the login cookie. Changing it or the password logs out all devices. |
| `SESSION_DAYS` | How long a login lasts (default 30). |
| `ZAI_API_KEY` | Your Z.ai API key. |
| `ZAI_BASE_URL` | `https://api.z.ai/api/paas/v4` (standard API, which uses the GLM-5.3-Flash trial package). For the Coding Plan, use `https://api.z.ai/api/coding/paas/v4`. |
| `ZAI_MODEL` | `glm-5.3-flash` |
| `ZAI_REASONING_EFFORT` | `low`. Flash on the standard API can't turn thinking off; `low` keeps answers fast. Leave it unset on the Coding Plan. |
| `ZAI_THINKING` | Coding Plan only: `true` makes the model reason first, which is slower. |
| `PORT` / `HOST` | `127.0.0.1:8080`, which your nginx reverse proxy forwards to. |

## Deploy to pmm.is (replacing the old app)

The server already has nginx, certbot and pm2, with nginx proxying `pmm.is` to port **8080**. Alkaline listens on `127.0.0.1:8080` (set in `.env`), so nginx and HTTPS don't need any changes. Answers still stream, because the app sends `X-Accel-Buffering: no`, which tells nginx not to buffer them.

Check that the server has **Node 22.13 or newer** (`node -v`); SQLite support needs it.

**1. Get the code onto the server.** Either clone it from GitHub:

```bash
git clone https://github.com/pmm1/alkaline.git /var/www/alkaline
```

or copy it from your Mac, from the folder that contains `app/`:

```bash
rsync -av --exclude node_modules --exclude dist --exclude data --exclude .git app/ user@pmm.is:/var/www/alkaline/
```

**2. Create `.env` on the server.** It isn't in git, which is deliberate because it holds your password and key. Copy your local `.env` across with `scp`, or create it:

```bash
cd /var/www/alkaline
cp .env.example .env
nano .env
```

It needs a real `APP_PASSWORD`, a `SESSION_SECRET`, your `ZAI_API_KEY`, and these settings:

```
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_MODEL=glm-5.3-flash
ZAI_REASONING_EFFORT=low
HOST=127.0.0.1
PORT=8080
```

**3. Stop the old app.** This frees port 8080.

```bash
pm2 list
pm2 delete <old-app-name>
```

**4. Install, build and start Alkaline**

```bash
cd /var/www/alkaline
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

If you haven't already, run `pm2 startup` once so pm2 comes back after a reboot.

**5. Open https://pmm.is** and log in.

**Updating later**

With git, push from your Mac, then on the server:

```bash
cd /var/www/alkaline
git pull
npm ci
npm run build
pm2 restart alkaline
```

With rsync, add `--exclude .env` to the rsync command so your server `.env` isn't overwritten. Then run `npm ci && npm run build && pm2 restart alkaline` on the server.

**Useful pm2 commands:** `pm2 logs alkaline`, `pm2 restart alkaline`, `pm2 status`.

**Troubleshooting**
- *Login works, but you're immediately logged out again:* the site isn't being served over HTTPS. The cookie is `Secure` in production.
- *502 Bad Gateway:* check `pm2 logs alkaline`. The usual causes are that the old app still holds port 8080, or the reverse proxy runs in Docker or on another machine. In the second case, set `HOST=0.0.0.0` in `.env`.
- *"Z.ai rejected the API key" or a model error in the chat:* check the four `ZAI_` lines in the server's `.env`, then run `pm2 restart alkaline`.
- *A link says "Couldn't read":* some sites (like Allrecipes) block automated readers, and some pages need JavaScript or a login. Paste the ingredients instead.
- *Answers appear all at once instead of streaming:* add `proxy_buffering off;` to the `location /` block in your nginx site config. `deploy/nginx.conf` is a full reference config.

## Data and backups

Chats are stored in SQLite at `data/alkaline.db`, using Node's built-in `node:sqlite`, so there's nothing extra to install. This needs **Node 22.13 or newer**; check with `node -v` on the server.

If an old `data/db.json` exists from the earlier version, it's imported automatically on first start and renamed to `db.json.migrated`.

To back up while the app is running:

```bash
sqlite3 data/alkaline.db ".backup data/backup-$(date +%F).db"
```

Or stop the app (`pm2 stop alkaline`) and copy `data/alkaline.db`.

## Link reading

When a message contains links (up to 3), the server fetches each page before asking the model. For recipe sites it uses the recipe data embedded in the page (ingredients and steps); otherwise it extracts the article text. The page text is saved with your message, so follow-up questions and "regenerate" still know what the page said.

For safety, it only fetches public web addresses on the normal ports. Anything that points at localhost or private network addresses is refused, including redirects to those addresses, so a link can't be used to reach other services on your server.

## Add to your iPhone home screen

Open the site in Safari, tap **Share**, then **Add to Home Screen**. It opens full-screen like an app.
