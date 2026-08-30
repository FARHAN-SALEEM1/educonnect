# EduConnect SaaS — Backend API

REST API for **EduConnect**, a multi-tenant school management platform. One deployment serves many institutes; each institute gets its own admins, teachers, parents, students, attendance, fees and notices, fully isolated from every other institute.

Built with **Node.js + Express + PostgreSQL (Prisma)**, JWT authentication and role-based access control.

---

## Contents

1. [Architecture](#architecture)
2. [Quick start](#quick-start)
3. [Demo logins](#demo-logins)
4. [Environment variables](#environment-variables)
5. [Data model](#data-model)
6. [Security model](#security-model)
7. [API reference](#api-reference)
8. [The AI insight engine](#the-ai-insight-engine)
9. [Project structure](#project-structure)
10. [Troubleshooting](#troubleshooting)

---

## Architecture

```
Client (React)
     │  JWT access token in Authorization header
     ▼
┌─────────────────────────────────────────────┐
│  Express app                                │
│  helmet · cors · rate-limit · morgan        │
├─────────────────────────────────────────────┤
│  Routes      → thin, declare access rules   │
│  Middleware  → authenticate · authorize     │
│                scopeToInstitute · validate  │
│  Controllers → request handling             │
│  Services    → grading · AI insights        │
│  Utils       → academics · jwt · access     │
├─────────────────────────────────────────────┤
│  Prisma ORM                                 │
└─────────────────────────────────────────────┘
     ▼
  PostgreSQL
```

Three ideas hold the design together:

**Tenant isolation.** Every operational row carries an `instituteId`. The `scopeToInstitute` middleware resolves which institute a request may touch and pins non-superadmin users to their own. An admin who passes someone else's `instituteId` gets a `403`, not silently ignored input.

**Derived, not duplicated.** GPA, letter grades, class rank, attendance rate and predictions are computed from source rows in `src/utils/academics.js`. There is no `gpa` column that can drift out of sync with the marks it came from.

**Assessment-driven scores.** Recording a mark recalculates the student's subject score (`src/services/grading.service.js`), so what a parent sees always traces back to real marks.

---

## Quick start

### Prerequisites

- Node.js 18 or newer
- PostgreSQL 14+ — locally, or a free cloud database ([Neon](https://neon.tech), [Supabase](https://supabase.com), [Railway](https://railway.app))

### 1. Install

```bash
npm install
```

### 2. Create the database

`prisma migrate dev` (step 4) creates the database for you if it doesn't exist, so you can usually skip ahead. To do it by hand:

```bash
psql -U postgres -c "CREATE DATABASE educonnect_v2;"
```

Or copy a connection string from Neon/Supabase — no local install needed.

> **Heads up on this machine.** An older EduConnect backend lives at `Desktop\educonnect` and owns the database named `educonnect` plus port **5000**. This project deliberately uses `educonnect_v2` and port **5001** so the two don't collide. Pointing this backend at `educonnect` would make Prisma reset that database and destroy the older project's data.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL`, then generate real JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that twice and paste the results into `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

### 4. Create tables and load demo data

```bash
npm run setup
```

That runs `prisma generate` → `prisma migrate dev` → `prisma db seed`. To run them separately:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 5. Start

```bash
npm run dev
```

The API comes up on `http://localhost:5001`. Check it:

```bash
curl http://localhost:5001/health
```

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload (nodemon) |
| `npm start` | Start for production |
| `npm run db:studio` | Open Prisma Studio — a GUI for your data |
| `npm run db:seed` | Reload demo data (wipes and re-seeds) |
| `npm run db:reset` | Drop everything, re-migrate, re-seed |
| `npm run db:push` | Push schema changes without a migration file |

---

## Demo logins

After seeding, all of these work. Institute data lives under **Beaconhouse School**.

| Role | Email | Password |
|---|---|---|
| Super Admin | `sa@educonnect.io` | `super123` |
| Admin — Beaconhouse | `admin@bhs.edu` | `admin123` |
| Admin — LACAS | `admin@lacas.edu` | `admin123` |
| Admin — The City School | `admin@citys.edu` | `admin123` |
| Teacher — Mathematics | `hassan@bhs.edu` | `teach123` |
| Teacher — Physics | `nadia@bhs.edu` | `teach123` |
| Parent — Sara Ahmed | `sara@gmail.com` | `parent123` |
| Parent — Ali Khan | `ali@gmail.com` | `parent123` |

```bash
curl -X POST http://localhost:5001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@bhs.edu\",\"password\":\"admin123\"}"
```

The response carries `accessToken`; send it as `Authorization: Bearer <token>` on every protected call.

> These are demo credentials for local development. Change them before deploying anywhere public.

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | — | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET` | yes | — | Signs refresh tokens; must differ from the above |
| `PORT` | no | `5001` | |
| `NODE_ENV` | no | `development` | `production` hides stack traces |
| `JWT_ACCESS_EXPIRES` | no | `15m` | |
| `JWT_REFRESH_EXPIRES` | no | `7d` | |
| `BCRYPT_ROUNDS` | no | `10` | |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated list |
| `RATE_LIMIT_MAX` | no | `500` | Requests per window per IP |
| `AUTH_RATE_LIMIT_MAX` | no | `20` | Tighter budget for login/signup |
| `SMTP_HOST` | no | — | Blank means emails print to the console instead of sending |
| `SMTP_PORT` | no | `587` | |
| `SMTP_USER` / `SMTP_PASS` | no | — | Omit for an unauthenticated relay |
| `SMTP_FROM` | no | `EduConnect <no-reply@educonnect.io>` | |
| `APP_URL` | no | `http://localhost:5173` | Where password-reset links point |
| `PASSWORD_RESET_EXPIRY_MINUTES` | no | `30` | |

The server refuses to start if a required variable is missing, and tells you which.

**In production it also refuses to start** if a JWT secret is still a `change_me…` placeholder, is shorter than 32 characters, or if both secrets are identical. Those are precisely the settings that survive a rushed deploy unnoticed.

---

## Testing

```bash
npm test
```

52 tests across three files. The integration suite is read-only and runs against the seeded database, so it's safe against a dev environment — run `npm run db:seed` first if it skips.

| File | Covers |
|---|---|
| `tests/academics.test.js` | Grade boundaries, GPA, prediction damping, attendance rates, class rank — every number on a report card |
| `tests/dates.test.js` | Timezone-correct calendar dates; regression cover for the attendance bug below |
| `tests/tenancy.test.js` | Tenant isolation, per-role row visibility, permission boundaries, account-enumeration resistance |

`tests/tenancy.test.js` is the one worth reading. It proves an admin can't reach another institute's data, a teacher sees only students they teach, a parent only their own children, that out-of-scope records return **404 rather than 403** so IDs can't be probed, and that login and forgot-password give byte-identical responses for known and unknown emails.

---

## Deletion and recovery

`Institute`, `Student`, `Teacher` and `Parent` are **soft-deleted**: `DELETE` sets `deletedAt` rather than removing the row. Deleting any of them cascades through a school's real records, so a mis-click has to be recoverable.

A Prisma client extension in `src/config/prisma.js` adds `deletedAt: null` to every read of those models — including rewriting `findUnique` as `findFirst`, since `findUnique` can't carry a non-unique filter. Deleted rows therefore disappear from listings, dashboards and seat counts without a single call site changing.

**Writes are deliberately not rewritten.** Soft-deleting is explicit in the controllers (`update({ deletedAt })`) so the intent is visible at the call site — and because extensions don't reliably apply inside interactive transactions, which is exactly where the delete paths live.

| Route | Effect |
|---|---|
| `DELETE /students/:id` etc. | Hide; users linked to it are deactivated, not deleted |
| `GET /students/deleted` | The recycle bin |
| `POST /students/:id/restore` | Bring it back |
| `DELETE /institutes/:id/purge` | Permanent — **only** works on an already-deleted institute |

Two consequences worth knowing: `prismaRaw` is the unextended client, used only by the bin/restore/purge paths; and a deleted student still holds its roll number, so restoring one whose number was reassigned returns a 409 naming the clash.

Nested relation reads (`include: { students: … }`, `_count`) bypass the extension — those are filtered explicitly where they occur.

---

## Timezones

Attendance and fee periods are **calendar dates**, not instants — "present on 9 August" means the same thing wherever the server runs. Each institute carries an IANA `timezone` (default `Asia/Karachi`), and `src/utils/dates.js` resolves the calendar day against it, storing UTC midnight of that date.

This matters more than it sounds. Deploy to a UTC host while the school is at UTC+5 and a naive `new Date()` files anything marked between midnight and 5am to the *previous* day — and since `Attendance` is unique on `(studentId, date)`, that silently overwrites the day before. `tests/dates.test.js` pins the behaviour.

Set an institute's timezone via `PATCH /institutes/:id`; invalid zones are rejected at the edge.

---

## Data model

19 models. The relationships that matter:

```
Plan ──< Institute ──< User (SUPERADMIN | ADMIN | TEACHER | PARENT)
              │
              ├──< Teacher ──< Subject ──< Enrollment >── Student
              │                                │
              │                          Assessment
              ├──< Parent ──< Student
              │
              ├──< Attendance   (one row per student per day)
              ├──< FeeInvoice   (one row per student per month)
              ├──< TimetableSlot
              ├──< Notice
              ├──< Message
              └──< SubscriptionInvoice  (platform billing)

User ──< RefreshToken        (hashed, rotating; swept every 6 hours)
     └──< PasswordResetToken (hashed, single-use, 30-minute expiry)

PlatformSetting  (standalone key/value — platform name, support email,
                  currency, trial length; no migration needed to add one)
```

**`Enrollment` is the join that carries performance.** A student takes a subject; that row holds `currentScore`, `previousScore`, `letterGrade`, `predictedScore`, and owns the `Assessment` rows the scores are computed from.

Key constraints:

- `Attendance` is unique on `(studentId, date)` — a student cannot be marked twice in one day; re-submitting a register updates rather than duplicates.
- `FeeInvoice` is unique on `(studentId, period)` — re-running the monthly billing skips students already invoiced.
- `Enrollment` is unique on `(studentId, subjectId)`.
- `Student` is unique on `(instituteId, rollNo)` — roll numbers are unique within a school, not globally.

Deleting an institute cascades through every record it owns.

---

## Security model

| Layer | Mechanism |
|---|---|
| Token storage | The refresh token lives in an **httpOnly, SameSite cookie scoped to `/api/auth`** — unreadable by JavaScript, so an XSS bug can't lift a long-lived session. The cookie is the only channel: the token is never returned in a response body and never read from a request body. The access token is returned in the body and held in memory by the client, never in `localStorage`. |
| Passwords | bcrypt, cost 10. Minimum 8 characters, enforced on **both** the self-service and admin-reset paths. |
| Password delivery | New and reset passwords are emailed, never returned in a response body — so they stay out of browser memory and proxy logs. Without SMTP the API returns them once and says so, because otherwise a school with no mail server can't recover an account. |
| Reset links | Single-use, hashed at rest, 30-minute expiry, and requesting a new one invalidates the old. |
| Enumeration | Login and forgot-password return identical responses for known and unknown emails. |
| Sessions | Short-lived JWT access token + rotating refresh token. Refresh tokens are stored **hashed** — a leaked database cannot be replayed. |
| Rotation | Using a refresh token revokes it and issues a new pair. Changing a password revokes every session. |
| Live checks | `authenticate` re-reads the user each request, so deactivating an account or suspending an institute takes effect immediately, not at token expiry. |
| Roles | `authorize("ADMIN", "TEACHER")` on the route. |
| Tenancy | `scopeToInstitute` pins non-superadmins to their institute. |
| Row visibility | `studentScopeWhere` narrows further: teachers see students in their subjects, parents see only their own children. |
| Input | Zod schemas parse, coerce and strip every body and query. |
| Transport | helmet headers, CORS allowlist, rate limiting (tighter on auth). |
| Audit | Mutations write to `audit_logs` with user, institute, action and IP. |

Requests for a record you cannot see return `404`, not `403` — so ids can't be probed for existence.

---

## API reference

Base URL `http://localhost:5001/api`. All responses share one envelope:

```jsonc
// success
{ "success": true, "message": "...", "data": { }, "meta": { } }

// error
{ "success": false, "message": "...", "errors": [{ "field": "email", "message": "..." }] }
```

Roles are abbreviated: **SA** super admin · **A** admin · **T** teacher · **P** parent.

### Auth — `/api/auth`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/login` | public | Returns user + access/refresh tokens |
| POST | `/signup` | public | Registers an institute and its first admin |
| POST | `/refresh` | public | Rotates tokens |
| POST | `/logout` | any | Revokes the given token, or all sessions |
| POST | `/forgot-password` | public | Emails a single-use reset link. Always 200 — never reveals whether an account exists |
| POST | `/reset-password` | public | Consumes the link, sets the password, revokes every session |
| GET | `/me` | any | Current user with institute and plan |
| PATCH | `/me` | any | Update own name / phone / avatar |
| POST | `/change-password` | any | Revokes all other sessions |

### Plans & institutes

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/plans` | public | Pricing tiers for the landing page |
| PATCH | `/plans/:id` | SA | Edit price, seat cap, features. Refuses a cap below a subscriber's current usage |
| GET | `/platform/settings` | SA | Platform name, support email, currency, trial length. Self-seeds defaults |
| PATCH | `/platform/settings` | SA | `{ key: value }`; validates per-key type and rejects unknown keys |
| GET | `/subscription-invoices` | SA | Platform billing, with per-status totals in `meta` |
| POST | `/subscription-invoices/generate` | SA | Issue the period's invoice for every active institute |
| POST | `/subscription-invoices/:id/pay` | SA | Record a subscription payment |
| GET | `/institutes` | SA | Paginated, filter by `status`, `planId`, `city`, `search` |
| POST | `/institutes` | SA | Create directly |
| GET | `/institutes/:id` | SA, A | Own institute only, for admins |
| PATCH | `/institutes/:id` | SA, A | Admins cannot change plan or status |
| PATCH | `/institutes/:id/plan` | SA | Rejects downgrades that break the seat cap |
| PATCH | `/institutes/:id/status` | SA | Activate / suspend / cancel |
| DELETE | `/institutes/:id` | SA | Cascades to all owned data |

### Students — `/api/students`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | all | Scoped per role. Filters: `search`, `grade`, `section`, `status`, `parentId` |
| GET | `/:id` | all | **Full profile** — subjects, marks, attendance, fees, timetable, insights |
| GET | `/:id/report` | all | Printable academic report |
| POST | `/` | SA, A | Enforces the plan's seat limit |
| POST | `/import` | SA, A | Bulk CSV import — see below |
| PATCH | `/:id` | SA, A | |
| DELETE | `/:id` | SA, A | |
| POST | `/:id/insights` | all | Regenerate AI recommendations |

`GET /students/:id` is the endpoint the parent portal is built on — one call returns everything its tabs need.

#### Bulk import

Schools arrive with a spreadsheet, so `POST /students/import` takes parsed rows:

```jsonc
{
  "rows": [
    { "name": "Zain Ahmed", "grade": "Grade 8", "section": "A", "rollNo": "2024-081",
      "guardianEmail": "sara@gmail.com", "guardianName": "Sara Ahmed", "guardianRelation": "Mother" }
  ],
  "partial": false,       // default: one bad row rejects the whole file
  "createParents": true   // guardians are created or reused by email
}
```

**All-or-nothing by default.** Every row is validated first — missing fields, duplicate roll numbers (against the database *and* within the file), malformed emails and dates — and the whole batch is rejected with a per-row report keyed to the spreadsheet line number. An admin never ends up with half a year group imported. Send `partial: true` to import the valid rows anyway.

Siblings sharing a `guardianEmail` are linked to **one** parent record rather than creating duplicates, and the plan's seat limit is checked against the batch size before anything is written.

### Teachers & parents

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/teachers` | all | With class list and student counts |
| GET | `/teachers/:id` | all | Includes subjects and schedule |
| GET | `/teachers/me/classes` | T | Own classes per subject: roster, average, attendance rate, assessment count |
| POST | `/teachers` | SA, A | Optionally creates the login too |
| PATCH · DELETE | `/teachers/:id` | SA, A | |
| GET | `/parents` | SA, A, T | |
| GET | `/parents/:id` | SA, A, T | With children and dues |
| GET | `/parents/me/children` | P | Own children with headline stats |
| POST | `/parents` | SA, A | Optionally creates the login and links students |
| PATCH · DELETE | `/parents/:id` | SA, A | |

### Subjects & enrollment — `/api/subjects`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | all | Teachers see only their own |
| GET | `/:id` | all | With enrolled students and marks |
| POST · PATCH · DELETE | `/` `/:id` | SA, A | |
| POST | `/enroll` | SA, A | Enroll one student in one subject |
| POST | `/enroll/bulk` | SA, A | Cross-enroll many students × many subjects |
| PATCH | `/enrollments/:id` | SA, A, T | Manual score override |
| DELETE | `/enrollments/:id` | SA, A | |

### Assessments — `/api/assessments`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | all | Filters: `studentId`, `subjectId`, `type`, `from`, `to` |
| GET | `/gradebook?subjectId=` | SA, A, T | Grade-book grid: rows = students, columns = assessments |
| POST | `/` | SA, A, T | Recalculates the student's subject score |
| POST | `/bulk` | SA, A, T | One assessment for a whole class |
| PATCH · DELETE | `/:id` | SA, A, T | Both trigger recalculation |

```jsonc
// POST /api/assessments/bulk
{
  "subjectId": "clx…",
  "title": "Quiz 4",
  "type": "QUIZ",
  "total": 20,
  "results": [
    { "studentId": "clx…", "obtained": 18 },
    { "studentId": "clx…", "obtained": 15, "remarks": "Careless errors" }
  ]
}
```

Students not enrolled in the subject are reported back under `skipped` rather than failing the whole request.

### Attendance — `/api/attendance`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/register?grade=&section=&date=` | SA, A, T | Marking sheet, pre-filled if already taken |
| GET | `/` | all | Filters: `studentId`, `grade`, `section`, `date`, `from`, `to`, `status` |
| GET | `/summary` | all | Counts, rate and daily trend |
| POST | `/` | SA, A, T | Mark one student |
| POST | `/bulk` | SA, A, T | Submit a whole class register |
| PATCH · DELETE | `/:id` | SA, A(, T) | |

Statuses: `PRESENT`, `ABSENT`, `LATE`, `LEAVE`. Re-submitting the same date overwrites, so corrections don't need a delete first. `LATE` still counts toward the attendance rate.

### Fees — `/api/fees`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | all | Parents see only their children's. Returns per-status totals in `meta` |
| GET | `/stats` | SA, A | Collected / pending / overdue, collection rate, monthly trend |
| GET | `/:id` | all | Single invoice with institute header |
| POST | `/` | SA, A | Issue one invoice |
| POST | `/generate` | SA, A | Month's invoices for every active student |
| POST | `/:id/pay` | SA, A | Record a payment |
| POST | `/mark-overdue` | SA, A | Flip past-due invoices, apply a late fee |
| PATCH · DELETE | `/:id` | SA, A | |

```jsonc
// POST /api/fees/generate
{ "period": "2026-03", "amount": 12500, "dueDay": 10 }
```

Omit `amount` to use the institute's `defaultMonthlyFee`.

### Timetable, messages, notices

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/timetable?grade=&section=` | all | Flat slots **and** a day-grouped view. Teachers default to their own schedule |
| POST | `/timetable` | SA, A | Rejects double-booking a teacher |
| PATCH · DELETE | `/timetable/:id` | SA, A | |
| GET | `/messages?box=inbox\|sent\|all` | any | Unread count in `meta` |
| GET | `/messages/contacts` | any | Who you're allowed to write to |
| GET | `/messages/:id` | any | Opening marks it read; includes the thread |
| POST | `/messages` | any | Cannot cross institutes |
| POST | `/messages/:id/reply` | any | Threads under the original |
| PATCH | `/messages/:id/read` · `/read-all` | any | |
| DELETE | `/messages/:id` | sender | |
| GET | `/notices` | all | Teachers/parents see only notices addressed to them |
| POST | `/notices` | SA, A, T | `audience: []` means everyone |
| POST | `/notices/broadcast` | SA | One notice into every active institute (or `instituteIds`); each gets its own row |
| PATCH | `/notices/:id` | SA, A, T | |
| DELETE | `/notices/:id` | SA, A | |

### Dashboards & reports

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | `/dashboard/superadmin` | SA | Platform KPIs, MRR/ARR, 12-month revenue, plan mix, recent signups |
| GET | `/dashboard/admin` | SA, A | Headcount, today's attendance, fee collection, grade breakdown, top performers, students needing attention, 30-day trend |
| GET | `/dashboard/teacher` | T | Subjects, classes, today's schedule, marking status, recent marks, unread messages |
| GET | `/dashboard/parent` | P | Every child with grades, attendance, dues and insights |
| GET | `/reports/institute?from=&to=` | SA, A | Full roster with averages and attendance, subject performance |
| GET | `/audit-logs` | SA, A | Activity feed |

### Users — `/api/users`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` `/:id` | SA, A | Admins see only their institute |
| POST | `/` | SA, A | Only a super admin can create a super admin |
| PATCH | `/:id` | SA, A | Cannot deactivate yourself |
| POST | `/:id/reset-password` | SA, A | Revokes that user's sessions |
| DELETE | `/:id` | SA, A | Cannot delete yourself |

### Status codes

`200` ok · `201` created · `400` bad request · `401` missing/invalid token · `403` wrong role or wrong tenant · `404` not found or not visible to you · `409` duplicate · `422` validation failed (with a per-field `errors` array) · `429` rate limited · `500` server error

---

## The AI insight engine

`src/services/insight.service.js` reads a student's real marks and attendance and emits plain-language recommendations. It is **rule-based and deterministic** — the same data always yields the same advice, which makes it explainable in a viva and testable, unlike an opaque model call.

| Rule | Trigger | Severity |
|---|---|---|
| Declining subject | Score fell ≥ 5 points since last term | 3 — action |
| Weak subject | Score below 60% | 3 — action |
| Consecutive poor marks | Last 3 assessments all under 60% | 2 — watch |
| Standout subject | Score ≥ 90% | 1 — info |
| Improving subject | Score rose ≥ 5 points | 1 — info |
| Attendance risk | Rate below 85% over ≥ 5 days | 2, or 3 below 75% |
| Prediction | Every scored subject | 1 — info |

Predictions damp the term-over-term trend to 60% and clamp to 0–100, so one strong term doesn't extrapolate to an impossible score.

Regenerate with `POST /api/students/:id/insights`. Each run replaces the previous set, so insights never go stale.

Swapping in a real model later means replacing one function — every caller goes through `generateInsightsForStudent`.

---

## Project structure

```
backend/
├── prisma/
│   ├── schema.prisma          17 models, 9 enums
│   └── seed.js                demo data matching the frontend
└── src/
    ├── server.js              boot + graceful shutdown
    ├── app.js                 express setup, middleware chain
    ├── config/                env validation, prisma client
    ├── middleware/
    │   ├── auth.js            authenticate · authorize · scopeToInstitute
    │   ├── validate.js        Zod request parsing
    │   ├── errorHandler.js    Prisma error translation
    │   └── rateLimit.js
    ├── utils/
    │   ├── academics.js       grades, GPA, rank, attendance, prediction
    │   ├── access.js          row-level visibility per role
    │   ├── jwt.js · password.js · codes.js · audit.js
    │   └── ApiError.js · asyncHandler.js · response.js
    ├── validators/            Zod schemas
    ├── services/
    │   ├── grading.service.js score recalculation, term rollover
    │   └── insight.service.js the AI rule engine
    ├── controllers/           15 controllers
    └── routes/                15 route modules
```

---

## Troubleshooting

**`Cannot reach the database. Is PostgreSQL running?`**
Check the service is up and `DATABASE_URL` is right. Test directly: `psql "<your DATABASE_URL>"`.

**`Missing required environment variables`**
You have not created `.env`. Copy `.env.example` and fill it in.

**`@prisma/client did not initialize yet`**
Run `npm run db:generate`. Needed after any schema change.

**Login returns 401 with the demo credentials**
The seed has not run, or ran against a different database. Run `npm run db:seed`.

**Login returns 403 "pending"**
Institutes created through `/api/auth/signup` start as `PENDING` by design. Activate with `PATCH /api/institutes/:id/status` as the super admin.

**CORS error in the browser**
Add your frontend's origin to `CORS_ORIGIN` in `.env` and restart.

**Migration conflicts in development**
`npm run db:reset` drops, re-migrates and re-seeds. It destroys all data — development only.

---

## Deployment notes

1. Set `NODE_ENV=production` — this hides stack traces from error responses.
2. Use fresh 48-byte random JWT secrets, never the ones in `.env.example`.
3. Change every demo password.
4. Set `CORS_ORIGIN` to your real frontend domain.
5. Run `npx prisma migrate deploy` (not `migrate dev`) on the server.
6. Do **not** run the seed against production — it wipes the tables it owns.
7. Put the API behind HTTPS; `trust proxy` is already enabled for platforms like Railway and Render.


