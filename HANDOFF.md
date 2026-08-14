# EduConnect — Handoff

Everything a new session needs to pick this up. Written 2026-08-13, updated 2026-08-14
after a full per-page UX audit of all four portals.

---

## 1. What this is

Multi-tenant school management SaaS. One deployment serves many institutes, each fully isolated.
**Node + Express + PostgreSQL (Prisma) + React + Vite.** Final-year project, local development only.

```
C:\Users\Dell\Desktop\educonnect direct app\
├── backend/    Express API — ~115 endpoints, 19 models, 98 tests
├── frontend/   React + Vite — 4 role portals in one big App.jsx
├── docs/       original-artifact.jsx (the prototype this grew from)
├── README.md · DEPLOYMENT.md · render.yaml · docker-compose.yml
```

---

## 2. Run it

```bash
cd "C:\Users\Dell\Desktop\educonnect direct app\backend" && npm run dev
```
```bash
cd "C:\Users\Dell\Desktop\educonnect direct app\frontend" && npm run dev
```

- Frontend <http://localhost:5173> · API <http://localhost:5001> (**not 5000**)
- DB: local PostgreSQL 18, database **`educonnect_v2`**
- Tests: `cd backend && npm test`

### Demo logins

| Role | Email | Password |
|---|---|---|
| Super Admin | `sa@educonnect.io` | `super123` |
| Institute Admin | `admin@bhs.edu` | `admin123` |
| Teacher | `hassan@bhs.edu` | `teach123` |
| Parent | `sara@gmail.com` | `parent123` |

The landing page's **Try Demo Account** button signs in as any of these in one click.

---

## 3. THE TRAP THAT WILL BITE YOU

**After any schema change or `prisma migrate`, restart the backend.**

`prisma generate` rewrites `node_modules/.prisma`, which nodemon does **not** watch. The running
server keeps the old client and throws confusing errors — `Unknown argument 'deletedAt'`, or a
blanket **500 on every login**. This wasted time three separate times in the last session.

```bash
# after any migrate/generate
# stop the server, then:
cd backend && npx prisma generate && npm run dev
```

Symptom → cause: login suddenly 500s but `npm test` passes = stale running server (tests spawn a
fresh process). **Restart, don't debug the code.**

---

## 4. Current state — everything is green

| Check | Result |
|---|---|
| Backend tests | **110 passing** across 7 files |
| Frontend build | clean, 36 modules |
| Prisma schema | valid, 6 migrations, applies from scratch |
| Console errors | zero on a clean tab |
| Login (all 4 roles) | verified working after restart |
| Per-page UX audit | **done** — all 4 portals, every tab swept, all API calls 200 |
| Browser back/forward | **works** — tabs are in the URL hash (see §9) |

Uncommitted. Last commit is `e860580`. Local `main` is **1 commit ahead of GitHub** — nothing since
`4eccc3c` has been pushed, and **nothing should be pushed without the user asking.**

---

## 5. ⚠️ Data loss you must tell the user about

Running `npx prisma migrate reset --force` during the last session **wiped the database**. The three
seeded demo institutes were restored, but **four test schools the user had registered themselves
were destroyed**:

`THE BEST GARRISON SCHOOL`, `tresysutst`, `fakd;ljfkjwe'f`, `chcbgchgchg`

They cannot be recovered. This was flagged to the user. **Never run `migrate reset` on their
database again without explicit permission** — use `migrate dev` (additive) instead.

---

## 6. Architecture you need to understand

### Frontend: the adapter pattern
`App.jsx` is ~3,500 lines of prototype presentation code that was **deliberately not rewritten**.
Instead:

```
Portal components  ← legacy-shaped `db` object
  hooks/useDb.js      fetches per role, assembles `db`
  adapters/legacy.js  maps API responses → the shapes the UI expects
  api/endpoints.js    one function per route
  api/client.js       fetch + JWT + silent refresh
```

