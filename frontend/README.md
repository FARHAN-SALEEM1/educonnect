# EduConnect — Frontend

React + Vite client for the EduConnect school management platform. Four role-based portals (Super Admin, Institute Admin, Teacher, Parent) served from one app, talking to the [backend API](../backend/README.md).

---

## Quick start

The backend must be running first — see [../backend/README.md](../backend/README.md).

```bash
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on :5173 |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |

### Demo logins

| Role | Email | Password |
|---|---|---|
| Super Admin | `sa@educonnect.io` | `super123` |
| Institute Admin | `admin@bhs.edu` | `admin123` |
| Teacher | `hassan@bhs.edu` | `teach123` |
| Parent | `sara@gmail.com` | `parent123` |

The login screen has quick-fill links for all four.

---

## How it talks to the API

```
Portal components  (unchanged presentation code)
        ▲
        │  legacy-shaped `db` object
        │
   hooks/useDb.js          ← fetches per role, assembles `db`
        ▲
   adapters/legacy.js      ← maps API responses → UI shapes
        ▲
   api/endpoints.js        ← one function per API route
        ▲
   api/client.js           ← fetch, JWT header, token refresh
        ▲
   Vite dev proxy  /api → http://localhost:5001
```

### The adapter layer, and why it exists

The portals began life as a single-file prototype with a hardcoded `initDB()` object. Rather than rewrite ~3,000 lines of working presentation code, the boundary translates API responses into the shapes those components already expect.

`adapters/legacy.js` preserves three conventions the UI depends on:

- **Lowercase strings** — roles, statuses and attendance states (`"admin"`, `"active"`, `"present"`)
- **Attendance as percentages** — the API returns raw day counts; the UI renders `${att.present}%` and donut fills. `present`/`absent`/`late` are each a share of the total and sum to 100; `rate` is the separate present-or-late figure.
- **Pre-formatted dates** — `"Mar 12"`, `"2h ago"`

The payoff: adding a backend changed *where data comes from*, not how any screen is drawn. The trade-off: two vocabularies exist in the codebase, and the mapping is the one place that has to know both. If you rewrite the portals later, delete the adapter — nothing else depends on it.

### Per-role loading

`useDb` fetches only what a role's portal renders, which also matches what the API will authorise:

| Role | Calls |
|---|---|
| Super Admin | `/institutes`, `/users`, `/dashboard/superadmin`, `/plans`, `/subscription-invoices` |
| Institute Admin | `/institutes/:id`, `/students`, `/teachers`, `/parents`, `/notices`, `/messages` |
| Teacher | `/dashboard/teacher`, `/teachers/me/classes`, `/students`, `/teachers`, `/notices`, `/messages` |
| Parent | `/dashboard/parent`, `/parents/me/children`, `/students/:id` per child, `/notices`, `/messages` |

Students arrive pre-scoped by the API — a teacher's `/students` returns only their classes, a parent's only their children. The client never filters for security, only for display.

### Sessions

`api/client.js` stores the access and refresh tokens in `localStorage` and attaches the Bearer header. When a call fails with an expired access token it refreshes once and retries transparently; concurrent 401s share a single refresh so they don't revoke each other's tokens. If the refresh fails, the app returns to the login screen.

A stored token is resumed on page load, so a refresh doesn't sign you out.

---

## What's live

Everything data-bearing: all four dashboards, student/teacher/parent lists and profiles, grades, attendance, fees, timetable, messages, notices, and the AI insights.

| Action | Endpoint |
|---|---|
| Sign in / sign out / session refresh | `/auth/*` |
| Register an institute (3-step signup) | `POST /auth/signup` |
| Onboard an institute (super admin) | `POST /institutes` |
| Edit institute profile & standard fee | `PATCH /institutes/:id` |
| Add student / teacher / parent | `POST /students`, `/teachers`, `/parents` |
| Edit student / teacher / parent | `PATCH /students/:id`, `/teachers/:id`, `/parents/:id` |
| Delete student / teacher / parent | `DELETE …` (with a confirmation naming the side effects) |
| Reset a user's password | `POST /users/:id/reset-password` |
| Take the daily register | `GET /attendance/register` → `POST /attendance/bulk` |
| Enter class marks | `POST /assessments/bulk` |
| Record a fee payment | `POST /fees/:id/pay` |
| Generate the month's invoices | `POST /fees/generate` |
| Flag overdue invoices | `POST /fees/mark-overdue` |
| Post a notice | `POST /notices` |
| Reply to a message | `POST /messages/:id/reply` |
| Export reports (CSV / JSON) | `GET /reports/institute`, `GET /fees` |
| Broadcast to every institute | `POST /notices/broadcast` |
| Change an institute's plan | `PATCH /institutes/:id/plan` |
| Suspend / reactivate an institute | `PATCH /institutes/:id/status` |
| Delete an institute | `DELETE /institutes/:id` (two-step confirmation) |
| Disable / re-enable a user | `PATCH /users/:id` |
| Record a subscription payment | `POST /subscription-invoices/:id/pay` |
| Generate the month's platform billing | `POST /subscription-invoices/generate` |
| Edit platform settings | `GET` / `PATCH /platform/settings` |
| Edit plan pricing and seat caps | `PATCH /plans/:id` |
| Export all platform data | composed client-side from the calls above |

**Attendance register.** Loads whatever is already recorded for the chosen class and date, so re-opening shows existing marks rather than a blank sheet; submitting again corrects them instead of erroring (the API upserts on `studentId + date`).

**Reports export CSV, not PDF.** CSV opens in Excel and needs no rendering library. The at-risk report uses the insight engine's own thresholds — below 60% average or 85% attendance — so it can't drift from what the portals show. "Full Dataset" hands over the raw JSON.

**Broadcast** writes one notice row per targeted institute rather than a single shared row. Each school's admin can then edit or delete their own copy, and the existing per-institute read rules keep working untouched.

**Destructive actions are gated in proportion to their blast radius.** Disabling a user is one click; deleting an institute needs a confirmation *and* typing the institute's name, because it cascades through every student, mark, attendance row and invoice it owns. Suspending is offered as the reversible alternative.

**Guardrails surface before you commit.** The plan dialog previews the billing change and blocks a downgrade that would put a school over its new seat cap; the plan editor refuses a cap below what a subscriber already uses.

**My Classes** shows one card per subject-and-class the teacher owns — a teacher taking the same class for two subjects gets two cards, because the roster, average and assessment count differ per subject. Expanding a card reveals the roster ranked by score with term-over-term trend arrows and per-student attendance; "Attendance" jumps to the register with that class already selected.

Every portal is now backed by live data. No screen renders an invented number.

---

## Notes

- **Port 5001.** The dev proxy points at `http://localhost:5001` because an older EduConnect backend occupies :5000 on this machine. Change `vite.config.js` and `backend/.env` together if you move it.
- **Deploying.** Set `VITE_API_URL` to the full API URL (e.g. `https://api.yourschool.com/api`); the proxy only exists in dev.
- **`docs/original-artifact.jsx`** in the repo root is the untouched prototype this was built from, kept for reference.

