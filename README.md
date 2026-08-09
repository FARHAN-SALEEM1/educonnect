# EduConnect SaaS

Multi-tenant school management platform. One deployment serves many institutes; each gets its own admins, teachers, parents, students, attendance, fees and notices, fully isolated from every other institute.

**Node.js · Express · PostgreSQL (Prisma) · React · Vite · JWT**

```
educonnect direct app/
├── backend/            Express REST API — 106 endpoints, 19 models  → backend/README.md
├── frontend/           React client — 4 role portals                → frontend/README.md
├── docker-compose.yml  Whole stack in one command
├── DEPLOYMENT.md       Going live, three ways                       → DEPLOYMENT.md
└── docs/               original-artifact.jsx (the prototype this grew from)
```

**Run everything with Docker instead:** see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Run it

Two terminals. **Backend first** — the frontend has nothing to show without it.

```bash
cd backend && npm install && npm run setup && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Then open <http://localhost:5173>.

`npm run setup` generates the Prisma client, creates the tables, and seeds demo data. You only need it once; use `npm run dev` after that.

### Demo logins

| Role | Email | Password | What you'll see |
|---|---|---|---|
| Super Admin | `sa@educonnect.io` | `super123` | Platform KPIs, all institutes, MRR, revenue by plan |
| Institute Admin | `admin@bhs.edu` | `admin123` | Beaconhouse — students, staff, attendance, fees, notices |
| Teacher | `hassan@bhs.edu` | `teach123` | Mathematics classes, grade book, marks entry |
| Parent | `sara@gmail.com` | `parent123` | Zain Ahmed — grades, attendance, fees, AI insights |

The login screen quick-fills any of these.

> Demo credentials for local development. Change them before deploying anywhere public.

---

## Ports

| Service | Port | Note |
|---|---|---|
| Frontend (Vite) | 5173 | Proxies `/api` → 5001 |
| Backend API | 5001 | **Not 5000** — an older EduConnect backend at `Desktop\educonnect` occupies that port on this machine |
| PostgreSQL | 5432 | Database `educonnect_v2` (the older project owns `educonnect`) |

Moving the API means editing both `backend/.env` (`PORT`) and `frontend/vite.config.js` (proxy target).

---

## Design decisions worth defending

**Tenant isolation lives in middleware, not in each query.** `scopeToInstitute` resolves which institute a request may touch and pins non-superadmins to their own; passing someone else's `instituteId` returns 403 rather than being silently ignored. On top of that, `studentScopeWhere` narrows rows by role — teachers see students in their subjects, parents only their children. Records you can't see return **404, not 403**, so IDs can't be probed for existence.

**Derived values are computed, never stored.** GPA, letter grades, class rank, attendance rate and predictions all come from source rows via `backend/src/utils/academics.js`. There is no `gpa` column that can drift away from the marks behind it.

**Scores trace back to real marks.** Recording an assessment recalculates the student's subject score, so what a parent sees is always derived from marks a teacher actually entered.

**The AI insights are a deterministic rule engine**, not a model call — `backend/src/services/insight.service.js`. Seven rules over real marks and attendance, each with a severity. The same data always produces the same advice, which makes it explainable and testable. The parent portal's "AI Score" is derived from it: 100 minus 10 per action-level finding and 5 per watch-level one. Swapping in a real model later means replacing one function — every caller goes through `generateInsightsForStudent`.

**The frontend keeps its original presentation code.** An adapter layer (`frontend/src/adapters/legacy.js`) maps API responses into the shapes the portal components were written against, so adding a backend changed where data comes from, not how screens are drawn. See [frontend/README.md](frontend/README.md#the-adapter-layer-and-why-it-exists) for the trade-off.

**Calendar dates belong to the school, not the server.** Attendance is stored against the institute's own timezone. A UTC-hosted API serving a UTC+5 school would otherwise file early-morning marks to the previous day and silently overwrite it, because attendance is unique on `(studentId, date)`.

---

## Tests

```bash
cd backend && npm test
```

52 tests. `tests/tenancy.test.js` is the one to read in a viva — it proves the isolation claims above rather than asserting them: cross-institute access is refused, teachers see only their own students, parents only their own children, out-of-scope records return 404 rather than 403, and login reveals nothing about which emails exist.

CI runs the suite against a real Postgres on every push — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## Documentation

- **[backend/README.md](backend/README.md)** — setup, environment variables, data model, security model, timezones, full endpoint reference, troubleshooting
- **[frontend/README.md](frontend/README.md)** — architecture, the adapter layer, per-role loading, session handling
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Docker Compose, managed platforms, VPS, email setup, go-live checklist, and handling real student data