Three conventions `legacy.js` **must** preserve (each caused a real bug when broken):
- lowercase role/status strings (`"admin"`, `"active"`, `"present"`)
- attendance as **percentages summing to 100**; `rate` (present+late) is separate
- `fees` arrives as an array from lists but `{paid,outstanding,invoices}` from `GET /students/:id`

Also: the App root must only show the full-screen loader when `db` is **null**, never on refetch —
otherwise every save unmounts the portal and dumps the user back on the Dashboard tab.

### Backend: three load-bearing rules
- **Tenancy is middleware, not per-query.** `scopeToInstitute` pins non-superadmins to their own
  institute; a foreign `instituteId` gets 403. `studentScopeWhere` narrows rows by role.
  Out-of-scope records return **404, not 403**, so IDs can't be probed.
- **Derived values are computed, never stored** (`utils/academics.js`). No `gpa` column.
- **Seat limits go through `utils/subscription.js`** — `effectiveStudentLimit()`, never
  `plan.maxStudents` directly.

### Soft deletes
Institute/Student/Teacher/Parent carry `deletedAt`. A Prisma extension in `config/prisma.js`
filters **reads** automatically (and rewrites `findUnique`→`findFirst`). **Writes are explicit** in
controllers — extensions don't reliably apply inside interactive transactions. `prismaRaw` is the
unextended client, used only by recycle-bin/restore/purge paths.

**Nested relation reads bypass the extension** — `include: { students: … }` and `_count` must be
filtered by hand. Several already are; check when adding new ones.

---

## 7. Validation rules (strict — locked by tests)

**Phone — Pakistani mobile only, `^03\d{9}$`.** Exactly 11 digits starting `03`.
Spaces, dashes and brackets are **rejected, not stripped** (the user was explicit). `+92`/`0092`
rejected. One precise error message per problem via `superRefine`.

**Email** — stricter than Zod's `.email()`: requires a dotted domain with a 2+ letter TLD, rejects
`test@gmail`, `a@b`, consecutive dots, leading/trailing dots. Trimmed and lowercased.

Authority: `backend/src/validators/common.js`. Mirror: `frontend/src/utils/validate.js`.
Both pinned by `backend/tests/validation.test.js`.

> **Open question — reviewed 2026-08-14, still UNDECIDED. DO NOT change the rule without asking.**
> The 03-only rule applies to *every* phone field, including a school's main contact number, so
> **a school with only a landline cannot register**. Confirmed against the live API: Lahore
> `04235761234` and Karachi `0213456789` are both rejected with "must start with 03".

### 7a. If landline support is wanted — exactly what to separate

One validator, `phone` in `backend/src/validators/common.js:54`, backs every field. Splitting it
means adding a second export (say `orgPhone`) and repointing **only the organisation fields** at
it. Person fields stay mobile-only.

**Repoint to `orgPhone` — the institute's own number (3 sites, 2 schemas):**

| File | What it is |
|---|---|
| `validators/institute.schema.js:9` | `createInstituteSchema.phone` — super-admin onboarding a school |
| `validators/institute.schema.js:23` | `updateInstituteSchema` — `createInstituteSchema.partial()`, inherits it automatically |
| `validators/auth.schema.js:22` | `signupSchema.phone` — the public "Contact Phone*" on registration step 1 |

**Leave on the mobile rule — these belong to a person:**
`auth.schema.js:62` (own profile) · `institute.schema.js:63` (createUser) · `institute.schema.js:77`
(updateUser) · `people.schema.js:12, 27, 44` (student, teacher, parent).

**Frontend mirror** — `frontend/src/utils/validate.js:68` `phoneError()` needs the matching second
function, and only these call sites switch to it:
- `App.jsx:622` — `label:"Contact phone"`, signup step 1. **This is the only institute call site.**
  (`App.jsx:624` is `"Admin phone"` — a person, leave it.)
