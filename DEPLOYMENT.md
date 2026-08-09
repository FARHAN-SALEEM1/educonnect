# Deploying EduConnect

Three routes, easiest first. All of them need the same four things: a Postgres database, the API, the static frontend, and a set of real secrets.

---

## Before anything else — generate secrets

Run this twice and keep the two values apart:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

One becomes `JWT_ACCESS_SECRET`, the other `JWT_REFRESH_SECRET`. They must differ.

The API **refuses to start** with `NODE_ENV=production` if either secret is missing, shorter than 32 characters, still the `change_me…` placeholder, if both are identical, or if `DEFAULT_USER_PASSWORD` is still `educonnect123`. That check exists because those defaults are exactly what survives a rushed deploy.

---

## Option 1 — Docker Compose (one machine, one command)

Best for a demo, a college server, or a single school on one VPS.

```bash
cp backend/.env.example .env
```

Edit `.env` at the repo root so it has at least:

```
DB_PASSWORD=<a long random string>
JWT_ACCESS_SECRET=<48-byte hex>
JWT_REFRESH_SECRET=<a different 48-byte hex>
DEFAULT_USER_PASSWORD=<something other than the default>
```

Then:

```bash
docker compose up --build
```

```bash
docker compose exec api npm run db:seed
```

- App → <http://localhost:8080>
- API → <http://localhost:5001>

Migrations run automatically on start. Postgres is published on host port **5433** so it doesn't collide with a local install.

> Only seed a database you're happy to erase — `db:seed` clears the tables it owns.

---

## Option 2 — Managed platforms (free tier, no server to run)

The usual choice for an FYP: a public URL, nothing to maintain.

### 1. Database — [Neon](https://neon.tech)

Create a project, copy the connection string. It looks like:

```
postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require
```

### 2. API — [Render](https://render.com)

New → Web Service → point at your repo.

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm ci && npx prisma generate && npx prisma migrate deploy` |
| Start command | `npm start` |
| Health check path | `/health` |

Environment variables:

```
NODE_ENV=production
DATABASE_URL=<your Neon string>
JWT_ACCESS_SECRET=<48-byte hex>
JWT_REFRESH_SECRET=<a different one>
DEFAULT_USER_PASSWORD=<your own>
CORS_ORIGIN=https://<your-vercel-domain>
APP_URL=https://<your-vercel-domain>
COOKIE_CROSS_SITE=true
```

`COOKIE_CROSS_SITE=true` matters here: the refresh token is an httpOnly cookie, and with the API on Render and the frontend on Vercel those are different sites. It switches the cookie to `SameSite=None; Secure`, which browsers only accept over HTTPS. Leave it `false` for Docker Compose or any same-origin setup, or logins will appear to succeed and then immediately drop.

`/health` returns **503** when the database is unreachable, so Render will stop routing traffic to a broken instance rather than serving errors.

### 3. Frontend — [Vercel](https://vercel.com)

Import the repo.

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Vite |

Environment variable:

```
VITE_API_URL=https://<your-render-domain>/api
```

Vite inlines this **at build time** — changing it later needs a redeploy, not just a restart.

### 4. Seed once

From your machine, pointing at the production database:

```bash
cd backend && DATABASE_URL="<your Neon string>" npm run db:seed
```

Then **immediately change every demo password**, or delete the demo accounts and create your own. The seeded logins are published in this repo's README.

---

## Option 3 — Your own VPS

Build the two images from `backend/Dockerfile` and `frontend/Dockerfile`, run them behind nginx or Caddy with TLS, and point `DATABASE_URL` at a managed Postgres or one you run yourself. `app.set("trust proxy", 1)` is already set, so client IPs and rate limiting work correctly behind a reverse proxy.

---

## Email

Without SMTP the app still works — password-reset links and welcome emails are printed to the server console instead of being sent. That's fine for a demo. For real users, set:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<your API key>
SMTP_FROM="Your School <no-reply@yourschool.edu>"
APP_URL=https://<your frontend domain>
```

Gmail works too (`smtp.gmail.com:587`) but needs an **App Password**, not your account password.

`APP_URL` is what reset links point at. Get it wrong and every reset email sends users to the wrong place.

---

## Go-live checklist

**Security**

- [ ] Fresh 48-byte secrets, different from each other
- [ ] Every demo account deleted or repasworded
- [ ] `CORS_ORIGIN` set to your real domain — not `*`
- [ ] HTTPS everywhere; `APP_URL` uses `https://`
- [ ] `NODE_ENV=production` (this also hides stack traces from error responses)

**Data**

- [ ] Automated database backups on (Neon and Render both do daily; verify the retention)
- [ ] A restore actually tested at least once — an untested backup isn't a backup
- [ ] Each institute's `timezone` set correctly; attendance dates depend on it

**Operational**

- [ ] Health check wired to `/health`
- [ ] Server logs going somewhere you'll actually look
- [ ] `npm test` green in CI before deploys

---

## Handling real student data

This is worth thinking about before a real school uses it, not after.

- **Minimise.** The schema already avoids storing what it doesn't need. Don't add fields you have no use for.
- **Access is already narrow.** Teachers see only students they teach, parents only their own children, and the API enforces this — the client never filters for security. `backend/tests/tenancy.test.js` proves it.
- **Audit.** Every mutation writes to `audit_logs` with the user, institute, action and IP.
- **Deletion is recoverable.** Institutes, students, teachers and parents are soft-deleted: they disappear from the app but the rows survive, restorable from the recycle bin. Only `DELETE /api/institutes/:id/purge` is permanent, and it refuses to run unless the institute has already been deleted — two deliberate steps.
- **Legal.** Student records are personal data about minors. Check what your jurisdiction requires for consent, retention and breach notification. That's a policy question this codebase can't answer for you.

---

## Troubleshooting

**`Refusing to start in production with insecure settings`**
Working as intended — read the listed items and fix them.

**`Cannot reach the database`**
Check `DATABASE_URL` and, on a managed host, that `?sslmode=require` is present.

**Frontend loads but every API call fails with CORS**
`CORS_ORIGIN` must exactly match your frontend origin, scheme included, no trailing slash.

**Login works, then everything 401s a few minutes later**
`JWT_ACCESS_SECRET` differs between instances, or the API restarted with a different value. Set it explicitly rather than letting a platform regenerate it.

**Login succeeds but the session vanishes on reload**
The refresh cookie isn't reaching the API. On split domains set `COOKIE_CROSS_SITE=true` and serve both sides over HTTPS; check `CORS_ORIGIN` matches the frontend origin exactly.

**Prisma complains about a column that clearly exists**
The generated client is stale. Run `npx prisma generate` and restart — file watchers don't see changes inside `node_modules`.

**Attendance saving to the wrong day**
The institute's `timezone` is wrong. Set it to a real IANA zone such as `Asia/Karachi`.