- `App.jsx:630` — the bare `phoneError(f.phone)` inside `step1Ok`, same institute field.
- `InstituteSettingsCard` — its "Phone" input has **no** client-side check at all today and relies
  on the server, so it needs the new rule adding if you want inline feedback.
- `App.jsx:2491` and `App.jsx:3334` are person phones — leave them.

**Two things to know before starting:**
- `backend/tests/validation.test.js:11` (`describe("Pakistani phone validation")`) pins the current
  behaviour. A split needs new cases for `orgPhone`, not edits to the existing ones.
- `people.schema.js:67` — the **CSV bulk-import row** uses a plain `z.string().optional()` and is
  not validated by this rule at all. Phone numbers can already enter the database through that
  path in any format, so whatever rule you settle on, that gap is separate and still open.

---

## 8. What was fixed (condensed)

**Reported bugs:** student limit showing 800 instead of 150 (two causes — signup's number was stored
and never read, *and* the frontend read a hardcoded `PLANS` array); fake 87% attendance / Rs 87,500
on dashboards (literals in JSX, and `/dashboard/admin` was never fetched); students appearing to get
logins (backend never did — the UI text lied); notice Edit/Delete were decorative badges;
"Try Demo Account" only displayed credentials.

**Also built:** admin self-service plan change + end-of-period cancellation; subscription **expiry
enforcement** (computed live in `accessBlock()`, plus a 6-hourly sweep flipping status to `EXPIRED`);
**real notification preferences** that gate server-side actions; fee reminders via the existing
message+email service; CSV bulk student import; password reset flow; httpOnly refresh cookie;
soft deletes with restore/purge; timezone-correct attendance dates.

**Bugs I introduced and fixed:** a PowerShell script that replaced every `_` with `c` across three
controllers; a missing `accessBlock` import causing 500s on login (caught by the tenancy suite);
backticks inside a CSS template literal breaking the build.

---

## 9. Responsive — done, and how it works

All four portals verified clean (zero overflow) at **390, 430, 768, 1024, 1366, 1920**.

The app uses **inline styles everywhere**, which beat normal CSS. The fix lives in the `css`
constant in `App.jsx` and uses **attribute selectors + `!important`**:

```css
@media (max-width:1100px){ [style*="repeat(4,1fr)"]{grid-template-columns:repeat(2,1fr)!important;} }
@media (max-width:640px){  [style*="grid-template-columns"]{grid-template-columns:1fr!important;} }
```

Plus `useMediaQuery` in `Shell` locks the sidebar to icons below 900px, and tables become their own
horizontal scroll region below 768px.

⚠️ **No backticks inside that `css` template literal** — they terminate the string and break the build.

### Routing — the URL hash *is* the tab

There is still no react-router. Each portal drives its screens from one `tab` state value, and
`useHashTab(fallback, validTabs)` in `App.jsx` syncs that value to `window.location.hash` both
ways — hash → state on load and on `popstate`/`hashchange`, state → hash via `pushState` on
navigation. So `#/students` is a real deep link, Back/Forward step through tabs, and a refresh
stays put instead of dumping you on Dashboard.

Each portal declares its own tab list (`SUPERADMIN_TABS`, `ADMIN_TABS`, `TEACHER_TABS`,
`PARENT_TABS`). **If you add a tab to a portal's `nav`, add its id to that array too** — anything
not in the list is treated as unknown, falls back to `dashboard`, and the hash is rewritten to
match so the address bar never advertises a screen you aren't on. Logout clears the hash, because
the next sign-in may be a role with no such screen.

Landing/login/signup are *not* hash-routed — they're still `screen` state on `App`.

---

## 10. The 2026-08-14 audit — what it found

A systematic per-page sweep of all four portals. The recurring theme was **UI that displayed
invented numbers as if they were real data**, so treat any remaining literal in JSX as suspect.

**Fabricated data, now real:** the teacher Grade Book invented all five columns
(`[prev-2, prev, prev+3, score-2, score]` under fixed "Quiz 1…Project" headers) and now reads
`GET /assessments/gradebook`; the admin Attendance tab was entirely static (fixed class, fixed
date, 87% donut, dead P/A/L and Save buttons) and now marks real attendance; the parent portal's
fees (`invoiceCount × 12500`, "Rs 1,50,000", due date "20th"), attendance (87/8/5/2/100), AI tab
(85% projection, "confidence 78%", 82/100, "#3 Predicted", `[72…85]` sparkline, "+13% since
Sept"), grades ("Top 10%") and profile all now read live values.

**Silent empty screens, now populated:** `GET /students` omitted `subjects[].teacher`, so the
teacher-name filter matched nothing and *three* teacher panels were permanently blank — the
serializer now returns `teacher`, `teacherId` and `enrollmentId`, and the portal matches on id.
The parent timetable read `timetable.days` while the student endpoint returns a flat array, so 30
real slots never rendered; `toLegacyTimetable` now accepts both shapes and `toLegacyPeriods`
derives the column times from the real slots.

**Dead controls, now wired:** teacher message reply, Edit Profile and Change Password (endpoints
existed, unused), Quick Grade Entry save, parent Compose (real contacts from `/messages/contacts`),
admin student side-panel actions. Removed rather than faked: the parent's four notification
toggles (preferences are ADMIN-only server-side, no per-guardian model exists) and the landing
page's About/Contact/Privacy/Terms/Support links.

**Two traps worth knowing:**
- `Inp` used to swallow every prop it didn't destructure, so `maxLength={11}` and `min="1"` did
  nothing in seven places. It now forwards `...rest` to the input.
- Components defined **inside** a portal body get a new identity on every parent render, so they
  remount whenever `onReload()` swaps `db` — any local state, including a success banner, is lost.
  Report outcomes through portal-level state (`pNote`/`pErr`) as AdminPortal already did.

## 10b. Second pass, 2026-08-14 — network, responsive, password, greeting

**Network failure — tested for real** (backend stopped, and `fetch` forced to reject), fixed two
things in `api/client.js`:
- `fetch()` wasn't wrapped, so a genuine transport failure escaped as a bare `TypeError: Failed to
  fetch` with no `status` — every caller that branched on status missed it. It now becomes
  `ApiError(0, …)` with an `isNetwork` flag.
- A non-JSON reply became `"Server returned 500"`, blaming the API for being broken when it was
  simply absent (the dev proxy answers 500 with nothing behind it). The API always sends a JSON
  envelope, *including* on its own 500s, so a non-JSON 5xx now reports as unreachable instead.

Verified: boot with the API down lands on the landing page rather than hanging on the splash; a
failed submit keeps the modal open and the typed text intact; retrying after the network returns
succeeds; the error splash's "Try again" recovers in place.

**Responsive — re-verified after the layout and routing changes.** 390 / 430 / 768 / 1024 / 1366 /
1920 across all four portals (30 tabs × 6 widths) plus landing, login and signup: no horizontal
overflow anywhere. One real bug found and fixed on the way: the landing navbar's `padding:14px 64px`
left 262px at 390px wide for the logo, links and both CTAs, so **"Sign In" was half off-screen and
"Get Started Free" entirely off it** — unreachable on a phone. `overflow-x:hidden` had been hiding
this from any document-level overflow check, which is why the earlier pass missed it. Fixed with
`flexWrap` plus an `.ec-topnav` breakpoint; desktop is untouched.

**Password change — tested end to end** on a disposable account, since it revokes sessions. Wrong
current password → 400; old password after the change → 401; new password → 200; a second device's
refresh token → 401 revoked; the device that made the change keeps working. The UI form's mismatch
check, its server-error surfacing and its field-clearing all confirmed. Test account deleted
afterwards (soft-deleted, so its login now 403s).

**Greeting** — `greeting()` helper; verified at 7, 11, 12, 14, 16, 17, 19 and 23 hours on both the
teacher and parent dashboards.

## 10c. What's still left

1. **Landing page marketing figures** — "500+ schools", "2.4M+ students", "99.9% uptime", "4.9★"
   are still literals. Unauthenticated marketing copy, not product data, and deliberately left
   alone. Decide whether they belong in an FYP demo.
2. **Institute landline phones** — see §7 and §7a. Reviewed, confirmed broken for landline-only
   schools, and deliberately **not** changed.
3. **The CSV import endpoint has no frontend.** `POST /api/students/import` is built, validated and
   tested, but nothing in `App.jsx` calls it and `api/endpoints.js` has no `students.import`. It is
   reachable only via the API directly.
4. **Email delivery is unconfigured.** With no SMTP the mail service falls back to the server
   console, so password resets and fee reminders create the in-app message but send no email. Fine
   locally; a real deployment needs SMTP credentials.
5. **Nothing is committed.** Everything from all sessions is still working-tree only.

## 10d. CSV import validation — fixed 2026-08-14

`importRow` keeps every cell a loose string **on purpose**, so one bad value can't reject a whole
file with an opaque `rows.47.phone` path; the controller collects problems per row and reports them
with line numbers instead. Phone numbers were simply missing from that per-row pass, so the bulk
path wrote values the single-record endpoints refuse.

Fixed in the controller, not the schema, to preserve that design. A `phoneProblem()` helper
delegates to the shared `phone` rule via `safeParse` — one source of truth, so changing
`validators/common.js` (including any §7a landline split) carries straight through. Both columns
are covered: `phone` and `guardianPhone`, named separately in the message.

**This was not theoretical.** Running the new tests against the *unfixed* controller imported 6
students and 1 guardian carrying `04235761234` and `0213456789` — real landline numbers written
straight to the database. Those artifacts were deleted afterwards.

### guardianEmail — same treatment, plus a duplicate-guardian bug

The column had its own looser `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, so the bulk path accepted addresses
every single-record endpoint refuses — consecutive dots, leading/trailing dots. It now goes through
the shared `emailField`.

Fixing it surfaced a second, quieter bug. `emailField` lowercases; the import stored the address
exactly as typed. The guardian lookup matches on `email`, and **Postgres compares that
case-sensitively** — so a spreadsheet saying `A@x.com` missed a stored `a@x.com` and created a
*second* parent for the same person, and two siblings whose rows spelled the guardian differently
got a guardian each. `emailProblem()` returns the parsed value and the row carries that forward, so
the lookup, the record it writes and the rest of the API now all agree.

Both bugs were reproduced in the database, not just argued: running the tests against the unfixed
controller left a parent at `a..b@example.com` and another at `CASEFOLD.GUARDIAN@EXAMPLE.COM`.

### Tests

`backend/tests/import.test.js` — 12 tests, all confirmed to fail without their fix (5 for phone,
4 for email). Almost every batch contains a deliberately bad row with `partial` left false, so the
all-or-nothing rollback means those never write. The one block that *must* write — case-insensitive
guardian dedup — cleans up in `afterAll`, and that teardown is deliberately broader than the happy
path needs so a future regression can't leave rows behind.

⚠️ If you ever disable one of these checks to see the tests fail, **the rejected rows start
importing for real**. Clean up afterwards: students named `Import Probe`, rolls starting
`CASEFOLD`, and any guardian on `example.com`.

---

## 11. Suggested first message for the new chat

> Continue work on EduConnect at `C:\Users\Dell\Desktop\educonnect direct app`. Read `HANDOFF.md`
> first. Local development only — do not deploy or push. Start both dev servers, run
> `cd backend && npm test` to confirm 98 passing, then pick up the remaining items in §10b.

**House rules the user has set:** local only, never deploy, never push without being asked, never
fake success or mock data, fix root causes not symptoms, verify before claiming something works, and
be honest about what wasn't tested.
