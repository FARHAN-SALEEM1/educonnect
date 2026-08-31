# EDUCONNECT — COMPLETE HANDOFF

> **Updated 2026-08-27 (promotion enrols + unique key — Step 4)** — promotion ab naye
> saal ki enrolments banata hai (destination class ke curriculum se), unique key mein
> session shamil hai, aur Result Card par session picker hai. Section 6d.
>
> **Updated 2026-08-27 (session-scoped reads — Step 3)** — 31 query sites ab ek saal
> parhte hain. `report` → is saal ka card, `?session=2026-27` → pichle saal ka. Dono
> mukammal, alag alag. Section 6c.
>
> **Updated 2026-08-29 (2.0.0 subscription adapter)** — section 9a. Chaar asli
> subscription payloads capture ho gaye aur adapter unke mutabiq likh diya.
> **Asli subscription payment abhi bhi nahi hui** — Safepay ka reCAPTCHA.
>
> **Updated 2026-08-29 (B3 CLOSED — asli Safepay webhook receive hui)** — section 9.
> Signature scheme settle ho gaya: `signedOver: data`. Masla TLS nahi tha — dashboard
> URL mein ek digit kam thi. Subscription lifecycle abhi bhi unverified.
>
> **Updated 2026-08-29 (Safepay: checkout verified, two real bugs fixed)** — 6l.
> Sandbox credentials asli nikle. Checkout asli Safepay se verify hua. Webhook
> Safepay se webhook us waqt tak nahi aayi thi — **agle hi din aa gayi, section 9.**
>
> **Updated 2026-08-29 (SMTP verified against a real relay)** — section 6k.
> Mail ab asli socket par bhejni verify hui hai, ek local SMTP server ke against.
> **Asli inbox delivery abhi bhi verify NAHI hui** — credentials mojood nahi.
>
> **Updated 2026-08-29 (readiness audit + the fixes it found)** — section 6j.
> Ek cross-tenant leak, ek jhooti toggle, aur fee register ka data-loss hole
> band. Verdict: **YES WITH CONDITIONS**, shartein 6j ke aakhir mein.
>
> **Updated 2026-08-28 (landing page honesty · stale entries swept)** — section 6i.
> Hero ke chaar gadhe hue aankre hata diye, aur is document ke wo "abhi baqi"
> entries theek kar dein jo ho chuki thin.
>
> **Updated 2026-08-28 (academic setup at signup · terms reorder)** — section 6h.
> Session start month, pass mark aur terms ab registration par pooche jate hain,
> aur terms ko delete kiye baghair reorder kiya ja sakta hai.
>
> **Updated 2026-08-28 (term weighting applied)** — section 6g. `weightage` is
> no longer stored-and-ignored; the annual result, the position and the
> rolled-up score all follow it, and a school can set it from Settings.
>
> **Updated 2026-08-28 (grading authority · siblings · teacher subjects)** —
> section 6f. The school sets its own scale and it now reaches the whole app;
> one guardian can hold several children; a teacher's subjects are editable.
>
> **Updated 2026-08-27 (ExamTerm)** — terms ab school ke apne hain aur us saal ke hain
> jismein wo set kiye gaye. `enum AssessmentTerm` khatam. Section 6e.
>
> **Updated 2026-08-27 (grading policy + result card)** — grading scale aur pass mark ab
> per-school hain, aur card marks (`82 / 100`), grand total aur pass/fail ke sath aata
> hai. Section 6m.
>
> **Updated 2026-08-27 (Enrollment session FK — Step 2)** — column mojood hai, aur backfill
> **saboot se** faisla karta hai. User ki manzoori par `--apply` chala: 24/24 enrolments
> tagged, rollback drill bhi sabit hua. Section 6b.
>
> **Updated 2026-08-27 (AcademicSession — Step 1)** — session ab tareekhon wali asal cheez
> hai, per-school. April-March default, August-July jo school kahe. Ye multi-year ka
> darwaza hai. Section 6a.
>
> **Updated 2026-08-27 (tenancy.test.js reset-token leak)** — enumeration check ab apne
> throwaway account par. Test architecture cleanup **band**: koi spec ab seeded data
> mutate nahi karta. Section 5k.
>
> **Updated 2026-08-27 (tokenreuse.test.js tenant isolation)** — spec ab apne throwaway
> schools aur users par chalti hai. Koi seeded account na sign-in hota hai, na uske
> sessions revoke hote hain, na uske reset tokens delete. Section 5j.
>
> **Updated 2026-08-27 (import.test.js tenant isolation)** — spec ab apna throwaway school
> banati hai aur app ke apne purge lifecycle se mitati hai. Demo institute se bilkul alag.
> Section 5i.
>
> **Updated 2026-08-26 (score decision analysis)** — 11 bina-marks wale score **corruption
> nahi**, carried-forward records hain (11/11 par `previousScore` mojood). Faisla mahfooz
> rakhne ka. Reversible per-id script tayyar hai, chalaya nahi gaya. Section 5h.
>
> **Updated 2026-08-26 (marks are the truth + absence alerts)** — subject score ab sirf
> marks se banta hai (Option A), aur ghair-hazri par guardian ko usi din khabar jati hai.
> Sath do P0 nikle: admin ka Save Attendance kabhi chala hi nahi tha, aur ek test poore
> database se parents delete kar raha tha. Section 5g.
>
> **Updated 2026-08-26 (part payment + printed challan)** — fee challan ki adhi
> raqam lena ab mumkin hai aur hisaab mein rehti hai; challan aur receipt dono chhap
> sakte hain. Section 5f.
>
> **Updated 2026-08-26 (onboarding credentials)** — Super Admin ka "Create & Send
> Credentials" ab waqai admin account banata hai aur uske credentials pohanchata hai.
> Pehle ye school banata tha jismein koi login hi nahi hota tha. Section 5e.
>
> **Updated 2026-08-26 (fee heads)** — ek challan par kai heads. `FeeHead` enum,
> `FeeItem` model, create/update/generate teeno itemised, aur admin + parent dono
> par breakdown. Raaste mein PATCH `/fees/:id` ka bina-schema hona bhi band hua.
> Section 5d.
>
> **Updated 2026-08-26 (session rollover)** — the product now works in its second
> year. `Institute.currentSession`, a `StudentPromotion` history table, and a
> promote/retain/graduate operation with a compulsory dry run. Section 5c.
>
> **Updated 2026-08-26 (score reconciliation)** — the `currentScore` disagreement is
> now **visible** (`marksAverage` beside `score` on the result card and the gradebook)
> and **resolvable** (`POST /subjects/:id/recalculate`). Neither write path changed.
> Section 5b has the detail.
>
> ⚠️ **Demo data ab user ka bhi hai.** 26 Aug ko user ne app khud use ki — 4 naye
> students, ek institute (INS004), ek teacher, ek parent, ek class, aur **Ayesha Khan
> soft-delete** kar di (Recycle Bin mein hai). Purane row-count baselines is liye
> obsolete hain; ye data QA nahi, asli hai — delete mat karna.
>
> **Updated 2026-08-26 (exam terms)** — `Assessment.term` added with an additive
> migration, and the result card, gradebook and assessment list all report per
> term. Section 5a has the detail. The `currentScore` drift is now quantified:
> **7 of 13 scored enrolments in the demo data disagree with their own marks.**
>
> **Updated 2026-08-26 (product audit)** — a full button/action, journey, UI/UX,
> security and Pakistani-school product audit. No broken buttons or journeys were
> found (78 journey checks pass). Shipped: **Result Card**, **Fee Defaulters
> report**, and **keyboard access** to the app's shared controls. One real
> data-integrity finding — section 4, `currentScore` has two writers.
>
> **Updated 2026-08-26** — the remaining optional/future items: Institute
> Recycle Bin, `db:verify`, the conflict script's idempotency, and frontend
> test coverage. Four more bugs found and fixed. Safepay still untouched.
>
> **Updated 2026-08-24** — a full non-Safepay work pass: notice QA, the CSV
> import UI, an SMTP readiness audit, responsive QA, reports, the recycle bin
> and a security audit. Six bugs found and fixed; see sections 4, 6 and 7.
>
> **Merged 2026-08-23.** Disk par pehle sirf 2026-08-14 wala handoff tha; naya comprehensive
> handoff sirf chat mein mojood tha aur kabhi file mein nahi likha gaya. Ab dono ek jagah hain —
> naya wala spine (sections 1-16), aur purane ka jo reference material aaj bhi valid hai wo
> **Appendix A** mein. Appendix apni asli English mein rakha gaya hai taake dense technical
> tafseel translate karte waqt distort na ho.

---

## 1. PROJECT OVERVIEW

**Naam:** EduConnect — multi-tenant school management SaaS (final year project, ab production-readiness ki taraf le jaya gaya hai)

**Path:** `C:\Users\Dell\Desktop\educonnect direct app`

**Tech stack:**
- **Backend:** Node.js + Express (ESM), Prisma ORM, PostgreSQL 18
- **Frontend:** React + Vite (single large `App.jsx`, 4 role portals)
- **Tests:** Vitest + Supertest
- **Auth:** JWT access token (in-memory) + httpOnly refresh cookie, rotation + reuse detection

**Local URLs:**
- Backend API: `http://localhost:5001` (health: `/health`, API base: `/api`)
- Frontend: `http://localhost:5173`
- PostgreSQL: `localhost:5432`, database `educonnect_v2`

**Folder structure:**

```
educonnect direct app/
├── backend/
│   ├── prisma/schema.prisma, migrations/, seed.js
│   ├── scripts/          (db-backup, db-verify, guard-destructive,
│   │                      backfill-classes, fix-timetable-conflicts,
│   │                      verify-safepay-sandbox)
│   ├── src/
│   │   ├── app.js, server.js
│   │   ├── config/       (env.js, prisma.js)
│   │   ├── controllers/  (auth, student, teacher, parent, subject,
│   │   │                  assessment, attendance, fee, timetable, class,
│   │   │                  message, notice, dashboard, institute, platform,
│   │   │                  billing, user)
│   │   ├── middleware/   (auth.js, validate.js, rateLimit.js, errorHandler.js)
│   │   ├── routes/, services/payments/, utils/, validators/
│   ├── tests/            (21 files)
│   └── .env              (gitignored — secrets yahan)
├── frontend/
│   └── src/  App.jsx, api/(client.js, endpoints.js), hooks/useDb.js,
│              adapters/legacy.js, utils/download.js
├── DEPLOYMENT.md, render.yaml, .gitignore
```

**Kaise run hota hai:** dono dev servers `preview_start` se chalte hain (`.claude/launch.json` mein `frontend` aur `backend` entries). **Bash se dev server mat chalana.**

⚠️ **Frontend ko port 5173 hi chahiye** — backend ka `CORS_ORIGIN` usay explicitly whitelist karta hai. `launch.json` mein `"autoPort": false` set hai.

---

## 2. CURRENT PROJECT STATE

- **Tests:** **875/875 pass, 55 test files** (2026-08-31)
- **Build:** clean, `519.02 kB` (gzip 135.39 kB)
- **Git:** **2026-08-30 ko pehli dafa commit aur push hua** — branch `deploy-prep`,
  159 files, +35,092 / −1,066. Us se pehle repo mein sirf ek commit tha aur poori
  application uncommitted padi thi. Deploy ab bhi kahin nahi hua.
- **Demo readiness:** **Non-Safepay functionality demo ke liye tayyar hai.** Chaaron portals kaam karte hain, data saaf hai, timetable conflict-free hai
- **`PAYMENT_PROVIDER`** — `.env` mein ye **do dafa** likha hai: line 17 par `manual`,
  line 24 par `safepay`. dotenv mein baad wali jeetti hai, is liye **abhi `safepay` chal
  raha hai** aur Billing UI online checkout dikhata hai. Ye Safepay webhook testing ke
  liye set kiya gaya tha. Demo se pehle line 24 hata dein (ya `manual` kar dein), aur
  `SAFEPAY_CAPTURE_WEBHOOKS=` bhi khali kar dein — warna har test run us file mein
  darjanon fake webhook likh deta hai. **2026-08-30:** wo file (`backend/capture.jsonl`,
  611 entries / 378 kB) ab `.gitignore` mein hai aur hata di gayi — pehle wo untracked
  pari thi aur ek `git add -A` use commit kar sakta tha. Wo dobara ban jayegi jab tak
  capture flag on hai.

---

## 3. ALL MAJOR FEATURES IMPLEMENTED

**Authentication/roles:** 4 roles — SUPERADMIN, ADMIN, TEACHER, PARENT. JWT + httpOnly refresh cookie, rotation, reuse detection (`revokedAt`). Forgot/reset password (hashed, single-use, expiring tokens, no enumeration). Change password (revokes all sessions). Signup → institute `PENDING` → super admin approve karta hai.

**Super Admin portal:** Dashboard (KPIs, MRR, plan mix), Institutes (create/edit/suspend/reactivate/change plan/delete), **Institute Recycle Bin**, Revenue + subscription invoices, Users (list, reset password, disable), Platform settings (trial days, plans).

**Institute Recycle Bin (2026-08-26):** Institutes tab → **Recycle Bin**. Har soft-deleted institute
apne code, city, delete ki tareekh aur "kitna abhi bhi mehfooz hai" ke sath dikhta hai. **Restore**
usay wapas ACTIVE kar deta hai aur uske users dobara sign in kar sakte hain. **Erase…** wahid
destructive action hai — panel khulta hai, poora institute ka naam type karna parta hai, aur tab
tak button disabled rehta hai. Purge sirf bin se mumkin hai (API khud bhi 400 deta hai agar
institute pehle delete na hua ho).

**Admin portal (13 tabs):** dashboard, students, teachers, parents, **classes**, **timetable**, attendance, fees, messages, notices, reports, billing, settings.

**Students:** ab **CSV import UI** bhi hai (Students tab → Import CSV) aur **Recycle Bin** (Students/Teachers/Parents tabs par).

**Teacher portal (7 tabs):** dashboard, my classes, gradebook, attendance, messages, **notices (post + apna edit)**, profile.

**Parent portal (9 tabs):** dashboard, attendance, grades, AI insights, messages, fees, timetable, notices, profile.

**Students:** CRUD, soft-delete, seat limits enforced. **Students login nahi karte** — parent account se access.

**CSV import (UI + backend, 2026-08-24):** Students tab → **Import CSV**. File chunte hi client-side
parse hota hai, header aliasing chalti hai ("Roll No" / "roll_no" / "RollNo" sab `rollNo` par
map hote hain), preview table aur per-row problems dikhte hain, aur "Import the valid rows and skip
the rest" (`partial`) + "Create guardian accounts" (`createParents`) toggles hain. Client-side pass
sirf **preview** hai — har rule server par bhi lagti hai, aur submit ke baad server ki apni per-row
report dikhayi jati hai. Do cheezein sirf server jaanta hai aur UI ye keh kar batati hai: pehle se
mojood roll numbers se clash, aur seats.

- Parser: `frontend/src/utils/csv.js` (quoted fields, embedded newlines, doubled quotes, BOM, CRLF)
- Checks: `cd frontend && npm run check:csv` — **23 checks** (frontend mein test runner nahi hai)
- Template download button bhi hai (`downloadCsv` se)

**Recycle Bin (2026-08-24):** Students/Teachers/Parents tabs par button. Soft-deleted records list
hote hain (naam, id, kab hataya) aur **Restore** se wapas aa jate hain. Permanent-delete button
jaan boojh kar nahi rakha — API sirf institutes ke liye purge deti hai.

**Subjects/Enrollments:** subject↔teacher, enrollment = student↔subject + scores.

**Attendance:** daily register per class, bulk mark, edit (re-open existing), summary. Institute timezone ke hisab se "today".

**Assessments/Marks:** gradebook per subject, bulk create with marks, quick grade entry.

**Fees:** invoices, stats, mark paid, reminders, generate.

**Notices:** post karne ka haq SUPERADMIN/ADMIN/TEACHER ko hai; delete sirf SUPERADMIN/ADMIN ko; broadcast sirf SUPERADMIN ko. Teacher sirf **apna** notice edit kar sakta hai — tafseel section 6 mein.

**Messaging:** full inbox/sent, compose with server-built recipient list, threading/replies, read/unread badges.

**Classes + Timetable:** section 5 dekhein.

**Reports:** client-side CSV/JSON generation from `/reports/institute` — academic,
attendance, fees, **defaulters**, at-risk, teacher performance, full JSON.

**Result Card (2026-08-26):** Admin (student panel → Result Card), Teacher, and Parent
(Grades tab → View Result Card). Renders `GET /students/:id/report` — school header,
student and guardian details, **position in class**, every subject with its teacher, previous and current
marks and grade, the four headline figures, an attendance breakdown and the fee
position, with a signature line. **Print / Save as PDF** uses an `@media print` rule
that hides the app around the card, so it prints on its own.

**Fee Defaulters report (2026-08-26):** one line per family — outstanding total, how
many unpaid invoices, the oldest period and days overdue, sorted worst first, with the
guardian's name and phone. That is the list the office rings from. The guardian is
joined client-side because `GET /fees` does not carry one.

**AI functionality:** `AiInsight` model + heuristic engine — predicted scores, AI score (0-100), at-risk detection (<60% average ya <85% attendance), per-subject predictions, recommendations. **Ye rule-based hai, koi LLM nahi.**

**Billing:** provider-neutral architecture (MANUAL/STRIPE/SAFEPAY), manual bank-transfer flow super admin ke through.

---

## 4. IMPORTANT BUGS FOUND AND FIXED

**B1 — PENDING signups ko full access mil raha tha**
`accessBlock()` PENDING state check nahi karta tha. Fix: `middleware/auth.js` + `utils/subscription.js`. Ab PENDING institute ka user block hota hai.

**B2 — `trialEndsAt` enforce nahi hota tha** — same files.

**B4 — Forgot/reset password UI nahi thi** — `App.jsx` + `api/endpoints.js`.

**H1 — `?tokenInBody=1` refresh token leak karta tha**
Query param se 7-din ka refresh token page JS ko mil jata tha (XSS ise chura sakta tha). Mechanism poori tarah hataya — `auth.controller.js`.

**H2 — Production error leakage** — `errorHandler.js`, ab prod mein sab 5xx generic.

**H3 — Seed/demo credentials production mein** — `scripts/guard-destructive.js` + Vite `import.meta.env.DEV` gating.

**H4 — Rate limiting** — per-IP + per-account, `middleware/rateLimit.js`.

**Code collision after delete (BLOCKER)** — code generators soft-deleted rows ko count nahi karte the, ek teacher delete karne par creation hamesha ke liye fail. Fix: `highestIssued()` on `prismaRaw` — `utils/codes.js`.

**Seat check soft-deleted students ginta tha (BLOCKER)** — `_count` soft-delete extension bypass karta hai. Fix: explicit `where: { deletedAt: null }`.

**CORS wildcard production mein allowed tha** — `credentials: true` ke sath `*` matlab koi bhi site signed-in user ban kar API call kar sakti. Fix: `config/env.js` production guard.

**Webhook endpoint unlimited tha** — har forged request ek full-body HMAC cost karti thi. Fix: `webhookLimiter` (sirf failures count karta hai) — `middleware/rateLimit.js` + `app.js`.

**Super Admin "Outstanding" hamesha Rs. 0 dikhata tha**
`fetchAll` pages ko flatten karte waqt `meta` gira deta tha, aur backend ka paid/pending summary usi mein aata tha. 6 unpaid invoices ke bawajood Rs. 0. Fix: `hooks/useDb.js` mein `meta` preserve. Browser mein verify: Rs. 137,994 / 6 unpaid.

**Teacher kisi ko message nahi bhej sakta tha**
Teacher Messages tab mein **compose UI thi hi nahi** — sirf inbox + reply. Backend hamesha support karta tha. Fix: module-scope `MessageComposer` + Teacher tab rebuild — `App.jsx`.

**Sent messages Inbox mein dikhte the (teacher + parent dono)**
List `box=all` se aati thi lekin ek hi "Inbox" mein `m.from` par render hoti thi. Teacher ka apna bheja message aisa lagta tha jaise kisi ne usay bheja ho. Fix: Inbox/Sent split teenon portals mein.

**Admin ke paas messaging screen thi hi nahi**
Teacher ka message office ko pohanchta tha magar koi usay dekh nahi sakta tha. Fix: Admin Messages tab (nav, state, handlers, inbox/sent, compose, reply).

**Teacher kisi ka bhi notice rewrite kar sakta tha (2026-08-23)** — `updateNotice` mein ownership check tha hi nahi. Tafseel section 6 mein.

### 2026-08-26 — Result Card par position add karte hue mila

**🔴 Card par do mukhtalif grading scales chal rahe the**

Result Card ka "Overall Grade" browser mein khud compute hota tha, apne hi bands se
(A+ ≥80). Har subject ka letter server ke `GRADE_BANDS` se aata tha, jahan 80 **A−** hai
aur A+ 90 se shuru hota hai. Yani ek hi card par Zain 84.8% ke subjects "A−/A" dikhate
the aur unke neeche overall "A+" likha aata tha.

**Ye maine hi banaya tha** jab Result Card likha. Fix: server ab `overallGrade`
bhejta hai (wahi `letterGrade()`), aur frontend ka duplicate scale poori tarah hata
diya. Ab card par sirf ek scale hai. `tests/reportcard.test.js` mein do tests ise pin
karte hain — including ye ke **80 = A−, A+ nahi**.

**Sabaq:** grading bands server par hain; unhein browser mein dobara likhna wahi
duplication hai jo `validate.js` parity tests ne pehle pakri thi.

### 2026-08-26 — product audit finding (NOT fixed, needs a product decision)

**🟡 `Enrollment.currentScore` ke do writers hain jo ek doosre ko chup-chaap overwrite karte hain**

| Writer | Kya karta hai |
|---|---|
| `recalcEnrollment` (`services/grading.service.js`) | assessments ke average se derive karta hai — comment khud kehta hai *"so the score a parent sees is always derived from real marks rather than something a teacher typed by hand"* |
| `PATCH /subjects/enrollments/:id` (Quick Grade Entry) | teacher ka haath se type kiya score **seedha** likh deta hai, `recalcEnrollment` ko bilkul bypass kar ke |

Last write wins, aur kisi screen par koi ishara nahi ke kaun sa raasta chala. Demo data
mein ye pehle se drift kar chuka hai: **Ayesha Khan ka Mathematics `currentScore: 23`,
`letterGrade: F` hai — jabke us enrollment ka ek hi assessment "Quiz 3" 17/20 yani
85% hai.** Enrollment 19 Aug ko update hua, assessment 14 Aug ko bana tha.

**2026-08-26 ko ye quantify kiya:** **13 scored enrolments mein se 7** ka stored
`currentScore` apne hi assessments se nahi milta —

| Student | Subject | Stored | Marks kehte hain |
|---|---|---|---|
| Zain Ahmed | Computer Sc. | 98 | 100 |
| Zain Ahmed | Physics | 78 | 95 |
| Zain Ahmed | Chemistry | 72 | 58.3 |
| **Ayesha Khan** | **Mathematics** | **23** | **85** |
| Ayesha Khan | Chemistry | 82 | 90 |
| Bilal Raza | Physics | 58 | 50 |
| Hania Malik | English | 94 | 95 |

⚠️ Isi QA ke doran **ek value badal gayi**: Hania ka Mathematics `92 → 92.5`. Wajah — QA
mark API se delete karne par `recalcEnrollment` chala aur usne value ko uske apne marks
se milā diya. Yani ab wo *zyada sahi* hai, magar hai demo data ka change; batana zaroori
tha.

Ab ye parents ko **Result Card par dikhega**, is liye faisla zaroori hai:

1. Quick Grade Entry ek assessment banaye (sab kuch marks se derive ho), **ya**
2. manual score ko sarahatan "recorded grade" maana jaye jo assessments ko override karta hai, aur UI dono dikhaye

Maine **jaan boojh kar khud faisla nahi kiya** — ye product ka faisla hai, bug fix nahi.
System khud-ba-khud theek ho jata hai: agle assessment write par `recalcEnrollment`
score dobara derive kar deta hai (journey test mein verify kiya).

### 2026-08-26 ke bugs

**Super Admin ka delete dialog purge bayan karta tha, delete nahi**
Dialog kehta tha: *"This erases every student, teacher, parent, mark, attendance record and invoice
belonging to it … This cannot be undone. Consider suspending instead."* Magar
`DELETE /institutes/:id` **soft delete** hai — row `deletedAt` paati hai, status CANCELLED hota
hai, users deactivate hote hain, aur server khud jawab deta hai *"It can be restored from the
recycle bin."* **Kuch erase nahi hota.** Throwaway institute par reproduce kiya: students 1→1,
users 1→1, row mojood. Us par typed-name gate bhi tha — jo ek reversible action ke liye
be-tuka hai, aur asli irreversible action (purge) ka **koi UI hi nahi tha**. Fix: dialog sach
bolta hai, typed-name gate purge par chala gaya, aur Recycle Bin ban gaya.

**`db:verify` teen tables ginta hi nahi tha**
`plan.updatedAt` wale cosmetic error ka peecha karte hue nikla ke MODELS list mein `aIInsight`
**typo** hai (asli client key `aiInsight`), aur loop ka `if (!client?.count) continue;` usay
chup-chaap skip kar deta tha. Iske ilawa `academicClass` (2 rows, asli domain data) aur
`processedWebhookEvent` list mein the hi nahi. Yani jis fingerprint ka maqsad ye hai ke "match
kare to restore mukammal hai", wo teen tables se andha tha — aisa restore jo unhein poora gawa
deta, phir bhi "match" karta. Fix: typo, teenon tables add, aur **do naye guards** jo naam se
batate hain agar koi model list mein na ho ya client par resolve na ho.
⚠️ Fingerprint ki value badal gayi hai (3 tables add hue). Purane likhe hue fingerprints match
nahi karenge — comparison hamesha ek hi build ke "backup se pehle" aur "restore ke baad" ke
darmiyan hoti hai.

**Cosmetic error ki asli wajah:** Prisma apna `prisma:error` block **reject hone se pehle** log
karta hai, is liye `try/catch` throw to rok leta tha magar shor nahi. Ab script pehle schema se
poochhti hai (`HAS_UPDATED_AT`, DMMF se) ke kis model mein `updatedAt` hai — 7 fazool queries
bhi gayin.

**`fix-timetable-conflicts.js --apply` apna hi kaam ulat deta tha**
Swap plan fixed hai (hamesha 9-B ka English↔Urdu), aur wo **apna inverse** hai — yani already-clean
timetable par dobara chalane se wohi 9 conflicts wapas aa jate. Fix do hisson mein: (a) sweep mein
0 conflicts milen to kuch likha nahi jata (dry run bhi ab "nothing to do" kehta hai, paanch
gumraah karne wale swaps nahi chhapta), (b) plan pehle **simulate** hota hai aur sirf tab commit
hota hai jab conflict count waqai kam kare — warna REFUSED ke sath exit 1. Asli clean timetable
par `--apply` chala kar verify kiya: 60 rows ka fingerprint bilkul yaksan raha.

**Institute bin gateway ke customer/subscription ids browser ko bhej raha tha**
`listDeletedInstitutes` poori institute row lautata hai aur `withoutProviderIds` **use nahi karta
tha**, jabke us controller ke baqi 6 response sites karte hain. Endpoint ka koi caller nahi tha is
liye kisi ne notice nahi kiya — aur Recycle Bin dete hi wo caller ban gaya. Reproduce kiya: asli
`providerCustomerId` aur `providerSubscriptionId` values wire par aa gayin. Fix: wahi scrubber.

### 2026-08-24 ke bugs

**Teacher ka "Parents only" notice uske apne board se ghayab ho jata tha**
`listNotices` ka audience filter TEACHER/PARENT ko sirf `audience isEmpty` ya `audience has <role>`
dikhata tha — author ka koi exemption nahi. Teacher publish karta, success banner aata, aur notice
board par milta hi nahi — bilkul aisa lagta jaise post fail ho gaya. Aur UI khud "Parents only"
option offer karti hai. Fix: filter ke OR mein `{ createdById: req.user.id }` — author hamesha apna
notice dekhta hai. Parents post kar hi nahi sakte, is liye unke liye ye clause kuch nahi badalta.

**Fee Collection Report kabhi chala hi nahi tha**
`api.fees.list({limit:500})` — magar `feeQuery.limit` ka max **200** hai, to har baar
`422 Validation failed`. Report button hamesha fail hota tha. Fix: `fetchAll(api.fees.list)` —
ab pages ke through poori list aati hai. Isi call ka doosra site (Fees tab) legal to tha magar
200 se zyada invoices **chup-chaap** gira deta tha; wo bhi `fetchAll` par chala gaya.
`fetchAll` ab `hooks/useDb.js` se exported hai.

**Account bana kar "sign-in details sent" kehna, jabke mail gaya hi na ho**
`createUser`/`createTeacher`/`createParent` `sendWelcome()` ka natija **discard** kar dete the aur
response mein `emailEnabled()` (yani "SMTP configured hai kya") report karte the. Do halat mein ye
jhoot ban jata tha: (a) relay ne message reject kar diya, (b) institute ne "Welcome emails" toggle
off kar rakha hai. Dono mein email jata nahi, temp password **kabhi dikhaya nahi jata**, aur account
banate hi pohanch se bahar ho jata hai. Fix: teenon jagah asli `delivery` result use hota hai, aur
mail na pohanchne par temp password screen par aata hai — wajah ke sath
(`undeliveredReason()`: "no mail server configured" / "welcome emails are turned off for this
institute" / "the email could not be delivered").

**Email templates mein HTML injection**
`name`, `instituteName`, `i.student`, `i.title` free text hain (schema sirf length bandhta hai) aur
seedhe email ke HTML body mein interpolate hote the. Admin student ka naam
`<a href="http://evil">Click</a>` rakh kar har guardian ke fee-reminder inbox mein link bhej sakta
tha. Same-tenant hai, privilege boundary nahi — magar hai kisi aur ka inbox. Fix: `esc()` helper,
12 interpolation sites par lagaya.

**`GET /api/plans` gateway ke plan tokens anonymous callers ko de raha tha**
Ye wahi ek endpoint hai jise **koi token nahi chahiye** (landing page ka pricing table), aur wo bare
`findMany` karta tha — yani har Plan column, `providerPriceIds` samet, jismein asli Safepay plan
token hai. `PLAN_PUBLIC` 20+ jagah lagta hai jahan plan kisi aur response ke andar nested hai;
jo endpoint plans ko **khud** return karta hai wahi chhoot gaya tha. Fix: `select: { ...PLAN_PUBLIC, _count }`.
`curl` se bina token verify kiya — ab sirf 10 safe fields aate hain.

**Delete dialog do jhoot bolta tha**
"This cannot be undone" — jabke ye soft delete hai aur restore endpoint hamesha se mojood tha. Aur
"This also removes their marks, attendance and fee records" — jabke kuch bhi remove nahi hota, row
sirf `deletedAt` paati hai. Dono copy theek ki, aur Recycle Bin bana kar pehli baat sach bhi
kar di.

**`providerPriceIds` browser payloads mein ja raha tha** — `PLAN_PUBLIC` select — `utils/publicFields.js`.

**`providerCustomerId`/`providerSubscriptionId` institute responses mein** — `withoutProviderIds()` scrubber.

---

## 5. CLASS + TIMETABLE WORK

**Design ka sab se ahem faisla:** `AcademicClass` **student membership ka owner nahi hai.** `Student.grade` + `Student.section` hi membership hai — attendance register, gradebook, teacher roster, parent timetable sab isi pair par chalte hain. `AcademicClass.name`/`section` unko mirror karte hain. Class assign karne se student ka grade/section update hota hai. **Isi liye migration risk lagbhag zero raha.**

**Migrations (dono additive, 0 destructive statements):**
1. `20260819155845_academic_classes_and_timetable` — `academic_classes` table + `timetable_slots` par `classId`, `academicYear` (dono nullable)
2. `20260819160440_timetable_slot_notes` — `notes` nullable column

**Backfill:** `scripts/backfill-classes.js` (idempotent, default dry-run, `--apply` se likhta hai) ne 2 classes banayin (`8A`, `9B`) aur 60 slots link kiye.

**API endpoints:**

| Method | Path | Access |
|---|---|---|
| GET | `/api/classes`, `/api/classes/:id` | koi bhi signed-in role, tenant-scoped |
| POST/PATCH | `/api/classes`, `/api/classes/:id` | ADMIN/SUPERADMIN |
| PATCH | `/api/classes/:id/archive` | ADMIN/SUPERADMIN |
| POST | `/api/classes/:id/students` | ADMIN/SUPERADMIN |
| GET/POST/PATCH | `/api/timetable/schedule[/:id]` | ADMIN/SUPERADMIN |

Purane `/api/timetable` routes bilkul waise hi hain.

**Conflict detection (`conflictsFor()` in `timetable.controller.js`):** time-range based, half-open `[start, end)` — **08:00-09:00 aur 09:00-10:00 conflict NAHI hain**. Teen types: TEACHER, CLASS, ROOM (room case-insensitive). Create **aur** update dono par chalta hai (pehle sirf create par tha). Purane rows jinke times null hain wo period par fall back karte hain.

**Timetable conflict cleanup (mukammal ho chuka):**
Seeded data mein **9 teacher conflicts** the — Mr. Ali (English ×5) aur Mr. Tariq (Urdu ×4), kyunke unke slots Grade 8-A aur 9-B mein ek hi period par the. Dono classes ke saare 6 periods bhare hue the (koi khali period nahi), is liye sirf swap mumkin tha. **5 swaps** — har din 9-B ka English ↔ Urdu — ne saare 9 conflicts hal kar diye. Ek `prisma.$transaction` mein, temporary period 99 ke through (unique constraint ki wajah se). Sirf 10 rows change hue, sab 9-B ke. Grade 8-A bilkul nahi chhua gaya.

**Current conflict status: teacher=0, class=0, room=0.** Verify karne ke liye: `node scripts/fix-timetable-conflicts.js` (dry-run).

> ✅ **`--apply` ab idempotent hai (2026-08-26 ko fix hua).** Pehle swap plan `sweep(before)` ki
> parwah kiye baghair hamesha propose hota tha, aur wo apna inverse hai — dobara chalane par wohi
> 9 conflicts wapas aa jate. Ab: 0 conflicts par kuch likha nahi jata, aur plan commit se pehle
> **simulate** hota hai — agar count kam na ho to REFUSED, exit 1. Clean timetable par `--apply`
> chala kar verify kiya, 60 rows ka fingerprint yaksan raha.
>
> Script ka pure logic (`sweep`, `simulate`, `total`, `minutes`, `overlaps`) ab **export** hota
> hai aur entry point guarded hai, is liye import karne se database sweep nahi hota —
> `tests/timetablefix.test.js` (14 tests) constructed timetables par chalte hain, asli data ko
> haath lagaye baghair.

**Scoping:** teacher sirf apne slots dekhta hai, parent sirf apne bachche ki class. (Section 6 dekhein — yahan do bugs mile the.)

**Test coverage:** `tests/classes.test.js` — **35 tests**.

---

## 5a. EXAM TERMS (2026-08-26)

Pakistani school saal ka nahi, **term ka** result deta hai. Pehle product mein term ka
koi working concept tha hi nahi — `rolloverTerm()` mojood thi magar **dead code**, kisi
route ya test se call nahi hoti, aur uska comment jhoot bolta hai ("clears the term's
assessments" — wo sirf `currentScore` ko `previousScore` mein copy karta hai).

**Schema (additive migration `20260826092638_assessment_terms`, 0 destructive statements):**

```sql
CREATE TYPE "AssessmentTerm" AS ENUM ('FIRST', 'MID', 'FINAL');
ALTER TABLE "assessments" ADD COLUMN "term" "AssessmentTerm";
CREATE INDEX "assessments_enrollmentId_term_idx" ON "assessments"("enrollmentId", "term");
```

`term` **nullable** hai jaan boojh kar: jo 20 marks terms se pehle record hue, wo kisi
term ke nahi. Unke liye term guess karna tareekh ghadna hota. Wo full-year card par
aate hain, kisi term ke card par nahi.

**Kya term-aware hua:**

| Endpoint | Behaviour |
|---|---|
| `POST /assessments`, `/assessments/bulk` | optional `term` leta hai |
| `GET /assessments?term=` | filter, aur har row apna `term` batati hai |
| `GET /assessments/gradebook?term=` | us term ke columns, **aur us term ka average** |
| `GET /students/:id/report?term=` | poora card us term ka — subject scores, average, GPA, overall grade **aur position** |

**Sab se ahem:** position term ke hisab se badalti hai. Test mein Alia FIRST mein 1st hai
aur Bilal MID mein 1st — kyunke class usi basis par rank hoti hai jo card report karta hai.

**Bina `?term=` ke kuch nahi badla** — card bilkul waise chalta hai jaise terms se pehle
chalta tha (`currentScore` par). Koi mojooda caller mutasir nahi hua.

**Ek cheez jo pakri gayi:** `averageScore` empty set ke liye 0 deta hai aur
`letterGrade(0)` = F. Yani jis term ke marks abhi daale hi nahi gaye, us ka card
**0% / F / 3rd of 3** dikhata — school exam se pehle card print kare to har parent ko F
milta. Ab bina marks wala term `average`, `gpa`, `overallGrade` aur `rank` sab **null**
deta hai, aur card kehta hai *"No marks recorded for this term yet"*.

**UI:** AssessmentModal mein Term dropdown (khaali = "No term"), aur Result Card par
"Reporting period" selector — Full Year / First / Mid / Final. Card ke header par term
ka naam chhapta hai.

**Baqi:** term ke sath **academic year nahi** joda gaya. Wo session/rollover ke kaam ke
sath aayega (blocker list) — abhi session ka koi model hai hi nahi, to sirf term ka
year-scoping aadha feature hota.

---

## 5b. SCORE RECONCILIATION (2026-08-26)

`Enrollment.currentScore` ke do writers hain aur wo aapas mein takra sakte hain:

| Writer | Kya karta hai |
|---|---|
| assessments → `recalcEnrollment` | marks ke average se derive karta hai |
| Quick Grade Entry (`PATCH /subjects/enrollments/:id`) | haath se likha score seedha set karta hai |

**Dono jaayaz hain.** Term grade shaz hi quizzes ka saada mean hota hai, aur schools
kaghaz se grades bhi le kar aate hain. Jo ghalat tha wo ye ke **last write chup-chaap
jeet jata tha** — recorded score apne neeche parre marks ki nafi kar deta aur kisi
screen par is ka koi zikr nahi hota. Result Card ne wo number parents tak pohancha diya.

**Ab kya hai:**

1. **Takrao nazar aata hai.** Result Card aur gradebook dono par `marksAverage`,
   `score` ke saath. Gradebook mein cell ke neeche *"marks say 50%"* likha aata hai
   (sirf tab jab farq ho). `assessmentCount` bhi hai, to "score jiske peeche koi mark
   hi nahi" wala case bhi zaahir hota hai.
2. **Takrao hal ho sakta hai.** `POST /subjects/:id/recalculate` poore subject ke scores
   unke apne marks se dobara bana deta hai (mojooda `recalcSubject` par). Gradebook par
   "Recalculate from marks" button — **sirf tab dikhta hai jab book waqai apne aap se
   takra rahi ho**, aur confirm dialog saaf batata hai ke haath se likhe scores badal
   jayenge aur bina marks wale students waise hi rahenge.

**Permission:** SUPERADMIN, ADMIN, aur **subject ka apna teacher**. Wajah: teacher
pehle se Quick Grade Entry se koi bhi score likh sakta hai — including marks average —
to marks se recompute karna us se **kam** taqatwar hai, zyada nahi. Aur divergence
banti aur dikhti usi ke screen par hai. `findAccessibleSubject` teacher ko uske apne
subjects tak, aur sab ko apne institute tak mehdood rakhta hai (doosre ka subject → 404).

**Kya nahi badla:** dono write paths waise ke waise hain. Ye faisla — ke kaun sa source
jeetna chahiye — abhi bhi khula hai; ye change sirf takrao ko dikhata aur hal karne ka
zariya deta hai.

---

## 5c. SESSION ROLLOVER (2026-08-26)

Pakistani school har March/April mein class ko agli class mein promote karta hai,
kuch students ko retain karta hai, aur sab se upar wali class graduate ho jati hai.
Pehle product ke paas iska koi zariya nahi tha — yani wo **theek ek session** chalta
aur phir developer ki zaroorat parti.

**Schema (migration `20260826152051_session_rollover`, 0 destructive statements):**

```sql
CREATE TYPE "PromotionOutcome" AS ENUM ('PROMOTED', 'RETAINED', 'GRADUATED');
ALTER TABLE "institutes" ADD COLUMN "currentSession" TEXT NOT NULL DEFAULT '2026-27';
CREATE TABLE "student_promotions" (...);   -- + 2 indexes, 3 foreign keys
```

**Kyun history table:** `Student.grade` + `Student.section` hi poore product mein class
membership hai (attendance register, gradebook, timetable, roster — sab isi jori par
chalte hain). Is liye promotion usay **jagah par badalta hai** — aur bilkul isi wajah se
har move `student_promotions` mein likha jata hai. Warna jis class se student aaya tha
wo bas gayab ho jati, aur koi ye jawab na de sakta ke "pichle saal wo kis section mein
thi?"

**Endpoints:**

| Method | Path | Access |
|---|---|---|
| GET | `/institutes/me/session` | koi bhi signed-in — session + har class ka live count + last rollover |
| PATCH | `/institutes/me/session` | ADMIN — school ko agle session mein le jana |
| POST | `/students/promote` | ADMIN — `dryRun` ke sath ya baghair |
| GET | `/students/:id/promotions` | student ka class history |

**`dryRun` sajawat nahi hai.** Ye poori class ek saath hilata hai, is liye UI pehle
server ka apna dry run dikhati hai — kaun kahan ja raha hai — aur commit button tab tak
disabled rehta hai jab tak preview na chale.

**Session badalna promotion se alag rakha gaya** jaan boojh kar: school class-dar-class
kai din mein rollover karta hai, aur session tab band karta hai jab har class nipat
chuki ho. Dono ek button mein jorne ka matlab poora rollover ek irreversible click mein
thoosna hota.

**Jo ye jaan boojh kar NAHI karta:**

- marks, attendance ya fees ko haath nahi lagata — wo student ke sath rehte hain aur
  parhe ja sakte hain. History bachane ka maqsad hi yahi hai.
- naye class ke subjects mein enroll nahi karta. Subjects per-grade hain, to nayi
  enrolments ek alag, soch samajh kar kiya jane wala qadam hai — khud-ba-khud banana
  ek aisa curriculum farz kar lena hota jo kisi ne maanga hi nahi.
- **RETAINED students apni mojooda enrolments marks samet rakhte hain**, kyunke
  `Enrollment` par `@@unique([studentId, subjectId])` hai aur repeat year wahi subject
  rows dobara use karta hai. Is ko theek karne ke liye `Enrollment.session` chahiye —
  jo us load-bearing unique constraint ko todna maangta hai, aur ye is change se bara
  kaam hai. UI is ko sarahatan warn karti hai.

**UI:** Admin → Settings → **Session Rollover** card. Class dropdown har class ka live
student count dikhata hai, agla session khud-ba-khud tajweez hota hai (2026-27 → 2027-28),
aur "Start 2027-28" alag button hai jo confirm maangta hai.

---

## 6d. PROMOTION ENROLS + UNIQUE KEY — Step 4 (2026-08-27)

### Naye saal ke subjects kahan se aate hain

**Destination class ke curriculum se — student ke pichle subjects copy kar ke nahi.**
`Subject` pehle se per-grade hai, to "Grade 9" khud ek curriculum hai. Isay parhne ka
matlab ye hai ke Grade 8 ka subject Grade 9 mein galti se nahi ja sakta — copy karne par
wo jaa sakta tha, khaaskar jab school koi subject retire ya rename kare.

| Outcome | Kya hota hai |
|---|---|
| `PROMOTED` | naye grade ka poora curriculum, naye session mein |
| `RETAINED` | wahi grade dobara — destination usi grade ka curriculum hai |
| `GRADUATED` | kuch nahi; koi destination hi nahi |

RETAINED ke liye alag mechanism nahi banaya. Ek hi usool hai: **destination grade ka
curriculum** — aur repeat karne wale ka destination wahi grade hai. Faida ye bhi hai ke
jo subject school ne is beech add kiya wo repeat karne wale ko bhi mil jata hai.
*Trade-off:* agar kisi bache ko pichle saal koi subject se exemption thi, copy model wo
bachata — curriculum model usay poora curriculum deta hai. Exemption kahin modelled hi
nahi hai, is liye ye maqbool hai.

**Pichla saal bilkul chhua nahi jata:** uski enrolments apne session par rehti hain, aur
unse latke marks, attendance aur invoices ko ye code parhta tak nahi. Promoted student
transaction ke baad **do set** rakhta hai — pichla apne nataij samet, aur naya khali.

Dry run ab batata hai kya banega, aur `Grade 12 has no subjects yet, so they will move
but take nothing until you add some` — khamoshi se kuch na karne ke bजाय.

### Migration `20260827171500_enrollment_session_required`

```sql
-- guard: agar koi enrolment abhi bhi bina session ke ho to RAISE EXCEPTION
DROP INDEX "enrollments_studentId_subjectId_key";
ALTER TABLE "enrollments" ALTER COLUMN "academicSessionId" SET NOT NULL;
CREATE UNIQUE INDEX ... ON ("studentId","subjectId","academicSessionId");
-- FK ab ON DELETE RESTRICT
```

Haath se likhi (Prisma interactive confirmation maang raha tha) taake SQL par control
rahe. Pehli statement ek **guard** hai: koi null bacha ho to migration chalne se inkaar
kar deti hai. `RESTRICT`, `CASCADE` nahi — jis saal mein nataij hain wo saal unke neeche
se delete nahi hona chahiye.

`enrollStudent` ka upsert bhi nayi key par gaya, warna repeat karne wale ko enrol karna
us enrolment ko overwrite kar deta jispar uska purana result tika hai.

### Do bugs jo tests ne pakde

**1. Pichle saal ka rank aaj ki class se ban raha tha.** Promotion ke baad Grade 8 ke
classmates Grade 9 mein ja chuke hote hain, to 2026-27 ka card "1st of 1" kehta.
`StudentPromotion` pehle se `fromGrade`/`fromSection` per `fromSession` rakhta hai, to
purana register usi se dobara banta hai. Aur **pehli** move row jeetti hai: school ek hi
class ko do baar promote kar sakta hai (correction, ya aadhi aadhi), aur baad wali rows
batati hain wo tab kahan tha, ye nahi ke saal ke shuru mein kahan tha.

**2. Jis saal mein koi mark hi nahi, us card par bhi position aa rahi thi.** Sab ka
average 0, aur `classRank` unhein tarteeb de deta tha. Code ka apna comment ye dalael
pehle se *term* card ke liye deta tha; naya session bilkul wahi soorat hai poore card ke
liye. Ab ek hi sawal dono ko cover karta hai: `scoreFor(e) !== null` — koi ek mark hai
jis par khare ho sakein?

`reportcard.test.js` ka ek test isi par toota. Usay naye usool par dobara likha — kamzor
nahi kiya, **ek assertion barhai**: bina marks wale ka `rank` aur `average` dono null,
aur jinki position hai un mein 1..n har jagah theek ek baar.

### Frontend: session picker

Result Card par session dropdown — sirf tab dikhta hai jab student ke paas ek se zyada
saal hon. Saalon ki list **server card ke sath bhejta hai**, aur wo bhi *us student ke*
saal, poore school ke nahi: jis saal mein bacha tha hi nahi, us ka khali card offer karna
reader ko ye farq hi na batata ke "abhi marks nahi" ya "tab yahan tha hi nahi".

Session ka naam **chhape hue card par** bhi hai, sirf picker par nahi — warna screen se
nikalte hi pichla card is saal wale se alag pehchana hi na jata.

**Browser mein verify hua** (do-saal wala throwaway school):

| | 2027-28 (current) | 2026-27 |
|---|---|---|
| Class | Grade 9 A | Grade 8 A |
| Mathematics | 58 (C) | 92 (A+) |
| Overall | 58% | 92% |
| Position | **2nd of 2** | **1st of 2** |

Position palat jati hai, kyunke Grade 8 mein Ayesha aage thi aur Grade 9 mein Hamza.

### Suite ki susti — qat'i jawab

Section 6c mein likha tha ke dev server suite ko dheema karta hai. Ye dobara hua aur
**qat'i taur par confirm** ho gaya: `pkill` (Git Bash se) Windows ke node processes tak
nahi pohanchta, aur `preview_start` unhein wapas chala deta hai. Chha watcher process
chalte hue suite **463s** (ek test 262s); PowerShell `Stop-Process` se sab band kar ke
wahi suite **147s**.

> Bara test run karne se pehle: `Get-Process node,esbuild | Stop-Process -Force`.
> Git Bash ka `pkill` is machine par kaafi nahi hai.

---

## 6c. SESSION-SCOPED READS — Step 3 (2026-08-27)

**Manzil poori hui:**

```
GET /students/:id/report                  → Grade 9, 2027-28
GET /students/:id/report?session=2026-27  → Grade 8, 2026-27
```

Dono mukammal card — apne marks, apni attendance, apni fees, apni position. Aur position
dono saalon mein **ulti** aati hai (Grade 8 mein Ali aage, Grade 9 mein Sana), jo sabit
karta hai ke scoping asli hai, ittefaq nahi.

### Kya scope hua

| Kahan | Kya |
|---|---|
| Result card | enrolments session se; attendance `startsOn`/`endsOn` se; fees period range se; rank cohort wahi saal |
| Student list + detail | is saal ke subjects, is saal ki rank |
| Gradebook + mark record | jis saal ka mark hai usi ka enrolment |
| Parent portal aur dashboard | is saal ke subjects |
| Teacher workload aur My Classes | is saal ka roster |
| Admin/teacher/parent dashboards, institute report | is saal ke aankray |
| AI insights | is saal ke subjects |

**Jaan boojh kar scope NAHI kiya: `utils/access.js`.** Wo tay karta hai ke ye student
kis ka hai — saal ka sawal nahi. Session se bandhne par teacher pichle saal ka result
card khol hi na paata.

### Do usool jo is kaam ne tay kiye

**1. Read kabhi write na kare.** Pehla design `ensureCurrentSession` (jo row banata hai)
ko har list par chala raha tha. Ek plain `GET /students` ko insert kar sakne wala bana
dena ghalat hai. Ab:

- `readSessionId()` — sirf parhta hai, na mile to `null`
- `sessionFilter(id)` — `null` par `{}` deta hai, yani **koi filter nahi**
  (`academicSessionId: null` likhna ulta hota: sirf wo rows milti jinka session hai hi nahi)
- `ensureCurrentSession()` — sirf write paths: signup, onboarding, enrol, session settings

Aur session ab **school bante hi** ban jata hai (signup aur super-admin onboarding dono
mein, usi transaction mein), to baad ka koi lookup kabhi likhta hi nahi.

**2. Jo school ka koi session record na ho, wo pehle jaisa chalta hai.** `sessionFilter`
ka `{}` fallback yehi karta hai — koi purana institute toota nahi.

### Ek bug jo test ne pakda

`session` ko `createAssessmentSchema` mein add kiya, magar controller usay `...data` ke
sath seedha `assessment.create` mein spread kar raha tha — Assessment par aisa koi column
nahi, to Prisma ne 400 diya. Destructure mein se nikala. **Wahi sabaq jo fee wale
`student.connect` par tha:** validator strip kare to controller dekhta hi nahi; validator
gher de to controller ko sambhalna parta hai.

### Ek jhoothi pagdandi — likh raha hoon taake koi phir na jaye

Beech mein poora suite **237 minute** le gaya (`import 909s`), aur hang hone wala test
har baar badalta raha. Maine samjha mere session changes ne kiya. Postgres se poocha:
**2-5 connections, zero lock waits** — DB bilkul faarigh. Asal wajah: **dev server chal
raha tha**, nodemon `src/` watch kar raha tha jabke mere patch scripts usi mein likh rahe
thay — har baar restart, aur 12 vitest workers ke sath Windows file I/O par ladai.
Dev server band karte hi wahi suite **89 second**. `import` 909s → 20s.

> Bara test run karne se pehle dev server band karo. Aur "dheema hai" ka ilzaam apne
> aakhri change par lagane se pehle DB se pooch lo ke wo kya kar raha hai.

### Aage (Step 4)

- promotion khud naye session ke enrolments banaye (abhi admin haath se enrol karta hai)
- **phir** column NOT NULL aur `@@unique([studentId, subjectId, academicSessionId])` —
  yehi RETAINED student ko wahi subject dobara lene dega
- frontend par session picker (card par pichla saal chunna)

---

## 6r. SCALE — 1,200 bachon par naapa gaya (2026-08-31)

Poore project mein har cheez **chhe** students ke against dekhi gayi thi. Asli school
mein sainkron hote hain, aur kuch queries jaan boojh kar unbounded hain — student list
har request par poora cohort uthati hai, kyunke page-local rank bemani hota. Ye faisla
durust hai, aur wahi sab se pehle girne wali cheez bhi ho sakti thi. To naap li gayi.

`scripts/scale-probe.js` ek poora school banata hai, har screen ka waqt leta hai, aur
school purge kar deta hai:

```
1,200 students · 40 teachers · 80 subjects
9,600 enrolments · 28,800 marks · 72,000 attendance rows · 3,600 challans
```

### Natija — sab tez hai

```
GET /students (page 1)      272 ms      GET /dashboard/admin     317 ms
GET /students (page 20)     200 ms      GET /teachers            244 ms
GET /students/:id            39 ms      GET /fees (page 1)        94 ms
GET /students/:id/report    189 ms      GET /fees/stats           30 ms
GET /attendance/summary      48 ms      GET /subjects            105 ms
GET /attendance (page 1)     60 ms
```

Koi endpoint 350 ms se upar nahi. **Scale wali fikr, jo "launch ke qaabil hai?" wale
jawab mein chaar mein se ek thi, bunyadi tor par door ho gayi.**

### ⚠ Aur ek jaal, jo mujhe khud phansa gaya

Pehli teen runs mein ye report ho raha tha:

```
GET /attendance/summary   10,558 ms → 11,435 ms → 12,045 ms
GET /attendance (page 1)   9,766 ms →     49 ms → 11,484 ms
```

Ek hi endpoint ek run mein 9.8 second aur agli mein 49 millisecond — **bina kisi code
change ke**. Yehi ishara tha ke naap ghalat hai, endpoint nahi.

Wajah: probe ek lakh se zyada rows likhne ke **foran baad** naapta tha. Us waqt Postgres
ke paas us naye data ke koi statistics nahi hote, to planner andaza lagata hai — aur bura
andaza lagata hai. Asli school ke database mein autovacuum ye statistics current rakhta
hai.

`ANALYZE` add karte hi dono endpoints **48 ms aur 60 ms** par aa gaye.

> **Sabaq:** bulk insert ke foran baad naapna database ko us halat mein naapna hai jismein
> wo asli zindagi mein kabhi nahi hota. `ANALYZE` chalayein, warna aap apni hi seeding ka
> waqt naap rahe hain.

### Ek behtari jo rahi, aur ek jo wapas li gayi

**Rahi — `attendance/summary` ab database mein ginta hai.** Wo har matching row Node mein
utha kar JS mein tally karta tha. Alag se naapa gaya, warm cache ke sath:

```
findMany + Node mein tally    868 ms    72,000 rows
groupBy (date, status)        311 ms       120 rows
```

3× tez aur **600× kam data** wire par. Ye tab bhi durust hai jab planner ke paas statistics
hon — is liye rakha gaya. Rate ka usool ab bhi ek hi jagah hai (`summaryFromCounts`), chahe
ginti Node ne ki ho ya Postgres ne.

**Wapas li — `listAttendance` ka `orderBy`.** Maine `student: { name: "asc" }` hata kar
`id` kar diya tha, us 9.8-second wali reading ki bunyad par. Statistics theek hone ke baad
naapa:

```
orderBy date, id             10 ms
orderBy date, student.name   19 ms
```

Nau milliseconds. Us ke liye din ke register ko naam ki tarteeb mein padhna chhorna
bemani tha, so wo sorting wapas hai.

### Frontend — asli qeemat yahan mili

API tez tha, magar browser ka hisaab alag nikla. `useDb.js` portal khulte hi
`fetchAll(api.students.list)` chalata hai — har page, poora cohort. 1,200 bachon par:

```
page 1: 771 KB  ×  6 pages  ≈  4,630 KB har portal load par
```

Har student ke sath 3,941 bytes ja rahe the:

```
subjects  1783      fees  1216      weekAttendance  336
institute   96      attendance 65      naam/roll/grade ~60
```

Yani jo list row waqai dikhata hai, wo payload ka 3% tha. Do cheezein bilkul be-maqsad thin.

**`weekAttendance` — banti thi, bheji jati thi, koi nahi parhta tha.** Poori `App.jsx` mein
`weekAtt` sirf ek jagah parha jata hai (ParentPortal), aur parent portal apna data
`api.students.get(id)` — detail endpoint — se leta hai (`useDb.js` line 182,
`toLegacyStudentFull`). List wali copy kabhi kisi screen tak pahunchti hi nahi thi.

**`fees` — bara payload, aur ghalat jawab.** Roster ka badge ye poochta tha:

```js
s.fees.some(f => f.status === "pending") ? "Pending" : "Paid"
```

Is ek badge ke liye list har student ke sath baarah poore challan bhejti thi. Aur jawab
phir bhi ghalat tha: enum mein `PENDING` aur `OVERDUE` **dono** paise wajib hain
(`utils/fees.js`, `isOutstanding`), magar OVERDUE `"pending"` ke barabar nahi — **to jis
khandaan ko daftar ne sab se pehle dekhna hota hai, us ka row "Paid" kehta tha.** Nakami
mehfooz taraf ishara karti thi, isi liye kisi ki nazar nahi pari.

Jawab pehle se usi row par mojood tha: `duesOutstanding`, jo server apni alag chhoti query
se PENDING + OVERDUE balances jama karta hai.

```
purana:  fees.some(status === "pending")  ->  "Paid"
naya:    dues > 0                         ->  "Pending"
```

### Natija — payload aadha

```
fi student:        3,941 -> 2,079 bytes   (47% kam)
page 1:              771 KB -> 464 KB
har portal load:   4,630 KB -> 2,784 KB   (~1.8 MB bachat)
```

List ka `feeInvoices` include bhi gaya, to database ka kaam bhi kam hua. 877/877 tests
pass; `tests/overdue.test.js` mein do naye tests ise pin karte hain.

### Jo bacha hai, us ka 86% `subjects` hai

2,079 bytes mein se 1,783 `subjects` ke hain. Ye kaatna utna aasan nahi: teacher portal
har student par apna subject dhoondta hai — `App.jsx`,
`s.subjects.find(x => x.teacherId === teacher.id)`. Is ke liye ya to list sirf poochne
wale teacher ka subject bheje, ya teacher portal apni roster alag endpoint se le. Dono
asal kaam hain, andaza nahi — is liye ye **naapa hua** chhor raha hoon, **kiya hua** nahi.

### Jo ab bhi naapa nahi gaya

- **React ka apna waqt** — payload naapa gaya, render nahi. 1,200 rows ki table browser
  mein kitni der leti hai, wo alag sawal hai.
- **Concurrent load** — ek waqt mein ek request naapi gayi. Subah 8 baje pandra teacher
  ek sath register kholte hain, wo alag cheez hai.
- **auditLog ka barhna** — 55,000+ rows par ek `count()` aaj timeout kar chuka hai
  (section 13).

---

## 6x. EK SCHOOL, KAI CAMPUS — aur asli jaisa data (2026-08-31)

User: *"aik school ki multiple branches b ho skti, uska solution nikalo aur uspe b testing.
koi bug nai chahiye."*

### Faisla: branch **tenant nahi**, institute ke andar taqseem hai

Teen imarton wale school ke paas pehle do hi raaste the:

```
teen alag institutes  →  teen login, teen subscription, koi mushtarak roll nahi
ek institute          →  ye bata hi nahi sakte ke bacha kis imarat mein hai
```

Dono wo nahi jo school maang raha tha. To **institute hi wo hadd rahi jis se har query
scope hoti hai** — yehi cheez saari multi-tenancy ki mehnat bachati hai — aur branch us ke
andar ek filter hai. Controller mein gyara scoped reads hain, aur spec sabit karta hai:
scoping hataate hi **chhe tests fail** ho jate hain.

### Poora feature opt-in hai

`branchId` students aur teachers par nullable hai. Campus filter sirf tab render hota hai
jab school ke campuses hon, aur management card **Settings mein** hai — na ke chaudhwan
tab jo koi kholta hi nahi. **Ek imarat wale school ko wahi product dikhta hai jo kal tha.**

### Do usool jo transaction ke andar hain

**Campus band karne se log band nahi hote** — `SET NULL`, cascade nahi. Jis bachay ki
imarat band hui wo *bila-campus bacha* hai, *gaya hua bacha* nahi; hataana alag screen ka
alag button hai. Endpoint batata hai kitne unassign huye.

**Sirf ek main campus**, usi transaction mein jo doosra set karta hai — do hone se "naya
bacha kahan jayega" row order par chala jata.

### Asli jaisa data — Kaggle ke baghair

Kaggle ke liye API token chahiye jo is machine par nahi, aur main user se key mangwa kar
khud daalne wala nahi. Jo public name datasets bina auth ke milte hain wo American aur
Spanish hain — un se Lahore ka school Jennifers se bhar jata.

To `scripts/seed-realistic.js`. `scale-probe` ye batata hai ke "jhelta hai ya nahi" aur har
bachay ka naam Student 417 rakhta hai — timing ke liye theek, screen dekhne ke liye
bekaar: har row ek jaisa sort hota hai aur har search har cheez se match karti hai.

```
Roots Grammar School · 3 campuses · 2000 students · 30 teachers
12,000 enrolments · 60,000 attendance · 6,000 challans · 8.2s

Basit Rashid · Iqra Tariq · Hussain Raza · Sadia Malik · Ehtisham Iqbal
```

### Naapa gaya

```
GET /students (page 1)     325 ms      GET /dashboard/admin   430 ms
GET /students?branchId     245 ms      GET /teachers          292 ms
browser: 2000 → 667 rows ka campus filter   155 ms
mobile: chaudah screens, sifar overflow
```

### Do cheezein jo isi kaam mein pakri gayin

**`db:verify` mein branch add karna bhool gaya tha** — aur ek test hai jo yaqeeni banata
hai ke schema ka har model gina jaye. Us ne mujh se pehle pakar liya.

**Section heading ke buttons phone par title par charh rahe the.** `SecHead` ek flex row
hai; 26px serif title aur do buttons 375px mein nahi samate the. Phone par ab column hai.

### Ek side effect jo khud sabaq hai

Vacuity check ke liye jab maine jaan boojh kar scoping hatai, us run mein spec ne **demo
school ka campus dhoondh kar rename kar diya** ("Taken"). Yani test ne apni baat khud
sabit kar di — aur ye yaad dahani bhi ke scoping hataana asli asar rakhta hai. Naam wapas
kar diya gaya.

---

## 6w. URDU — sirf walidain ke liye (2026-08-31)

Admin aur teachers saara din English software chalate hain. Jo walid ye dekh raha hai ke
uska bacha aaj ghair-haazir tha ya nahi, us ne English ka intekhab nahi kiya tha — aur
zyadatar Pakistani gharon mein wahi wo fard hai jise English-only screen sab se kam kaam
deti hai. Is liye **parent portal Urdu bolta hai, aur sirf parent portal**.

### Paimana — jo dara raha tha, wo tha nahi

```
ParentPortal   820 lines
strings        ~160  (nav, labels, jumle, ginti wale phrases)
```

Poori app ka i18n nahi — ek portal. `src/i18n.js` mein ek table aur `t()`, koi library
nahi: **ek dependency is table se zyada wazni hoti**.

### Do faisle jo ahem hain

**Layout RTL nahi kiya.** Browser Urdu ko apne run ke andar khud dayen-se-bayen rakhta
hai, chahe page bayen-se-dayen chale. To alfaz durust parhe jate hain **1,889 inline
styles ko chhue baghair** — aur adhoora RTL flip saaf LTR page se kahin bura parhta hai.
Agar kabhi poora product tarjuma ho, tab flip karna.

**Ginti wale jumle `{n}` rakhte hain**, jori nahi jate — kyunke Urdu adad wahan rakhti hai
jahan English nahi:

```
"of {n} students"  →  "{n} طلبہ میں سے"      (na ke "of 5" ka seedha tarjuma)
```

Isi wajah se greeting ka lead-in Urdu mein khali hai aur tail poora jumla uthata hai:
**"Fatima کے تعلیمی سفر کی مکمل تفصیل۔"** — na ke lafz-ba-lafz tarjuma jo mashini lagta.

### Isolation — maan kar nahi, naap kar

Zabaan device par mehfooz hoti hai (`localStorage`), to khatra ye tha ke walid ke Urdu
chunne par usi phone par teacher ya admin ko bhi Urdu mile. Naapa gaya:

```
storedLang: "ur"   →  teacher portal: teacherSeesUrdu = false
                      admin bar: Dashboard · Students · Teachers · Parents · More
                      anyUrduOnScreen = false
```

Bottom bar ke "More" aur "Log out" **props se aate hain**, `t()` se nahi — bar chaaron
portals share karte hain, aur `t()` seedha lagane se wahi leak banta.

### Do dafa ek hi ghalti

`src.replace()` sirf **pehla** match badalta hai. Greeting pehle teacher portal par lagi,
aur `moreLabel` admin ke Shell par — dono dafa leak banta. Dono pakre aur theek kiye; jo
patch multiple portals ko chhoo sakta ho, us mein index se target karna chahiye.

### Aur ek asli bug jo isi jhaaru mein mila

Profile card par AI Score **"null / 100"** dikha raha tha. Section 6u mein jab ye theek
kiya gaya tha to teen mein se do readouts guard huye the — ye teesra tha. Ab teenon
guarded hain.

### Kya tarjuma nahi hota

School ka apna likha hua matn — notice ka mazmoon, message ke subject, teacher ke naam,
"Mother". Wo school ne likha hai, product ne nahi.

---

## 6v. PHONE PAR ASLI APP — parent aur teacher ke liye (2026-08-31)

User: *"parents and teacher have to use it on mobile phones, make it more responsive like a
professional app."*

Durust nishandehi. App phone par bhi desktop wali navigation de raha tha.

### Kya masla tha

```
375px screen par:
  icon rail                     64px   (17%)   — collapsed hone ke bawajood
  main ki padding + page div    48px           — dono alag alag laga rahe the
  bacha                        263px
landing sections ki padding    128px           — screen ka 34%
har grid ek column                             — chaar KPI cards = chaar screens
```

Aur rail screen ke **oopar-baayen** kone mein tha — us haath se sab se door jo phone
pakre hue hai.

### Kya kiya

**Bottom tab bar, 640px se neeche.** Rail hat jata hai; chaar screens bar mein, baqi aur
logout ek "More" sheet mein — kyunke nau targets wali bar par koi ungli theek nahi
lagti. Content ko poori chaurai mil jati hai.

```
parent   Dashboard · Attendance · Grades · AI Insights · More
teacher  Dashboard · My Classes · Grade Book · Attendance · More
admin    Dashboard · Students · Teachers · Parents · More      (badges ke sath)
```

Deep links barqarar: sheet se Timetable dabane par `#/timetable` likha jata hai, to Back
ab bhi screens se guzarta hai.

**Chhote card rows jori mein.** Wo blanket rule jo phone par har grid ko ek column karta
tha, KPI tiles par se hata — ek lafz aur ek number ke liye chaar screens dena bemani tha.

**Landing aur page padding phone ke naap par.**

```
                    pehle    ab
landing page      7.6 screens  6.0
admin dashboard        —       3.4
parent dashboard       —       2.0
kaam ki chaurai      247px    300px  (landing) / poori (portals)
```

### Teen cheezein jo naapne se pakri gayin

**`1fr` asal mein `minmax(auto,1fr)` hai.** Pehli jori mein columns `207px` aur `179px`
bane — ek 247px ke box mein. Cards kat rahe the aur `overflow-x:hidden` usay chhupa raha
tha. `minmax(0,1fr)` ne hal kiya.

**Jori bana kar KPI tile ~100px ka reh jata hai**, aur us mein desktop ka padding aur 28px
serif fit nahi hota — **"Growth" seedha card se bahar nikal raha tha**. Phone par tile
compact hai aur sajawati glyph raaste se hat jata hai.

**`main` ki koi apni padding nahi thi** jab tak ek mobile rule ne di — aur page div apni
desktop wali 34px rakhe hue tha. Yani phone 48px per side de raha tha. Ab ek hi jagah
padding hai, aur neeche bar ke liye jagah.

### Jo aazma kar wapas kiya

Landing ke feature cards jori mein daale the — 157px par wo **zyada tang aur zyada lambe**
ho gaye, yani ulta natija. Poori chaurai par wapas.

### Desktop bilkul nahi chhua

Har rule 640px se neeche hai. 704px par rail ab bhi 64px ka hai, bottom bar mojood nahi,
aur tiles par wahi `20px/22px` padding, 28px value aur icons — naap kar dekha.

---

## 6u. DEPLOY SE PEHLE POORA AUDIT — 2,000 bachon par (2026-08-31)

User: *"saare app check kro, responsive bnao, har cheez logical honi chahiye, 2000 bachay
ka data add kro — is test ke baad deploy krdunga."*

`scripts/scale-probe.js --keep --students 2000` se ek poora school bana:

```
2000 students · 40 teachers · 80 subjects
16,000 enrolments · 48,000 marks · 120,000 attendance · 6,000 challans   (32 s mein)
```

### API — sab qaabu mein

```
GET /dashboard/admin   449 ms      GET /students (page 1)    357 ms
GET /teachers          343 ms      GET /students/:id/report  251 ms
baqi sab 250 ms se neeche
```

### Browser — bhi qaabu mein

```
2,000 rows ka render      504 ms
2,000 mein search         67 ms     ("1 student of 2000")
poora portal load       ~3.6 s      (10 pages, ~4.5 MB JSON, gzip ke baad ~300 KB)
Academic Report CSV       chal gaya — "2000 students, overall average 69.6%"
```

Client-side filter ka faisla (section 6s) yahan sabit hua: 2,000 par bhi 67 ms.

### 🔴 Jo mila — teacher ka dashboard sifar dikhata tha

Teacher portal par tazad tha: dashboard ne kaha *"MY CLASSES 1"*, aur My Classes tab ne
kaha *"You aren't assigned to any classes yet."* Dono API se poocha:

```
GET /dashboard/teacher    →  classes=0  students=0  subjects=2
GET /teachers/me/classes  →  rows: 0
```

Mr. Hassan ke paas 2 subjects aur 4 enrolments hain.

Wajah: dono routes khud ko teacher se scope karte hain, is liye **`scopeToInstitute`
chalta hi nahi** aur `req.instituteId` undefined rehta hai. Dono ne usi se session maanga.
**Prisma undefined field ko where se gira deta hai**, to query ban gayi *"kisi bhi institute
ka pehla current session"*:

```
readSessionId(undefined)  →  "2026-27" session, school: garrison        ← doosra school
Hassan ka apna school     →  "2026-27" session, school: Beaconhouse

us ghalat session mein Hassan ke enrolments:  0
apne session mein:                            4
```

Ye **ek school wale database par kabhi nahi dikhta** — sirf production mein. Dono callers
theek kiye, aur zyada kaam ki baat, jar bhi: `currentSession` ab null deta hai jab koi
school na bataya jaye, taake agla bhoolne wala route kuch na paye — kisi aur ka saal nahi.
`tests/tenantsession.test.js` ise pin karta hai; paanch mein se teen fix ke baghair fail
hote hain.

### 🔴 Aur — "koi marks nahi" ko "Excellent" kaha ja raha tha

Parent portal par ek hi screen par:

```
AVERAGE      0%       Across all subjects
CLASS RANK   —        No marks recorded yet
AI SCORE     100/100  Excellent            ← ?
```

AI score 100 se shuru hota hai aur har concern par kaTta hai. Jis bachay ko kisi ne marka
hi nahi, uske koi concerns nahi — to 100/100. **Data ka na hona kamaal ban kar dikh raha
tha**, us sameen ke saamne jo sab se kam jaanch sakta hai. Ab wo bhi "No marks recorded
yet" kehta hai. Marks wale bachay ka hisaab bilkul waisa hi hai (severity 3 + 2 = 15 kaTa
→ 85).

### Aur do chhoti cheezein

- **Notices ka koi empty state nahi tha** — sirf heading aur khali jagah.
- **Teacher profile "1 Classes" kehta tha** — `count()` helper pehle se maujood tha.

### Responsive — jaancha gaya

```
375px  landing (hero, cards, footer) · admin dashboard · teacher dashboard
700px  parents table — pinned Actions ke sath
900px  parents/students tables poore
1280px koi overflow nahi
```

### Jo jaan boojh kar nahi badla

- **`docs/original-artifact.jsx`** — asal prototype ka record. Chalta hua code nahi.
- **Platform MRR = ACTIVE institutes ke plan prices** — school bank transfer se bhi pay
  kar sakta hai, is liye "Not subscribed" hone par bhi ginna durust hai (comment mein
  pehle se tay shuda).
- **Scale-probe ka fee data** theek kiya gaya (PAID challan ab `paidAmount` rakhta hai),
  kyunke us ke baghair fee screen "48m invoiced, 0 collected" dikhata tha — aisi arithmetic
  jo asli school kabhi nahi bana sakta, kyunke `payInvoice` hamesha amount likhta hai.

### Frontend ka koi test harness nahi

Backend par 884 tests hain; frontend par sifar. AI-score wala fix adapter ko seedha chala
kar dono taraf sabit kiya gaya, magar wo CI mein nahi chalta. Ye sab se bara khala hai jo
is audit mein khula.

---

## 6t. TEEN CHEEZEIN JO USER NE PAKRIN (2026-08-31)

### 🔴 1. "Parent delete pe click hi nahi hota"

Pehle sab kuch theek nikla: backend `DELETE /api/parents/:id` → 200, `pressable` durust,
`removeRow` jura hua, aur browser mein ✕ dabate hi 200 aur list 6 se 5. To shikayat kis
cheez ki thi?

Naap kar dekha:

```
 700px  →  display:block, table apna scroll region, Actions pahunch mein
 900px  →  display:table, table 947px chauri, viewport 900
           actionsRight = 900, visible = FALSE, aur koi scrollbar nahi
1280px  →  overflow hi nahi, sab theek
```

A§9 tables ko **768px se neeche** scroll region banata hai. Us breakpoint aur ~1100px ke
darmiyan table page se chaura tha magar scroll region **nahi** tha — yani aakhri column
seedha kat jata tha aur us tak pahunchne ka koi raasta nahi hota. **Aam laptop par delete
button ka wajood hi nahi tha.** "Click nahi hota" bilkul durust bayan tha; button wahan tha
hi nahi jahan dekha ja raha tha.

Do cheezein lagayin, aur dono zaroori hain:

- `scrollTable` — students aur parents tables **har chaurai par** apna overflow khud
  sambhalti hain, sirf phone par nahi.
- `stickyCol` — Actions column right edge par pinned, opaque background ke sath (warna
  scroll hoti columns us mein se aar-paar dikhtin).

### 2. Recycle Bin mein permanent delete

Bin pehle se maujood tha aur Restore chalta tha; jo nahi tha wo hamesha ke liye hatane ka
raasta. Us modal ka apna comment kehta tha ke ye **jaan boojh kar** nahi rakha gaya. User
ne maanga, to faisla palta — magar mehfooz tareeqe se.

Backend mein teen naye endpoints (pehle sirf institutes ke liye purge tha):

```
DELETE /api/students/:id/purge      DELETE /api/teachers/:id/purge
DELETE /api/parents/:id/purge
```

Har ek do baaton par ada'a karta hai: record **pehle se bin mein ho** (warna 400, taake
roster se ye door khule hi nahi), aur **apne hi institute ka ho** (warna 404). Jo tabah
hota hai wo ginti ke sath wapas aata hai, taake confirmation asli qeemat bata sake:

```
student → enrollments, attendance, feeInvoices  (Cascade)
teacher → subjects aur periods bacha rehte hain, unassigned; login jata hai
parent  → bachay pehle hi unlink ho chuke; guardian aur login jate hain
```

UI mein browser `confirm` nahi — row apni jagah poochta hai: **"Delete for good? [Yes,
delete] [Keep]"**. Sawal usi record se chipka rehta hai jis ke bare mein hai.

Bin ka intro bhi theek kiya: ab "kept, not destroyed" ke bajaye dono darwaze bayan karta
hai.

`tests/softdelete.test.js` mein chaar tests — aur guard hata kar sabit kiya ke pehla test
waqai fail hota hai.

### 3. GPA/CGPA nikal diya — Pakistani schools percentage chalate hain

User: *"schools colleges mein gpa nai chalta, percentage chalti hai."* Durust hai, aur
poore product se nikal diya — sirf chhupaya nahi.

```
frontend  13 maqamat  →  percentage (average)
backend    8 response fields, grading.js ka gpa(), academics.js ka calculateGpa()
tests      2 describes hataye, 2 assertions, 1 test ka naam
```

Har us jagah `average` pehle se maujood tha jahan `gpa` tha, is liye badalna saaf raha.
Parent portal ka bara card ab "Current Average" hai aur us ka progress bar 100 ki taraf
jata hai, `4.0` ki taraf nahi.

**Letter grades nahi hatai gayin** — A+, A, B asli Pakistani result card par chalte hain,
aur school ki apni bands `gradingFor(institute)` se aati hain (section 6f). Sirf grade
points ka *average* gaya, bands nahi.

---

## 6s. ROSTER SEARCH — aur jo us ne nikala (2026-08-31)

Sawal saada tha: *"admin ke paas student ya parent search karne ka option hona chahiye
ya nahi?"*

Jawab dene se pehle dekha ke hai kya. Students aur Parents tabs par **teen buttons, phir
poori table** — koi search nahi, koi filter nahi, **koi pagination nahi**. 1,200 bachon
wale school mein ek bachay tak pahunchne ka tareeqa browser ka Ctrl+F tha. Poori app mein
search sirf ek jagah thi: Classes screen (`App.jsx:4030`), aur wahan theek bani hui thi.

Aur backend mein search **pehle se maujood** thi, dono jagah:

```
GET /students   name · rollNo · code        (case-insensitive)
GET /parents    name · email · phone · code
```

Sirf UI se koi poochta nahi tha.

### Client-side, server-side nahi — aur kyun

Pehla mashwara server-side ka tha, is dalil par ke payload bhi theek ho jayega. **Wo
jaldbazi thi.** `useDb` portal khulte hi poora cohort utha leta hai kyunke reports,
register aur parent lookups samet **63 jagah** `db.students` parhti hain. Us soorat mein
server-side search payload kam nahi karti — ulta har keystroke par ek extra request bhi
jorti hai, aur students ka doosra source of truth bana deti hai.

Rows pehle se haath mein hain, is liye filter wahin hota hai: fori, bina network ke, bina
debounce ke, aur mutations ka `onReload` pehle se kaam karta hai. Agar kabhi roster ne
poora set lena chhor diya, to ye `search` parameter par chala jayega jo dono endpoints
pehle se qubool karte hain.

### 🔴 Aur is ne ek asli bug nikala — Recycle Bin ka bacha, live roster par

Grade dropdown mein sirf "Grade 10" tha, magar Parents screen par **Ayesha Khan · Grade 9 B
· Roll 2024-092** ek parent ki child bani hui thi. Database: wo **26 August se soft-deleted
thi**.

Wajah wahi jo is codebase ko teen dafa kaat chuki hai — soft-delete extension query ka
sirf **top-level `where`** badalta hai. Relation ke zariye aane wala student jo bhi
`deletedAt` rakhta ho, aa jata hai. Is codebase mein students ka **har `_count`** ye filter
khud likhta hai; parent ke includes mein reh gaya tha:

```
parent.controller.js:42    listParents   -> roster par live bacha, aur childrenCount bhi ghalat
parent.controller.js:64    getParent     -> parent detail
dashboard.controller.js:480 parent dash  -> guardian ke apne portal par
```

Teenon par `where: { deletedAt: null }` laga. `tests/removedstudent.test.js` mein teen
tests ise pin karte hain — aur fix hata kar sabit kiya gaya ke **teenon fail hote hain**.

**Ulta case check kiya, wahan bug nahi.** `deleteParent` pehle bachon ko unlink karta hai
(`parentId: null`), phir parent ko soft-delete, phir uska login band. Is liye koi student
kisi deleted parent ki taraf ishara kar hi nahi sakta, aur fee reminder bhi
`parent.user.isActive` dekhta hai. Yani filter sirf `Parent -> students` ko chahiye tha:
**parent hataane par link tootta hai, student hataane par nahi** — taake restore chale.

### Ek nafa jo saath aaya

Roster ka fee badge `s.fees.some(f => f.status === "pending")` poochta tha. Ab
`dues > 0` — jo `duesOutstanding` se aata hai. Tafseel section 6r mein.

### ⚠ Aur ek cheez, jo test ne nahi, *guard* ne pakri

Kaam ke beech `reportcard.test.js` fail hua: *"beforeAll did not complete — every test in
this file is vacuous"*. Ye wahi guard hai jo 33 files mein lagaya gaya tha.

Ye code ka regression nahi tha. Demo school ka data badal gaya tha — ek `PATCH
/api/parents/:id` (audit: `parent.update`, `admin@bhs.edu`, 09:23:26 UTC) ne **paanchon
live students ek hi parent par daal diye the**. Sara Ahmed ke paas koi bacha nahi bacha,
aur us file ka fixture `sara@gmail.com` ke ek *marked* bachay par khara hai — to `beforeAll`
ruk gaya.

Suite ke wo 16 specs jo demo school par chalte hain, sab check kiye: **koi bhi parent PATCH
nahi karta**. Ye suite ne nahi kiya.

Links `prisma/seed.js` ke mutabiq wapas lagaye gaye (`parentCode`), aur haath se banaye
gaye do students unki pichhli jagah par:

```
STU001 Zain Ahmed   -> Sara Ahmed          (seed)
STU003 Bilal Raza   -> Nida Raza           (seed)
STU004 Hania Malik  -> Nida Raza           (seed)
STU007 Fatima       -> Sara Ahmed
STU006 shanawar b.  -> saleem iqbal bhatti
```

> **Sabaq:** guard ne theek wahi kiya jis ke liye banaya gaya tha. Us ke baghair us file ke
> 16 tests khamoshi se hare tick dikhate rehte, jabke unmein se koi bhi chala hi nahi tha.

---

## 6q. PRODUCT POLISH — presentation ka audit aur fixes (2026-08-31)

User ne kaha: *"Mujhe 'FYP project jo achha bana hua hai' nahi chahiye — professional SaaS
product wali presentation chahiye."* Aur pehle audit maanga, phir fixes.

### Audit ka natija — zyadatar cheezein pehle se theek thin

Ye likhna zaroori hai, kyunke agla banda yehi farz karega ke sab kuch kharab tha:

| poocha gaya | mila |
|---|---|
| FYP / student-project wording | **sirf ek jagah** (neeche). `FYP`, `Prototype`, `Testing only`, `Not for production` — kahin nahi |
| demo credentials UI mein | **production bundle mein 0 hits.** `DEMO_LOGINS_ENABLED` gate pehle se tha aur `seedguard.test.js` usay pin karta tha |
| developer/debug wording | koi nahi. UI text mein `TODO`/`FIXME` nahi, raw `e.message \|\|` fallback **0**, koi "Something went wrong" nahi |
| empty/error states | pehle se context-aware: *"Nothing outstanding — every invoice is settled"*, *"No invoices have been issued yet"* |
| landing page statistics | **jhooti nahi.** `4 Portals`, `11 Modules` asli ginti hain, PKR figure asli plans se compute hota hai (`Math.min(...PLANS.map(p=>p.price))`). Koi "10,000+ schools" nahi |
| dashboard consistency | shared theme (12 tokens) aur shared components (`Btn`, `Inp`, `Sel`, `Crd`, `Modal`, `KPI`, `Bdg`, `Bar`) |
| login page | pehle se professional — *"Welcome back / Sign in to EduConnect"*, forgot password, proper validation |

Landing page ki imandari ka kaam pehle ho chuka tha (section 6i).

### Jo waqai mila

**1 · Footer mein ek line, aur wo production bundle mein jati thi.**

```
Final-year project · not a commercial service
```

Ye `DEMO_LOGINS_ENABLED` gate se **bahar** thi. Pehla grep ise miss kar gaya kyunke wo
hyphenated hai (`Final-year`, na ke `final year`) — sabak: aise sweep mein hyphen aur
case dono ki soorat lein.

Footer ab: product name, dynamic copyright (`new Date().getFullYear()` — hardcoded 2026
stale ho jata), *"Built in Pakistan for Pakistani schools"*, aur `Features · Pricing` —
ye do isi liye ke wo **waqai maujood** hain (`#ec-features`, `#ec-pricing`). Fake
Privacy/Terms/Support links nahi banaye, kyunke un ke peechay kuch nahi.

**2 · Pluralisation — 15 jagah "1 students" / "1 classes".**

Ye wo cheez hai jo software ko adhoora dikhati hai, aur do live dekhi gayin:

```
Mr. Ali · 1 students                      (admin ki teacher list)
You teach Mathematics across 1 classes    (teacher dashboard)
Best month  Aug (1 days)                  (parent attendance)
ATTENDANCE  100% · 1 school days          (parent dashboard)
```

Ek helper (`count(n, singular, plural)`) aur 15 sites. Plan capacities chhori gayin —
"Up to 50 students" mein ginti kabhi 1 nahi hoti.

> Aakhri do sites **grep se nahi, UI dekhne se** mileen. Isi liye visual pass zaroori
> hai: `"1 school days"` un patterns mein nahi aata jo `.length}` dhoondte hain.

**3 · Demo experience — credentials ki list se product demo tak.**

Pehle: ek modal jo chaar rows mein **email aur password** dikhata tha. Wo developer
shortcut hai jisne modal pehen liya ho.

Ab: role picker. Visitor wo **nazar** chunta hai jo dekhni hai, login nahi.

```
See EduConnect in action

School Admin     Run a school day to day — enrol students, set fees, mark registers…
Teacher          Take attendance, enter marks and watch a class average move as you do
Parent           See a child's result card, attendance and fee challans…
Platform Owner   The view for running EduConnect itself — every school, its plan…

This is sample data shared by everyone trying the demo… Nothing here belongs to a real school.
```

Credentials code mein hain (wahi sign-in karte hain) magar **screen par nahi**. Order bhi
badla: school-facing roles pehle, platform owner aakhir mein.

Sath hi:
- Shared `Shell` mein ek demo banner — demo deployment par har session demo hai, to ye
  ek dafa, halke se, har jagah keh deta hai
- Login page ka credential panel ab `import.meta.env.DEV` par hai, `DEMO_LOGINS_ENABLED`
  par nahi — **demo deployment par bhi nahi dikhega**. Sign-in screen par addresses ki
  list us tassur ka ulat hai jo demo dena chahta hai
- Seed wala error hint (`npm run db:seed`) sirf DEV mein — visitor npm nahi chala sakta

### ⚠ Demo ko public karna ek deployment ka faisla hai, code ka nahi

`VITE_ENABLE_DEMO=true` ke sath bundle mein demo logins **aate hain** — one-click role
entry ka matlab hi yehi hai. Us par ye lazim hai:

> **Public demo apne alag database ke sath alag deployment ho.**

Wajah do hain, aur dono theek hain: demo dekhne wala kisi asli school ke data ke qareeb
na jaye, aur production khud aise database ke sath **start hi nahi hoti** jismein demo
accounts hon (`src/config/demo-guard.js`). Ye guard jaan boojh kar rakha gaya hai — user
ne sarahatan kaha usay na hataya jaye.

`render.yaml` `VITE_ENABLE_DEMO` set nahi karta, is liye pilot deployment saaf hai.

### Ek test badla — jaan boojh kar

`seedguard.test.js` ka *"puts the demo panel back"* ab *"carries the demo role picker"*
hai. Wo `VITE_ENABLE_DEMO=true` build mein `"Quick Login"` hone ka test karta tha; ab wo
panel DEV-only hai, to us jagah test karta hai ke **role picker maujood ho aur developer
sign-in ghair-maujood**. Default build ke assertions waise ke waise — us mein na
`super123` hai na demo UI.

---

## 6p. BACKUP — ab andaza nahi, sabit shuda (2026-08-30)

`scripts/db-backup.js` mahinon se maujood tha, aur uske aakhri do sutoor yehi
kehte the: *"Verify it restores into a scratch database before you rely on it —
DEPLOYMENT.md § Restoring has the drill."* Drill likhi hui thi. **Kabhi chalayi
nahi gayi thi.**

Aur wo chal bhi nahi sakti thi: `pg_dump` PATH par nahi tha, is liye
`npm run db:backup` us machine par fail hota tha jiska database bilkul theek
chal raha tha.

### Do cheezein banayi gayin

**1 · `scripts/lib/pg-tools.js`** — PostgreSQL ke tools **dhoondta** hai. Pehle
PATH, phir wo jagahein jahan installer rakhta hai (Windows par
`C:\Program Files\PostgreSQL\<major>\bin`, naye version pehle). User ka system
PATH badalna zaroori nahi raha — aur ye behtar hai: aisi backup procedure jo
kisi ke PATH edit karne par tiki ho, us din tak kaam karti hai jis din matter
karti hai.

Isi mein `libpqUrl()` bhi hai, jo Prisma ke wo query params hata deta hai jo
libpq nahi jaanta (`schema`, `connection_limit`, `pgbouncer` …) — warna tools
poori URI rad kar dete hain.

**2 · `scripts/db-restore-check.js`** (`npm run db:restore-check`) — poori drill,
khud chalti hui:

```
1. live database ka fingerprint       (db-verify.js — sirf SELECT)
2. dump                                (pg_dump — sirf padhta hai)
3. naya scratch database               (unique naam)
4. usme restore                        (pg_restore)
5. scratch ka fingerprint              (wahi db-verify.js)
6. muqabla, phir scratch drop
```

`db-verify.js` ko **import nahi kiya, subprocess ki tarah chalaya** — kyunke
incident mein insan wohi tool chalayega, aur uski apni copy se rehearsal karna
kam qeemat rakhta hai.

### Natija — asli run

```
live      eb5c60aeae467128  (64793 rows)
restored  eb5c60aeae467128  (64793 rows)
✓ FINGERPRINTS MATCH
✓ scratch database dropped
```

**Dono taraf sabit.** Ek truncated dump de kar chalaya to:

```
✗ pg_restore exited 1: could not read from input file: end of file
✓ scratch database dropped        <- cleanup phir bhi chala
```

### Hifazat ka design

- **Live database par kabhi likhta nahi** — `pg_dump` aur `db-verify.js` dono
  sirf padhte hain; likhna sirf us scratch copy mein hota hai jo khud banayi
  gayi.
- Scratch ka naam generate hota hai, aur agar wo kisi wajah se live ke naam ke
  barabar nikle to script **chalne se pehle inkar** kar deti hai.
- Drop `finally` mein hai — pass ho ya fail, scratch peechay nahi rehti.
- Rehearsal ka apna dump bhi hata deta hai. **Rehearsal backup nahi hai;** asli
  backup `npm run db:backup` se lein.

### Jo ye **nahi** karta

Ye ek local dump hai, usi machine par jispar database hai. Ye **kharab migration
se bachata hai, machine kho jane se nahi.** Off-site ya managed backups
(point-in-time recovery) deploy ke waqt provider par on karni hain —
DEPLOYMENT.md § Backups mein likha hai. Wo abhi nahi hua, kyunke abhi koi host
hi nahi.

**Iska koi automated test nahi.** Jaan boojh kar: ise ek chalta hua PostgreSQL,
uske client tools aur ek asli database chahiye — suite mein daalna usay dheema
aur machine par munhasir kar deta. Ye tool hai, aur dono taraf haath se sabit
kiya gaya hai (upar).

---

## 6n. LOGICAL BUG HUNT — asli school ke istemal par (2026-08-30)

User ka sawal seedha tha: koi aisa logical bug na rahe jo asli school chalane
par saamne aaye. Ye section wahi hunt hai — kya mila, kya theek hua, aur kya
jaan boojh kar chhora gaya.

**Gyarah bugs mile, gyarah theek hue.**

**Tareeqa:** throwaway school par API ke seedhe probe, phir har finding code
mein confirm. **Bug 9 aur 10 alag tarah mile** — poori app browser mein chala
kar, chaaron portals ek ek kar ke. Wo dono suite se kabhi nahi milte, kyunke
dono ka nishan ek hi screen par do aise number the jo aapas mein mel nahi
khate the; koi ek endpoint akela ghalat nahi tha. Har fix ka regression test **dono taraf** sabit kiya gaya — fix
hata kar fail hote dekha, phir laga kar pass. (Ye ehtiyat is repo mein do dafa
mehngi pad chuki hai; section 7 dekhein.)

---

### Bug 1 — attendance kisi bhi din ke liye qubool ho jati thi

```
kal (mustaqbil)     2026-08-31  ->  201
ek saal aage        2027-11-20  ->  201
73 saal aage        2099-01-01  ->  201
session se pehle    2020-06-15  ->  201
```

Nuqsan shor nahi machata tha:

```
attendance summary  :  5 din, 100%    <- 2099 aur 2020 bhi gine gaye
result card         :  2 din          <- ye session-scoped hai
```

Ek hi student ke do mukhtalif jawab, aur kisi screen par wajah ka nishan nahi.
April-March session mein saal beech mein badalta hai, is liye 2027 ki jagah
2026 likhna aam ghalti hai — aur wo row phir kabhi result card par nazar nahi
aati, magar dashboard ki attendance chupke se barha deti hai.

**Fix** — `refuseFutureDay()` in `attendance.controller.js`, `markOne` aur
`markBulk` dono par.

Ye **controller** mein hai, schema mein nahi — jaan boojh kar. Faisla sirf
**institute ke apne timezone** mein ho sakta hai: Karachi mein raat 1 baje
school ki calendar date UTC par pehle hi kal ho chuki hoti hai, to server clock
se comparison ek jaayaz register reject kar deta. `todayIn(tz)` school ki apni
date nikalta hai, jis se rule taqreeban nahi **theek** banta hai.

Sath hi schema-level guard: `takenOn` (jo paper hua hi nahi) aur `dob` (jo bacha
paida hi nahi hua). Ye **422** dete hain jabke attendance wala **400** — farq
asli hai, saaf karne wali inconsistency nahi: jo baat request se hi tay ho jaye
wo schema ka kaam hai, jise institute ka timezone chahiye wo controller ka.

Frontend mein date pickers par `max={todayISO()}`, aur `todayISO()` khud ek fix
hai — purana code `toISOString()` use karta tha jo **UTC** deta hai. Pakistan
(UTC+5) mein subah 5 baje se pehle wo *kal* ki date deta, aur is machine (UTC-7)
par shaam 5 baje ke baad *aane wale kal* ki. Dono ghalat, mukhtalif rukh mein.

**Jo jaan boojh kar guard nahi kiya:** `dueDate`, `publishedAt`, `expiresAt` —
teeno ke liye future jaayaz hai. `futuredates.test.js` isay bhi pin karta hai,
taake baad mein koi "consistency" ke naam par inhein na tor de.

---

### Bug 2 — challan jis din due tha usi din OVERDUE ho jata tha

`markOverdue` `dueDate: { lt: new Date() }` poochta tha, aur due date midnight
par store hoti hai. Yani 10 tareekh ko due challan **10 tareekh ki 00:00 baje**
OVERDUE — daftar khulne se pehle. Ghar wale usi din defaulters report par,
reminder run mein, aur late fee ke sath.

Iska doosra hissa aur khamosh tha: due dates `new Date(year, month-1, day)` se
banti thin — **server ke timezone** ki midnight — jabke baqi poore product mein
calendar dates UTC midnight par pin hoti hain (`utils/dates.js` isi ke liye
likhi gayi thi). Aik hi billing run mukhtalif machine par mukhtalif instant
likhti thi; is machine par (UTC-7) 7 ghante ka farq measure hua.

**Fix** — `dueOn()` helper (`dateOnly` par), aur comparison ab `lt: todayIn(tz)`.

Ye poori chain theek karta hai, aur ye **check kiya gaya hai**: reminders,
defaulters, dashboards aur stats sab sirf `OVERDUE` **status** parhte hain, koi
apna alag date comparison nahi karta.

---

### Bug 3 — subject delete har mark hamesha ke liye mita deta tha

```
Subject delete -> Enrollment (Cascade) -> Assessment (Cascade)
```

`Subject` soft-delete models mein nahi hai aur uska koi recycle bin nahi. Yani
"Computer Sc." hatana har saal ke, har student ke, us subject ke saare marks
khatam kar deta — khamoshi se aur hamesha ke liye. Purana confirmation sirf
"N enrollment(s)" kehta tha; marks ka zikr tak nahi tha.

Ye **akela** aisa hard delete tha jo academic record tak pohnchta hai:

| kya delete hua | asar |
|---|---|
| Teacher | `Subject.teacher` SetNull — mehfooz |
| ExamTerm | `Assessment.examTerm` SetNull — mehfooz |
| AcademicSession | `Enrollment` **Restrict** — rok deta hai |
| Student / Institute | soft delete + recycle bin |
| **Subject** | **Cascade, guard ke baghair** |

Guard band kar ke test chalane par ye live dikha: delete 200, dobara poochne par
"Subject not found", mark count `+0`, aur student ke report se Mathematics
ghayab.

**Fix** — marks maujood hon to refuse, aur message batata hai ke delete ki
zaroorat hi nahi: promotion par enrolments destination class ke curriculum se
aate hain, to chhora hua subject khud aage nahi jata. Jis subject par kuch
record nahi hua wo ab bhi delete ho sakta hai — warna ghalti se bana subject
hamesha ke liye atak jata.

**Note:** UI se `subjects.remove` abhi koi nahi bulata; ye endpoint sirf API par
khula tha. Guard phir bhi laga, kyunke endpoint hi contract hai.

---

### Bug 4 — bulk register do dafa bheje gaye student ko do dafa ginta tha

Register (student, din) par unique hai, to ek row banti thi — magar response
dono ginta tha. 30 bachon ki class "31 student(s)" wapas karti, aur jo bacha
PRESENT phir ABSENT bheja gaya wo dono status totals mein aata jabke store sirf
doosra hota. Ab Map se dedupe hai jo **aakhri** entry rakhta hai — theek wahi jo
upsert chhorta hai.

---

### Bug 5 — CSV import ghalat hijje wali class chup chaap bana deta tha

Class ki shanakht do strings hain student par (`grade` + `section`); koi class
id nahi jo ghalat ho sake. Is liye "grade 8" aur "Grade 8" **do alag classes**
hain. Ghalat case wali spreadsheet bachon ko aisi class mein daal deti thi jo
koi nahi parhata — register se ghayab, timetable se ghayab, aur promotion par
peechay chhoot jate — aur import isay saaf kaamyabi bata deta tha.

**Fix** — ab wo hijja refuse hota hai jo school pehle se kisi aur tarah likhta
hai, aur maujooda hijja naam bhi liya jata hai. Rule jaan boojh kar tang hai:

- `"grade 8"` jab `"Grade 8"` maujood ho → refuse
- `"Grade 11"` jo kabhi thi hi nahi → qubool (naya grade banana aam baat hai)
- wo hijja jo pehle se istemal ho raha ho → qubool, chahe school ke paas dono
  shaklein maujood hon

Import all-or-nothing hai, is liye ye masla import se **pehle** dikhta hai.

**Rule sirf import par hai — student form par jaan boojh kar nahi.** Ye faisla
koshish ke baad badla, is liye poora likha ja raha hai.

`grade`/`section` student form par bhi free text hain (App.jsx 5579-5580,
6132-6133), to pehle lagta tha ke sirf CSV guard karna adhoora kaam hai. Rule
`createStudent` par bhi laga diya gaya — aur poori suite ne wajah dikha di ke
aisa nahi karna chahiye. **Seeded school mein pehle se ek student maujood hai**
**jiska grade `"grade 8"` hai** — asli data, haath se likha hua, is sab se bohot
pehle ka. Rule lagte hi us school mein har agla `"Grade 8"` student refuse hone
laga:

```
grade "Grade 8" is written "grade 8" everywhere else in this school
```

Rule ye faisla kar hi nahi sakta ke do hijjon mein se **ghalat kaunsa hai**.
Bulk import par ye phir bhi faidemand hai: wo all-or-nothing hai, admin ko
likhne se pehle masla dikh jata hai, aur ek ghalat column poore saal ka group
ghalat class mein daal deta hai. Magar ek bache par ye ulta pad jata hai — ek
purani typo har agli **sahi** entry ko rok deti, yani saza us shakhs ko milti jo
safai kar raha hai, us ko nahi jisne ganda kiya.

Is liye form khula hai, aur `tests/import.test.js` mein ek test ye faisla pin
karta hai — taake koi ise "adhoora kaam" samajh kar dobara na jode. Agar kabhi
badalna ho to us rule ki zaroorat hogi jo **jama-shuda hijje** aur **ek-baar**
**wale** mein faraq kar sake, sirf near-miss dekhne wale ki nahi.

> **Aur ek cheez jo isi dauran mili:** seeded school (INS001) mein teen students
> aise hain jinke grade bemani hain — `"d;,F?m;lg;wl"`, `"n ,m ,m"`, aur wahi
> `"grade 8"`. Ye manual testing ka bacha hua data lagta hai. **Chhua nahi gaya**
> (user ka data hai), magar demo se pehle saaf karne layak hai.

> **Aur ek slip, jo isi fix mein thi.** Pehla version `/s+/g` ke sath gaya
> jahan `/\s+/g` maqsood tha — ek gum shuda backslash, is liye wo whitespace
> ke bajaye **harf "s"** replace kar raha tha. Mere apne tests ise nahi pakad
> sake, kyunke sirf case ka farq dono taraf ek jaisa mangle ho kar phir bhi
> match kar jata hai:
>
> ```
> value       toota hua        theek
> Grade 8     "grade 8"        "grade 8"      <- barabar, isi liye pass
> Grade  8    "grade  8"       "grade 8"      <- yahan farq khulta hai
> Class A     "cla  a"         "class a"
> ```
>
> Ab whitespace wala case pinned hai. Wajah bhi darj hai: backslash
> shell-quote → `node -e` → JS string ke beech nahi bachta. **Aisi edit
> hamesha file-based script se karein, `node -e` se nahi** — ye ghalti isi
> session mein dobara hui jab maine fix ko ulta sabit karne ki koshish ki,
> aur neutralisation khamoshi se lagi hi nahi (`String.replace` match na
> milne par chup chaap wapas kar deta hai — anchor count hamesha check karein).

---

### Bug 6 — school se nikala hua bacha reporting mein hamesha ke liye reh jata tha

Soft delete ek Prisma extension se lagti hai, aur wo sirf **top-level** \`where\`
rewrite karti hai — aur sirf un models ka jo khud soft-deletable hon. Magar
\`studentScopeWhere\` zyadatar **nested** filter ki tarah istemal hota hai:

```
prisma.attendance.findMany({ where: { student: scope } })
```

Yahan top-level model \`Attendance\` hai, jo soft-delete models mein nahi — to
extension ne kabhi \`deletedAt\` daala hi nahi. Throwaway school par naapa gaya:

```
delete se pehle : students 2, attendance total 2, absent 1
delete ke baad  : students 1, attendance total 2, absent 1
```

Yani jo bacha school se ja chuka, uski **ghair-hazri hamesha ke liye school ke
attendance rate mein** shamil rehti thi — aur student list, jahan se wo ghayab
ho chuka tha, usi screen-set ke doosre hisse se ikhtilaf karti thi. Yehi baat
uske bakaya challan par bhi lagti thi.

**Fix do hisson mein hai, aur doosra hissa pehle se zyada ahem tha:**

1. \`studentScopeWhere\` ab \`deletedAt: null\` khud likhta hai — implicit ke bajaye
   explicit, kyunke iska asal istemal nested hai.
2. Extension mein \`STUDENT_OWNED_MODELS\` (\`Attendance\`, \`FeeInvoice\`): agar
   caller ne \`student\` filter na diya ho to \`student: { deletedAt: null }\` khud
   lag jata hai.

Sirf pehla hissa karna **bug ko bura kar deta**: fee list se challan nikal jata
magar \`feeStats\` aur admin dashboard usay ab bhi ginte — ek hi screen par ek
challan aur do ka total, aur wajah kahin nahi. Ye naapa gaya tha (\`10000\` vs
\`5000\`), isi liye markazi fix chuna gaya — site-by-site mein koi na koi
aggregate chhoot jata (attendance ke 15 aur fee ke 11 read sites hain).

Extension ka mojooda usool — "caller ka explicit filter jeetta hai" — isay
mehfooz banata hai: teacher aur parent ki row-level scoping apna \`student\`
filter khud bhejti hai, aur usme \`deletedAt: null\` pehle se hai.

**Doosri taraf bhi pin ki gayi hai:** delete record **chhupata** hai, mitata
nahi. Test sabit karta hai ke rows database mein rehti hain aur restore par
bacha apni poori attendance aur fee history ke sath wapas aata hai — warna ye
fix recycle bin ka waada tor deta.

---

### Bug 7 — hataya hua teacher timetable par parhata reh jata tha

\`deleteTeacher\` soft delete karta hai aur usi transaction mein uske subjects
unassign kar deta hai — aur message bhi yehi kehta hai: *"Their subjects are now
unassigned."* Magar \`TimetableSlot.teacherId\` ko wo kabhi chhoota nahi tha.

Teen cheezein mil kar ise chupa deti thin:

- soft delete hai, is liye schema ka apna \`onDelete: SetNull\` **kabhi chalta hi
  nahi**
- timetable teacher ko nested \`include\` se parhti hai, jahan soft-delete
  extension nahi pohnchti
- aur \`conflictsFor\` **scalar \`slot.teacherId\`** par match karta hai, relation par
  nahi

Natija do jagah nikalta hai, aur dono school ko teacher ke jane ke pehle hafte
mein hi milte hain: chhapa hua timetable us shakhs ka naam dikhata hai jo ja
chuka, aur jo teacher uski jagah aaya use **usi period par "Teacher Conflict"**
milta hai — ek aise shakhs se takrao jo ab school mein hai hi nahi, aur wajah
kahin likhi nahi.

**Fix** — usi transaction mein slots bhi free ho jate hain, aur message ab
ginti ke sath batata hai: *"…and N timetable period(s) now need a teacher."*
Period khud nahi hataya jata — class ka wo period ab bhi maujood hai, bas uska
teacher nahi.

\`deleteParent\` ye pehle se theek karta hai (\`Student.parentId\` null kar deta
hai), is liye ye akela gap tha.

---

### Bug 8 — recycle bin mein para roll number, aur us ka bemani jawab

`@@unique([instituteId, rollNo])` table par lagta hai, aur soft delete row ko
chhorta hai — to hataya hua bacha apna roll number apne sath rakhta hai. **Ye
theek hai** aur isay badalna nahi chahiye: restore ka waada yehi hai ke jo liya
gaya tha wohi wapas mile. Ghalat ye tha ke product ye baat **kaise** kehta tha.

**Do raaste, dono kharab:**

```
form   : "A record with this instituteId, rollNo already exists"
         — column ka naam, tenant column ka zikr jo har table mein hai,
           aur wo roll number bataya hi nahi jo takraya

import : HTTP 409, poori file rad — kaun si row thi, kuch pata nahi
```

Import ka apna per-row check `takenRolls` **extended client** se banta tha, jo
soft-deleted rows chhupa deta hai. Yani wo roll khali nazar aata tha: row
validation paas kar jati, insert constraint par girta, aur poori file ek aise
message ke sath fail hoti jo na row ka naam leta tha na jagah ki.

Aur admin ke liye ye sab se ulajhne wali soorat hai — har listing kehti hai ye
number istemal mein nahi hai, aur wo waqai kisi aisi jagah para hai jahan dekhne
ki us ke paas koi wajah nahi: recycle bin.

**Fix teen hisson mein:**

1. **Import** ab `prismaRaw` se hatay gaye rolls bhi parhta hai, aur per-row
   masla batata hai — bache ka naam le kar. Import all-or-nothing hai, is liye
   ab bhi kuch nahi likha jata, magar admin ko theek row aur wajah mil jati hai.
2. **Student form** insert se pehle check karta hai aur 409 ke sath kehta hai ke
   number kis hatay hue bache ka hai, aur do raaste deta hai: restore karo ya
   doosra number do.
3. **Generic P2002 message** ab column ke naam nahi bolta. `instituteId` gir
   jata hai (wo in tables mein hamesha hota hai, kuch batata nahi) aur baqi
   fields insani alfaz mein aate hain — `"That roll number is already in use"`.
   Ye har unique constraint par lagta hai, sirf roll numbers par nahi.

**Note:** `errorhandler.test.js` purani wording ko pin karta tha; wo assertion
nayi wording par update ki gayi hai — behaviour jaan boojh kar badla gaya hai,
chupke se nahi.

---

### Bug 9 — hataye gaye bache teachers ka workload barha rahe the

Ye asli app browser mein chala kar mila, suite se nahi. Teacher portal kehta tha
**"MY CLASSES 2 · STUDENTS 4"**, jabke usi screen par neeche sirf **teen** naam
the.

Jarr wahi hai jo Bug 6 aur 7 ki thi: `teacherWorkload` `subject.enrollments` par
chalta hai aur student ko **nested include** se laata hai. Extension sirf
top-level `where` rewrite karti hai, aur yahan top-level model `Subject` hai — to
recycle bin mein para bacha ginta raha. Poore school par naapa gaya:

```
Mr. Ali      1 student   ["9B"]        <- iski poori class wohi ek hataya hua bacha
Mr. Tariq    1 student   ["9B"]
Ms. Hina     1 student   ["9B"]
Ms. Sara     1 student   ["9B"]
Mr. Hassan   4 students  ["10A","9B"]
Ms. Fatima   4 students  ["10A","9B"]
```

**Chaar teachers ko aisi class dikh rahi thi jismein koi tha hi nahi** — wo usay
kholte to khali milti — aur do ke roster mein ek bacha zyada tha. Yehi ginti
admin ki staff list par bhi chhapti thi.

**Fix** — `liveEnrolmentFilter(sessionId)` (`services/session.service.js`), jo
`sessionFilter` ke sath `student: { deletedAt: null }` laga deta hai. Teen jagah
lagta hai: `teacherWorkload`, `myClasses`, aur teacher dashboard. Helper isi liye
banaya ke ye chauthi dafa dobara na likhna pare.

Fix ke baad wahi school:

```
Mr. Hassan 3/["10A"] · Ms. Fatima 3/["10A"] · Ms. Hira 3/["10A"] · Ms. Nadia 3/["10A"]
```

Chaar phantom teachers list se bilkul nikal gaye. **Enrolment khud nahi hatti** —
wohi restore par sab wapas laati hai, aur test isay bhi pin karta hai.

---

### Bug 10 — platform ka revenue breakdown apne hi total se mel nahi khata tha

Ye bhi browser se mila, Super Admin dashboard par:

```
Revenue by Plan:  Starter 9,998 + Growth 25,998 + Elite 29,999  =  65,995
Total MRR:                                                          60,996
farq:                                                                4,999   <- theek ek Starter
```

Wajah: `mrr` sirf **ACTIVE** institutes ginta tha, jabke `planDistribution` ka
`_count.institutes` **saare**. Ek school SUSPENDED tha, aur uski fees breakdown
mein thi magar total mein nahi. Platform owner ko aisi rakam dikh rahi thi jo aa
hi nahi rahi — aur screen par kuch nahi bata raha tha ke dono mein sahi kaunsa
hai.

Usi screen par ek aur jhoot tha: KPI **"INSTITUTES 5 / Active schools"**, jabke
paanch mein se ek suspended tha.

**Fix, teen hisson mein:**

1. `planDistribution` ka `_count` ab `{ status: "ACTIVE", deletedAt: null }` par
   filter karta hai — yani hisse **bana kar** hi total ke barabar aate hain.
   (`deletedAt` isi liye likha hai ke `_count` nested read hai.)
2. Frontend ab dono cards `planDistribution` se banata hai, apna alag hisaab
   nahi lagata.
3. KPI ka sub-label ab sach bolta hai — `5` ke neeche `"4 active"`.

Test **invariant** pin karta hai, koi khaas raqam nahi: `planDistribution` ke
`monthlyRevenue` ka jorr hamesha `kpis.mrr` ke barabar rahe. Platform sanjha hai,
raqmein har naye school se badalti hain — usool nahi badalta.

---

### Bug 11 — ek hi bache ka rank teen screens par teen tarah

Result card hamesha se aise bache ko rank dene se inkar karta tha jiska koi mark
na ho — usool `reportcard.test.js` mein likha hai: *"A position needs a mark to
stand on"*. Wajah wazeh hai: `averageScore` un ke liye 0 deta hai, to unhein
ranking mein daalna aise bache ko un ke muqablay mein khara karta hai jinho ne
paper diya hai. Magar student list aur student detail is usool par nahi chalte
the — wo har bache ko number de dete the. Naapa gaya:

```
student            list   detail   card
Bilal Raza            3        3      3
Fatima                5        5   null
Hania Malik           1        1      1
shanawar bhatti       4        4   null
Zain Ahmed            2        2      2
```

Yani parent ko Grades tab par **"Ranked #4 of 5"** dikhta tha aur usi bache ke
usi din ke result card par wahi khana **khali**.

**Fix — card ka apna rule, jyun ka tyun.** Card ka test `scoreFor` hai, jo saal
ke card par bilkul `enrollment.currentScore` hota hai. List aur detail ab theek
wahi poochte hain:

```js
student.enrollments.some((e) => e.currentScore !== null)
```

Ye ahem hai: **koi naya rule nahi ghara gaya.** Jin **11 no-mark enrolments** ka
`currentScore` set hai magar assessments nahi (protected data — section 5h), wo
teeno jagah barabar "score hai" ginte hain, jaise card pehle se ginta tha.

**Do cheezein jaan boojh kar nahi chhuin:**

- **`classSize`** — bina mark wala bacha class mein to hai hi, bas order mein us
  ki jagah nahi. Usay ginti se nikalna dosra bug hota: teen ki class mein
  "1st of 2".
- **Jin ke marks hain un ke ranks** — wo bilkul nahi hile (3, 1, 2 waise ke
  waise), kyunke 0-average wale waise bhi sort mein aakhir mein aate the.

**Frontend bhi theek karna para,** warna fix ulta bug ban jata. Adapter
`rank: s.rank ?? 0` likhta tha — yani honest `null` **0** ban jata aur screens
"Rank #0" chhaap detin. Ab adapter `null` ko bachata hai aur **har** render site
shart ke sath hai (chhe jagah theek karni parin). Parent dashboard ab kehta hai:

```
CLASS RANK
—
No marks recorded yet
```

Aur jin ke marks hain un ka "#2 of 5" waisa hi hai.

---

### Teesri dafa: ek poori file jhooth bol rahi thi, aur mechanism naya tha

Bug 7 ka test jab pehli dafa chalaya to **saat ke saat pass** ho gaye — aur bug
maujood tha. Wajah ye thi:

```
POST /api/classes  →  422   (academicYear lazmi hai, maine bheja hi nahi)
      klass = undefined  →  seeded = false
      har test ka `if (skip()) return`  →  khamoshi se green
```

Pehle do vacuous tests demo data par tike hue the (section 6j). **Ye alag hai:**
yahan fixture theek tha, sirf ek request ka payload adhoora tha — aur poori file
ne, jismein wo chaar tests bhi the jo asli bug pakadne ke liye likhe gaye the,
khamoshi se green tick de diya.

Pakra kaise gaya: maine ek guard add kiya jo `seeded` ko khud assert karta hai.
Usne foran kaha —

```
× built its school
  AssertionError: beforeAll did not complete — everything below is vacuous
```

— payload theek karte hi bug saamne aa gaya (`expected 'Departing Sir' to be
null`), aur fix hata kar dobara sabit bhi hua.

**Ye pattern 33 test files mein tha aur sirf ek mein koi `seeded` assertion tha.**
Yani un mein se koi bhi kisi din khamoshi se khokhli ho sakti thi, aur "sab pass"
ka daawa utna hi mazboot tha jitna sab se kamzor `beforeAll`.

**Ab har file mein guard hai** (`tests/helpers/fixtures.js` + ek `it("built its
fixtures")` per file). Wo dono soorton mein faraq karta hai:

- seed data hai hi nahi → file pehle ki tarah stand down kar jati hai (yehi
  `skip()` ka jaayaz maqsad tha)
- seed data maujood hai magar `seeded` false hai → **file shor machati hai**

Ye guard sirf tab fail ho sakta hai jab file pehle se jhooth bol rahi ho.

> **Sabaq:** `if (skip()) return` ek switch hai jo test ko chupa deta hai. Aisa
> koi bhi switch aik aisi assertion maangta hai jo khud us switch ke neeche na
> ho — warna jis din wo galat wajah se on hota hai, koi nahi jaanta.

---

### Aur ek test jo jhooth bola — is dafa demo data badalne par

Isi din, jab suite chal rahi thi, **user app ko browser mein istemal kar raha
tha** aur seeded school se ek student (Grade 10/A) hata diya. Agli run mein
`reportcard.test.js` ke do tests fail ho gaye:

```
counts only the child's own class    expected 5 to be 6
ranks the whole class consistently   TypeError: Cannot read properties of
                                     undefined (reading 'rank')
```

Pehla shubha yehi hota hai ke app tuti — magar **app bilkul theek thi, test
ghalat tha.** Test `prismaRaw` (bina extension wala client, jaan boojh kar —
ground truth ke liye) se classmates ginta tha, magar filter sirf itna tha:

```js
where: { instituteId, grade, section, status: "ACTIVE" }
```

**`deletedAt` ka zikr hi nahi.** Soft delete `status` ko chhoota nahi, is liye
hataya hua bacha row mein ab bhi `ACTIVE` hai. Test use classmate ginta raha,
uska result card maanga (API ne theek 404 diya → `undefined` → TypeError), aur
chha ki class expect ki jahan paanch bache the.

Do sabaq isme hain, aur dono pehle se HANDOFF mein likhe the — sirf yahan lagaye
nahi gaye the:

1. **`prismaRaw` par soft-delete filter khud likhna parta hai.** Wahi baat jo
   Bug 6 ki jarr thi, magar wahan production code mein thi aur yahan test mein.
2. **Test ka fixture demo data se mat lo** (section 15 ki safety rule). Ye test
   seeded school par tika tha, is liye us din jhooth bola jis din us school mein
   ek jaayaz tabdeeli hui.

**Aur usi din, usi file mein, dobara.** Browser testing ke baad `reportcard`
phir toota — is dafa isi liye ke wo `findFirst` se *parent ka pehla bacha*
chunta tha, **bina `orderBy` ke**. Us guardian ke do bachay hain, to database
jo chahe wapas kar de. Us dafa bina marks wala bacha aaya, aur do tests fail
hue — **dono ka behaviour bilkul theek tha** (bina mark ke rank nahi hota, aur
teacher us bache ka card nahi khol sakta jise wo parhata hi nahi). Fixture ab
sarahatan aisa bacha chunta hai jise mark mil chuka ho, aur `orderBy` ke sath.
Isi ne wo rank wali inconsistency bhi benaqab ki jo upar khule masle #4 mein
darj hai.

**Amali rule, jo ab tak likha nahi gaya tha:** poori suite chalane se pehle
**app ko browser mein istemal mat karein.** Suite seeded demo data parhti hai;
usi waqt koi student add/delete karna, ya attendance mark karna, tests ko us
tarah tor sakta hai jiska code se koi taluq nahi. (Ye ngrok/frontend wale rule
ke sath jata hai — section 13.)

---

### Jo dekha aur theek nikla

Ye areas probe kiye gaye aur inme masla nahi mila — bina nayi wajah ke dobara
mat kholein:

| area | kya check hua |
|---|---|
| timetable | overlap half-open (09-10 aur 10-11 clash nahi), `end > start`, create aur update dono par conflict check |
| fees | `min(0)` amounts, `discountWithinAmount`, WAIVED par payment refuse, overpayment refuse, partial instalments |
| promotion | sirf `status: ACTIVE`, apni hi session mein promotion refuse |
| sessions | `moveToSession` transaction mein purani `isCurrent` demote karti hai; `endsOn > startsOn` |
| roll numbers | DB unique, restore par clash check, CSV import mein dono qism ke duplicate |
| assessments | enrolment lazmi aur session-scoped |
| messages | cross-institute refuse; student/parent institute ke against validate |
| percentages | backend ke teeno rate calcs divide-by-zero se guarded |
| invoices | `skipDuplicates` — billing run dobara chalana mehfooz |
| seat limit | `assertSeatsAvailable` create par, soft-deleted students ko chhor kar |
| notices | expiry filter (`expiresAt` null ya future) |
| trial | `accessBlock` auth middleware se, `trialEndsAt` par |

### Khule masle — jaan boojh kar chhore gaye

1. **Student form par `grade`/`section` free text hain aur jaan boojh kar**
   **guarded nahi** (wajah Bug 5 mein poori likhi hai — backend rule wahan laga
   kar dekha gaya aur wapas liya gaya). Sahi hal refusal nahi, **sahoolat** hai:
   frontend par maujooda grades ka `datalist`, taake admin type karne ke bajaye
   chune. Wo abhi banaya nahi gaya.
2. **Session se bahar ki *guzri* dates** attendance mein ab bhi qubool hain
   (misal 2020). Summary unhein ginti hai, result card nahi — wahi purana
   ikhtilaf, magar bohot chhote paimane par. "Kisi session ke andar honi
   chahiye" wala rule theek lagta hai, magar wo asli historical import rok
   sakta hai, is liye bina zaroorat badla nahi gaya.
3. **GRADUATED/TRANSFERRED student ki attendance** API se ab bhi lag sakti hai
   (`register` prefill sirf ACTIVE dikhata hai, is liye UI se nahi). Sahi rule
   wazeh nahi: jo bacha ab graduate ho chuka, uska pichla register bharna
   jaayaz hai — to blanket refuse ghalat hota.
4. **`/dashboard/parent` ka `take: 60`** — wo endpoint sirf aakhri 60 attendance
   rows par rate nikalta hai, is liye uska total baqi har screen se kam aata hai
   (naapa gaya: 60 vs 62). Abhi koi nuqsan nahi kyunke **UI ye endpoint use hi**
   **nahi karta** — `endpoints.js` mein defined hai, `App.jsx` mein kahin nahi.
   Jo koi ise wire kare, pehle ye cap hataye.

> Is list se teen cheezein **nikal** chuki hain: P2002 ka field-name leak aur
> recycle bin mein para roll number (Bug 8), aur bina marks wale bache ka rank
> (Bug 11). Teeno 2026-08-30 ko theek huay.

### Test fixtures ka ek sabaq

Bug 1 ke guard ne 6 files ke **46 tests** toray. Wajah guard nahi thi — wo tests
aisi dates use kar rahe the jo aayi hi nahi (`takenOn: "2026-11-20"` jabke aaj
2026-08-30 hai). Wo sirf is liye pass hoti thin ke koi check hi nahi tha.

`twosessions.test.js` sab se ahem tha: wo school ko **2027-28** mein le jata tha
— ek aisa saal jo shuru hi nahi hua — aur us ke andar marks aur register file
karta tha. Ab wo jori ek saal peechay hai (`2025-26 -> 2026-27`), jo asal mein
zyada haqeeqi hai: aisa school jo pichle saal app use kar raha tha aur April
mein roll over hua.

> Sabak: jis test mein date hard-code ho, wo waqt guzarne ke sath aisi
> surat-e-haal likh sakta hai jo mumkin hi nahi. Jahan sirf "koi din" chahiye,
> wahan aaj se relative din lein — `absencealerts` aur `emailworkflow` ab yahi
> karte hain.

---

## 6l. SAFEPAY — checkout verified, do asli bug fix (2026-08-29)

### Pehle: section 9 ki do baatein purani ho chuki thin

`safepay.js` ka header kehta tha *"No Safepay account exists yet"*. **Ghalat.**
`.env` mein jo sandbox merchant secret hai wo **asli hai aur kaam karta hai** —
`POST /client/passport/v1/token` ne 200 aur 76-char token diya.

Aur `loca.lt` par FortiGate ka re-signed certificate ab nahi milta — dono `loca.lt`
aur `sandbox.api.getsafepay.com` **asli Let's Encrypt** cert dete hain. Yani TLS
interception is network par ab nahi ho rahi.

### ✅ Checkout ASLI Safepay se verify hua

Throwaway institute par asli `createCheckout`:

```
host                      sandbox.api.getsafepay.com
auth_token                present (asli sandbox se)
plan_id matches ours      yes
reference == institute id yes
secret leaked into URL    no
hosted checkout page      HTTP 200
```

Ye pehli baar hai ke checkout asli gateway ke against chala hai.

### 🔴 BUG 1 — nakaam delivery ka event hamesha ke liye nigal jata tha

Route event id **pehle** claim karta tha, phir kaam karta tha. Agar wo kaam fail ho
jaye (DB blip, deadlock, anjaan payload), claim wahin reh jata tha. Safepay retry
karta, use *"already processed"* milta, aur payment kabhi apply hi nahi hota.

Reproduce kiya:
```
1st delivery : 500 transient failure        → event CLAIM
2nd (retry)  : 200 "Event already processed" → khamoshi se drop
final state  : UNPAID, currentPeriodEnd null → school ne paisa diya, access gaya
```

Fix: nakaami par `releaseEvent()` claim wapas de deta hai, to gateway ka agla
attempt kaam kar leta hai. Jo event **jaan boojh kar ignore** kiya gaya (`toBillingUpdate`
null) uska claim rehta hai — wo faisla hai, nakaami nahi.

Fix ke baad: `2nd delivery → 200 {"applied":true}`, school **ACTIVE**.

### 🔴 BUG 2 — signature scheme ka juwa

Safepay ke **docs** kehte hain raw body signed hai; unka **SDK** `JSON.stringify(body.data)`
karta hai. Docs site is network se abhi bhi unreachable hai (HTTP 000), to ye settle
nahi ho sakta.

Code sirf SDK wala scheme check karta tha. **Agar docs sahi hain to har asli event
reject hota** — koi payment kabhi apply na hota, aur log cryptography ko blame karta.

Fix: **dono** candidates check hote hain. Ye kuch kamzor nahi karta — dono HMAC-SHA512
usi secret se hain, to attacker ko phir bhi secret chahiye. `signedOver` batata hai
kaunsa match hua — yani wo jawab jo sandbox se milna tha, ab pehli asli delivery se
khud mil jayega.

`eventId` hamesha `data` bytes se banta hai, chahe koi bhi scheme match kare — warna
ek hi event dono tareeqon se aa kar do martaba process ho jata.

### Idempotency mechanism — verify hua

`ProcessedWebhookEvent` par `@@unique([provider, eventId])`. Duplicate insert P2002
deta hai, jo *"already done"* mana jata hai. Concurrent delivery ke liye
`applyBillingUpdate` guards ko WHERE conditions mein dohrata hai aur `updateMany`
se likhta hai — row count 0 ka matlab naya event jeet gaya.

### Capture mechanism — verify hua

`SAFEPAY_CAPTURE_WEBHOOKS` accepted **aur** rejected dono deliveries record karta hai,
raw bytes byte-for-byte. Yehi wo tool hai jo signature ka sawal pehli asli delivery
par settle karega.

### Ek test-fragility jo mujhe khud kaat gayi

`billing.test.js` `processedWebhookEvent.count()` **poori table par** karta tha. Mere
ek probe ne SAFEPAY row chhori, suite fail hui, aur test ke apne `afterEach` ne
(unscoped `deleteMany({})`) row mita kar saboot bhi mita diya. Tinon jagah ab
`{ provider: "STRIPE" }` se scoped hain — wahi sabaq jo baqi suite ne seekha tha.

### ~~🔴 B3 ABHI BHI KHULA~~ → **agle din CLOSED ho gaya (section 9)**

> Neeche ka tajziya us waqt durust tha aur ab bhi parhne layak hai — khaas kar tunnel
> ki measurements. Magar nateeja badal gaya: rukawat **dashboard access nahi thi.**
> Endpoint pehle se registered tha; uske URL mein ek digit kam thi (`60-10` bajaye
> `60-100`), aur events par `NO EVENT` laga tha. Dono theek karte hi asli delivery
> aa gayi. Poori tafseel section 9 mein.

**Us waqt ka tajziya:**

Rukawat tunnel **nahi** hai. Rukawat ye hai:

1. **Endpoint register karna Safepay dashboard maangta hai** — unke account mein login.
2. **Sandbox payer signup reCAPTCHA-blocked hai**, to subscription checkout complete
   nahi ki ja sakti. (Ye Safepay ki taraf ka masla hai — bypass nahi karna.)

Tunnel ki soorat-e-haal (aaj measure ki):

| | |
|---|---|
| cloudflared | installed nahi; `api.trycloudflare.com` **TCP blocked** |
| ngrok | binary hai; `connect.ngrok-agent.com` **unreachable** |
| localtunnel | edge **reachable** (302), client installed nahi |
| TLS | `loca.lt` asli Let's Encrypt deta hai — Safepay ko trusted cert milega |

Yani tunnel mumkin lagta hai, magar **tunnel kaafi nahi** — dashboard ke baghair
Safepay ko bataya hi nahi ja sakta ke kahan bhejni hai.

### Jab dashboard access ho

1. localtunnel chalayein, `https://<sub>.loca.lt` lein
2. Safepay dashboard → Developers → Endpoints → wo URL + `/api/billing/webhook/safepay`
3. `.env`: `PAYMENT_PROVIDER=safepay`, `SAFEPAY_CAPTURE_WEBHOOKS=./capture.jsonl`
4. Ek sandbox payment karein
5. `capture.jsonl` se dekhein `signedOver` kya kehta hai — **ye ho chuka: `data`.** Section 9
6. Test ke baad: provider wapas `manual`, capture band, capture file delete

---
## 6k. SMTP — ab waqai deliver hoti hai (2026-08-30)

> **Ye is project ka pehla mauqa hai ke koi email asli inbox mein pohnchi.**
> 29 August ka kaam (neeche) code ko asli SMTP conversation ke against verify
> karta tha — magar ek local sink ke sath. 30 August ko user ne asli relay laga
> diya aur email waqai gayi.

```
relay      Gmail, dedicated account, App Password (16 chars)
port       587, STARTTLS required
SMTP_FROM  wahi address jo SMTP_USER — Gmail kisi aur se bhejne nahi deta
verify     npm run smtp:verify -- you@example.com
```

`scripts/verify-smtp.js` chaar sawal alag alag poochta hai, kyunke ye alag
wajoohat se fail hote hain aur ek "nahi pohnchi" tinon ko chhupa deta hai:
config poori hai · relay tak pohnch aur login · relay ne message qubool kiya ·
**aur wo jo script khud nahi jaan sakti — inbox mein aayi?** Wo aakhri sawal
insan se poocha jata hai, aur jab tak jawab na mile script khud kehti hai ke
email `ACCEPTED` hai, `DELIVERED` nahi.

Email asli `sendPasswordReset` se jati hai — wahi function jo asli reset route
chalata hai — koi parallel "test" send nahi, jo pass ho kar asli path ke
toote hone ko chhupa sake. Reset link jaan boojh kar `example.invalid` par
jata hai: ye delivery sabit karta hai, aur ek zinda reset link kisi mailbox
mein chhorna theek wahi cheez hai jise production guard rokta hai.

### Production guard ab pass karta hai

```
pehle  ✗ SMTP_HOST is not set
       ✗ DEFAULT_USER_PASSWORD is still the documented default
       ✗ CORS_ORIGIN contains a plaintext http:// origin
       ✗ SAFEPAY_CAPTURE_WEBHOOKS is set

ab     ✗ CORS_ORIGIN contains a plaintext http:// origin
       ✗ APP_URL is not set                                  <- dono ko sirf domain chahiye
```

Aakhri wala **bug nahi** — `http://localhost:5173` development ke liye theek
hai; production mein asli https domain chahiye, jo abhi hai hi nahi. Sirf check
ke liye `CORS_ORIGIN=https://…` de kar chalaya to guard **pass** hua, yani uske
peechay aur kuch chhupa nahi.

**`DEFAULT_USER_PASSWORD` hata diya gaya** — config, guard, test, `.env`,
`.env.example`, README aur DEPLOYMENT.md sab se. Wajah: use koi parhta hi nahi
tha. Har account `EC-${crypto.randomBytes(4)}` se banta hai, aur README khud
usay *"legacy fallback"* keh raha tha. **Aisi setting par production rokna guard
na hone se bura hai** — wo deploy karne wale ko sikha deta hai ke ye messages
workaround kiye ja sakte hain, aur agla message asli hoga.

`SAFEPAY_CAPTURE_WEBHOOKS` bhi khali kar diya gaya (sandbox diagnostic tha).

### Aur ek gap, jo asli test se mila — `APP_URL`

User ne asli "Forgot password" flow chalaya. Email aa gayi, link bhi aaya —
aur **phone par kholte hi "webpage cannot be reached"**. Link tha:

```
http://localhost:5173/reset-password?token=…
```

Phone par `localhost` ka matlab phone khud hai. Ye us machine ke ilawa kahin
kaam nahi karta jispar dev server chal raha ho.

Ye sirf reset link ka masla nahi tha. `env.appUrl` **chhe** jagah istemal hota
hai: reset link, billing ke do return URLs, aur institute/parent/teacher/user
— chaaron welcome emails ka login link. Yani jo bhi credentials wali email
jati, uska login link bhi kisi ke liye na khulta.

**Aur production guard isay rok nahi raha tha.** `APP_URL` set na ho to wo
chup chaap `http://localhost:5173` par gir jata tha, aur guard PASS kar deta:

```
NODE_ENV=production CORS_ORIGIN=https://…   →  guard PASS, appUrl = http://localhost:5173
```

Yani deploy ho jata, sab theek lagta, aur har school ko aisa link jata jo
khulta hi nahi — logs mein kuch bhi nahi.

**Guard add kiya, chaar branches ke sath:**

```
(set nahi)                   →  refuse: har emailed link localhost par jayega
http://localhost:5173        →  refuse: points at your own machine
http://127.0.0.1:5173        →  refuse: wahi
http://school.example.com    →  refuse: reset token plaintext link mein safar karega
https://school.example.com   →  PASS
```

Plaintext isi liye mana hai jis liye CORS mein — magar yahan zyada tez: us
link mein reset **token** hota hai, aur wo token password badalne ka ikhtiyar
hai.

> **Sabaq:** ye bug suite se kabhi na milta. Email bhi theek gayi, template bhi
> theek tha, link bhi theek bana — masla sirf tab khula jab kisi ne wo link
> **doosre device par** khola. Kuch cheezein sirf asli safar chala kar milti
> hain.

### Ek khatra jo SMTP lagate hi paida hua, aur usi waqt band hua

Suite ka koi global SMTP isolation nahi tha. Jin teen specs ko iska pata tha wo
apna subprocess `SMTP_HOST=127.0.0.1` par chalati hain — magar **baqi poori
in-process suite** `.env` se transport uthati hai. `.env` mein asli Gmail aate
hi har spec jo teacher/parent banati ya register bharti hai, asli send karne
lagi — saikron undeliverable `@test.edu` addresses par, har run.

Isolation hata kar naapa gaya:

```
× shows the generated password instead of claiming it was emailed   6074ms
× does the same for a parent                                        5667ms
× does the same for a user created by the super admin               4719ms
× runs the mail service in console mode                                2ms
```

Yani sirf spam nahi — suite **dheemi** bhi hoti aur **fail** bhi karti. Aise
account ko rate-limit aur phir suspend isi tarah kiya jata hai.

**Fix** `vitest.config.js` ke `env` block mein hai (dotenv mojooda variable
override nahi karta, is liye ye jeetta hai). Aur `email.test.js` mein ek guard
hai jo yehi pin karta hai — *"runs the mail service in console mode"* — taake
ye dobara chupke se na ho.

---

## 6k-1. SMTP — asli socket par verify (2026-08-29)

**Pehle saaf baat: asli SMTP credentials abhi bhi mojood nahi.** `.env` mein koi
SMTP key nahi hai. Kisi asli inbox mein koi email nahi gayi, aur na hi main aisa
keh raha hoon.

Jo hua wo ye hai: `tests/helpers/smtp-sink.js` — ek **asli SMTP server**, `node:net`
par, bina koi dependency add kiye. Ab mail waqai socket par jati hai aur test doosri
taraf se parh kar dekhta hai ke kya pahuncha.

### Teen alag darjay — inhein mat milao

| Darja | Matlab |
|---|---|
| **CODE VERIFIED** | function chala, `{delivered:false}` waapis aaya |
| **SMTP TRANSPORT VERIFIED** | asli SMTP conversation, envelope/subject/body wire par parhe gaye |
| **ACTUAL INBOX DELIVERY** | **kuch bhi nahi** — SPF, DKIM, spam filter, koi third party nahi |

### Jo pehle test hi nahi hota tha

`email.test.js` do haalatein cover karti thi: SMTP na hona (console fallback), aur
SMTP hona magar har send fail hona. **Dono mein koi message kabhi socket par jata hi
nahi tha** — yani wo soorat kabhi test nahi hui jiske liye feature bana hai.

Ab hoti hai. `smtpdelivery.test.js` (16) har template ko asli relay par bhejti hai;
`emailworkflow.test.js` (14) poori chain chalati hai — signup → teacher → forgot
password → fee reminder → attendance — asli endpoints se, relay ke sath, aur phir
doosri taraf se parhti hai.

```
MAIL FROM:<no-reply@test.edu> RCPT TO:<sara@guardian.test>
Subject: Absence on Friday, 28 August 2026 — Beaconhouse Karachi
  Dear Sara Ahmed,
  • Zain Ahmed — Grade 9 A
  If the school already knows the reason, please ignore this message.
```

### Ek asli security bug jo isi se nikla

Transport `secure: port === 465` set karta tha aur bas. 587 par nodemailer STARTTLS
**sirf tab** karta hai jab relay offer kare. Meri sink STARTTLS advertise nahi karti —
aur credentials phir bhi chali gayin (`authAttempts > 0`). Yani:

> Jo relay STARTTLS na de (ya jo network position us offer ko strip kar de), usay
> **SMTP password plain text mein** mil jata tha, aur send phir bhi kaamyab report
> hota tha. Kahin kuch nahi kehta tha ke aisa hua.

Ab `requireTLS` on hai jab bhi `SMTP_USER` set ho. `SMTP_REQUIRE_TLS=false` sirf us
relay ke liye jo waqai TLS nahi kar sakta (aur suite ki apni local sink ke liye).
Bina credentials wala relay plain connection par ab bhi bhejta hai — jahan bachane ko
kuch hai hi nahi, wahan TLS maangna sirf local setups torta.

Startup log ab batata hai kaunsi soorat chal rahi hai:
`SMTP configured: host:587 (STARTTLS required)`.

### Do bugs meri apni test helper mein

- **Quoted-printable byte-wise decode ho raha tha** — em dash `â` ban jata tha, to
  jo test us jumle ko dhoondta jo walid parhta hai wo ek bilkul durust message par
  fail hota. Bytes jama kar ke UTF-8 decode karna parta hai.
- **Sink unknown commands ka jawab `250 OK` deti thi.** Nodemailer ne STARTTLS ko
  kaamyab samajh kar plain socket par TLS handshake shuru kar diya aur 10 minute
  hang raha. Asli server `502` deta hai — ab sink bhi.

### Aur ek test-cleanup ki khaami

Workflow test ka cleanup child process ke andar tha. Ek run beech mein crash hua
(Prisma select ghalat tha) aur school + 3 users orphan reh gaye — `db:verify` ne
chaar ki jagah **paanch institutes** dikha kar pakra. Ab cleanup parent ke `afterAll`
mein bhi hai, kyunke parent child ke marne se bach jata hai.

> **Sabaq:** jo cleanup sirf happy path par chalti hai wo cleanup nahi hai.

### Notice email

Wo abhi bhi mojood nahi (6j dekhein — toggle isi liye hatai gayi thi). `email.service.js`
mein koi `sendNotice` nahi hai. Notices parent portal mein in-app pahunchti hain.

### Production guard — pehle se tha, dobara verify hua

`configguard.test.js` ye sab pehle se cover karti thi. Runtime par bhi confirm kiya:

```
nothing set        REFUSED  SMTP_HOST is not set
host, no FROM      REFUSED  SMTP_FROM is not set
USER without PASS  REFUSED  must be set together — a half-configured relay fails silently
fully configured   starts
```

### Jab asli credentials milen

1. `.env` mein `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` bharein
   (`SMTP_REQUIRE_TLS` khali chhorein)
2. Backend restart — log `(STARTTLS required)` kehna chahiye
3. Ek throwaway school par `forgot-password` chalayein aur asli inbox check karein
4. **Tab** us khane ko "ACTUAL INBOX DELIVERY VERIFIED" likha ja sakta hai, pehle nahi

---
## 6j. PRODUCT READINESS AUDIT — aur jo usne pakda (2026-08-29)

Poora audit: 48-probe cross-tenant battery do purpose-built schools par, 25-check
fee/academic correctness run, controller→service→Prisma tracing, teen roles ka
browser pass, aur test-suite review.

**46/48 cross-tenant probes held.** Har read, write, delete aur relationship-steal
School A → School B refuse hui. Fee accounting poora sound nikla (partial, overpay,
repeat, duplicate period, bulk generate, stats-vs-ledger). Academic maths verified
controlled data se. Purane paanch sabaq sab qaim.

### P0 — messages doosre school ka bachcha leak karti thin

`sendMessage` `studentId`/`parentId` seedha body se row mein likhta tha, aur
`MESSAGE_INCLUDE` student ko wapas hydrate karta tha. `message.routes.js` par kisi
route par `scopeToInstitute` hai hi nahi — saara scoping controller par hai, aur is
path par tha hi nahi.

```
POST /api/messages  { recipientId: <apne school ka>, studentId: <doosre school ka> }
→ 201   "student": { "name":"B Student", "grade":"Grade 8", "section":"A" }
```

**Parent bhi kar sakta tha** — sab se kam privilege wala role. Row par cross-tenant
foreign key hamesha ke liye reh jati thi, recipient ko render hoti thi, aur jis school
ka bachcha tha usay dikhti hi nahi thi.

Fix: dono ids `req.user.instituteId` ke against validate hote hain. **Refuse, na ke
chupke se null** — jo ghalat bachcha attach kar raha hai usay bataya jaye.

### Ek vacuous test jo maine khud likha aur khud pakda

Pehli regression maine demo data se outsider dhoondne wali likhi. Wo **paas ho gayi
— unfixed code ke against bhi**, kyunke saare 11 demo students ek hi institute ke
hain, lookup null aata tha, aur teen tests bina kuch assert kiye return kar jate the.
Yehi wo failure mode hai jo audit ne khud P-list mein flag kiya tha.

Dobara likhi: test **apna outsider school khud banata hai**. Aur dono taraf verify
kiya — guard hata kar chalaya to **3 fail**, guard ke sath 14 pass.

> **Sabaq:** jo test demo data ki shakl par depend karta hai wo us din jhooth bolna
> shuru karta hai jis din demo data badal jaye. Fixture khud banao.

### P1 — "Email notices to parents" toggle kuch control nahi karti thi

`grep -rn "noticeEmails" src/` sirf **definition** deta tha. Notice publish karne par
na email jati hai na message banta hai. Admin toggle on kar ke samajhta ke walidain ko
chutti/exam date/fee deadline bata di gayi — aur nahi bataई gayi thi.

**Hata di, implement nahi ki.** Notices parent portal mein pehle se pahunchti hain,
aur email path abhi verify ho hi nahi sakta (SMTP nahi hai) — wo ek aur un-watched
wada hota. Wapas tab aaye jab `email.service.js` mein `sendNotice` bane aur koi usay
call kare.

Sath mein **structural guard**: `notificationgating.test.js` har preference ke liye
src/ mein consumer dhoondta hai. Ghost toggle inject kar ke prove kiya ke pakadta hai.

### P1 — paid challan hard-delete ho jata tha, bina audit ke

```
invoice  amount 20,000  paidAmount 20,000  status PAID
DELETE /api/fees/<id> → 200
collected: 55,000 → 35,000
```

Rs 20,000 wasoola hua paisa books se hamesha ke liye nikal gaya, aur **koi audit entry
nahi** — jabke students/teachers/parents sab soft-delete hote hain audit ke sath.

Fix: **jis par paisa aaya wo delete nahi hota, WAIVED hota hai.** Soft-delete jaan
boojh kar nahi chuna — `@@unique([studentId, period])` se takrata (deleted invoice usi
period ka naya challan rok deta). Accounting ka usool bhi yahi hai: receipt delete nahi
hoti, void hoti hai. Bina paise wala challan ab bhi delete hota hai — ghalti se bana
challan wapas lene ka yahi tareeqa hai. Aur `audit()` add hui.

### P2 — do aur

- **`discount > amount` accept ho jata tha** → net payable minus. `superRefine` se dono
  create aur update par refuse. Aam discount (5000 par 500) ab bhi chalta hai.
- **`mark-overdue` platform-wide tha** jab caller ke paas institute na ho: SUPERADMIN
  bina `?instituteId=` har school ke pending invoices OVERDUE kar deta aur ek school ka
  late fee sab par laga deta. Ab explicit institute maangta hai.

> Ye audit ke waqt **runtime verify nahi kiya** tha — proof karne ka matlab char demo
> schools ke invoices mutate karna hota. Code-confirmed report kiya, aur waisa hi kaha.

### Verdict

**YES WITH CONDITIONS.** Teeno blockers band ho chuke. Baqi shartein:

1. **Single-tenant pilot** — ek school per instance. Jo maine nahi pakda uska blast
   radius yahi khatam karta hai.
2. **Likh kar batayein:** SMTP configure hone tak koi email nahi jati (password reset
   aur fee reminder sirf in-app message banate hain), payments haath se record hote
   hain, aur plan tiers sirf seat count se alag hain.

### Jo report kiya magar theek nahi kiya

- **Plan tiers unenforced** — `assertSeatsAvailable` hi wahid plan-derived rule hai.
  Growth ka school Rs 12,999 sirf seats ke liye deta hai. Commercial faisla hai.
- **Teachers/Parents tab par empty state nahi** — Teachers par bilkul khali screen.
  Classes/Timetable ke empty states behtareen hain; ye do nahi.
- **Admin tables 375px par overflow** karti hain (parent portal theek hai).
- **`billing.test.js` ka `processedWebhookEvent.deleteMany({})`** unscoped wipe —
  **Safepay-adjacent, aap ki hidayat par nahi chhua.**
- **`POST /fees/:id/pay` galat field name par poora challan settle kar deta hai**
  (`paidAmount` chahiye). UI sahi bhejti hai; integration hazard hai.

---
## 6i. LANDING PAGE — SIRF WO JO SACH HAI (2026-08-28)

Hero par chaar bare aankre the:

```
500+ Schools    2.4M+ Students    99.9% Uptime    4.9★ Rating
```

**In mein se ek bhi sach nahi tha, aur ho bhi nahi sakta tha.** Koi school sign up nahi
hua, kisi ne rating nahi di, aur uptime ka record hai hi nahi kyunke production deployment
nahi hai. Sath mein badge "Trusted by 500+ schools across Pakistan" aur CTA "Join 500+
schools already managing smarter".

Ye wahi misrepresentation hai jo `PLANS` mein thi — wahan SMS alerts, API access aur
multi-branch beche ja rahe the jo mojood hi nahi. Wo pehle hata di gayi thi; ye reh gaye
the, aur ye **"Start free trial" button ke theek oopar** khare hain.

### Kya lagaya

```
4          11                 14           4,999
PORTALS    MODULES            DAY TRIAL    PKR MONTHLY, FROM
Platform,  Attendance to      No card      Billed per school
admin,     fee challans       required
teacher,
parent
```

Har figure agle click par check ho sakta hai:

- **4 portals** — `SuperAdmin`, `AdminPortal`, `TeacherPortal`, `ParentPortal`
- **11 modules** — admin nav se, Dashboard aur Settings nikaal kar: Students, Teachers,
  Parents, Classes, Timetable, Attendance, Fees, Messages, Notices, Reports, Billing
- **14 days** — wahi jo server deta hai (`trialDays` default)
- **4,999** — `PLANS` se `Math.min(...price)`, yani wahi list jo pricing table render
  karti hai. Dono kabhi alag nahi ho sakte.

Badge ab batata hai ke **cheez kya hai**, ye nahi ke kaun use kar raha hai:
*"Built for Pakistani schools — terms, challans and result cards"* — teeno mojood hain.

CTA se school count nikal gaya: *"Register your school and run a full session on it —
free for 14 days."*

### Ek chhota duplication bhi band kiya

Trial ke din **chaar jagah** likhe the (hero button, hero strip, plan step, summary).
Platform setting badalne par kuch jagah 14 rehta aur kuch 30 ho jata. Ab ek `TRIAL_DAYS`
constant hai — ek edit, chaar jagah.

### Sweep

Poore `App.jsx` par gadhe hue aankron ki sweep chalayi. Baqi teen hits sirf **comments**
the jo pehle theek ho chuke bugs bayan karte hain (87% donut, 12,500 wala invoice
multiplier). Yani product mein ab koi banaya hua figure nahi bacha.

### Jo jaan boojh kar nahi chhua

Asli aankre (`4 Schools · 11 Students`) dikhane ka option tha — public stats endpoint se.
Nahi kiya: wo platform ka size publicly leak karta, aur ek FYP demo par "4 schools"
likhna sach to hai magar kaam ka nahi. Jo cheezein upar hain wo sach bhi hain aur
padhne wale ke liye kaam ki bhi.

---
## 6h. SIGNUP PAR ACADEMIC SETUP, AUR TERMS KA REORDER (2026-08-28)

Do aakhri gaps, dono wahi shakal: product ek raay rakhta tha jo school se kabhi
poochi hi nahi gayi thi.

### 1. Registration ab poochta hai ke saal kaise chalta hai

Har signup ko **April-to-March saal, 33% pass mark, aur teen terms** milte the jinke
naam First/Mid/Final the. April mulk ke bare hisse ke liye durust hai aur **Karachi**
aur **Cambridge track** ke liye ghalat — aur jis school ko baad mein pata chalta, usay
session dates haath se theek karni parti thin.

Wizard ab chaar step ka hai. Naya step 4 — **Academic Year** — teen cheezein poochta hai:

```
Session starts in   [August ▾]        Pass mark %  [40]
Exam terms          1. Half Yearly    2. Annual    (+ Add a term)
```

Jo school seedha click kar ke nikal jaye usay bilkul wahi milta hai jo pehle milta tha
— defaults April/33/teen terms hain. Backend ke teeno fields optional hain, so jo
purana client signup post karta hai wo bhi nahi toota.

**Weightage yahan nahi poocha jata.** Share ek policy hai jo school soch kar deta hai;
registration form us par pakarne ki jagah nahi. Terms bin-wazan bante hain, Settings
mein diye jate hain.

Terms `ensureTerms` par nahi chhore — signup ke usi transaction mein banaye jate hain,
warna jo school do terms chalata hai uske paas teen defaults aa kar khare ho jate aur
unhe saaf karna parta.

Browser QA (Karachi school, August/40%/do terms) ke baad DB:

```
grading : {"passingPercentage":40}
session : 2026-27   2026-08-01 → 2027-07-31
terms   : 1. Half Yearly (w=null) | 2. Annual (w=null)
```

Aur Settings ka Session Rollover card wahi dikhata hai: `Aug 1, 2026 — Jul 31, 2027`.

### 2. Terms ka reorder ab delete nahi maangta

6e mein likha tha ke teen se do par jane ke liye pehle delete phir renumber karna
parta hai. Wajah `@@unique([academicSessionId, sequence])` hai: `Mid Term` position 1
par nahi ja sakta jab tak `First Term` wahan baitha hai, aur ek waqt mein ek term
hilane ka koi raasta nahi.

Us workaround ki qeemat asli thi: **delete karne par us term ke saare marks azaad ho
jate the** (`SetNull`). Yani ek cosmetic tabdeeli ke liye school apne exam records
ka rishta khota. Ye bura sauda hai.

`PATCH /institutes/me/sessions/:id/terms/order` — poora saal, us tarteeb mein jo school
chahta hai. Ek transaction ke andar do phase: pehle har term ko **negative position**
par park karo (jahan kuch takra hi nahi sakta), phir final position do. Kuch delete
nahi hota, koi mark nahi hilta.

**Poora saal dena zaroori hai.** Adhi tarteeb un terms ko jahan the wahin chhor deti,
aur aap do terms position 2 par le kar khare hote — jinme se koi bhi save nahi hota.

Route `"/:termId"` se **pehle** register hai, warna "order" ko term id samjha jata.

UI mein har row par ▲▼ hain. Browser QA: `Half Yearly / Annual` → ▲ → `Annual / Half
Yearly`, aur DB mein wahi do rows, wahi ids, wahi `createdAt` — koi delete/re-add nahi.

### Abhi baqi

Is silsile ka kaam poora hai. Aage jo mile wo naya kaam hoga.

---
## 6g. TERM WEIGHTING — ab waqai lagti hai (2026-08-28)

6e mein `ExamTerm.weightage` bana tha: store hota tha, validate hota tha, aur har
card `termsAreWeighted: true` bhi kehta tha. **Phir use karta koi nahi tha.** School
kehta "Half Yearly 40%, Annual 60%" aur card marks pool kar ke 79.5% de deta, jabke
school ki apni policy 81.2% kehti hai.

Policy qubool karna, wapas echo karna, aur phir chupke se kuch aur karna — us se behtar
hai policy offer hi na karo.

### Kya lagaya

`weightedAverage(assessments, terms)` — har term ka average nikaal kar uske share se
wazan deta hai. Do faislay jo maine liye:

**1. Sirf un terms par renormalise jo mark ho chuke.** Jo term abhi baithi hi nahi gayi
usay zero ginna December mein us bachche ko fail likhna hai jo theek ja raha hai. So
marked terms ke shares ko wapas 100 tak scale kiya jata hai, aur card **kehta hai** ke
aisa hua (`scaledUp`, `shareCounted`).

**2. Jo marks kisi term ke nahin, unka koi wazan nahi.** Class test, ya wo marks jo
school ke terms naam dene se pehle record hue. Unhe chupke se girane ke bajaye card
ginti batata hai (`marksOutsideTerms`).

Weighting **sirf saalana card par** lagti hai. Ek term ka card us term ki baat karta hai;
usay un terms ke khilaf wazan dena us sawal ka jawab hai jo kisi ne poocha hi nahi.

### Rank bhi wahi hisaab maangta hai

Ye asal cheez thi. Test ke aankre jaan boojh kar aise chune:

```
         Half Yearly   Annual    pooled   weighted 40/60
Zain         71          88       79.5        81.2
Bilal        90          70       80.0        78.0
```

Pooled: Bilal awwal. Weighted: Zain awwal. Agar card weighted percentage chhape aur
position pooled ho, to **ek hi kaghaz apne aap se jhagra kar raha hai** — aur position
wo pehli cheez hai jo Pakistani walid dekhta hai.

### Aur poori app ko bhi

Yahi ghalti dobara nikli. `Enrollment.currentScore` wo figure hai jo student list,
dono dashboards, gradebook aur class position — sab parhte hain. Wo marks pool karta
tha jabke card wazan de raha tha:

```
card:  81.2%  ·  1st of 2
list:  79.5%  ·  #2          ← ek screen ke faasle par
```

So roll-up ab **likhte waqt** weighted hota hai (`recalcEnrollment`), taake har reader
ko terms ka pata hona zaroori na ho.

### Cache ka imaandar contract

Share badalne par card foran durust hota hai (wo marks se hisaab karta hai), magar
stored roll-up purani policy par khara reh jata hai — dono taraf, weighting on karne
par bhi aur off karne par bhi. PATCH ka jawab ab batata hai kitne peeche hain:

```
"Annual" updated. Result cards use the new shares straight away;
2 stored subject score(s) refresh when their subject is next recalculated.
```

Rows ko chupke se dobara likhna aasan tha; batana behtar hai. `weightedterms.test.js`
mein ye contract pin kiya gaya hai taake koi baad mein "theek" karne ke chakkar mein
wo data na chhoo le jo school ne chhune ko nahi kaha.

### Settings mein Exam Terms card

API 6e se mojood thi, screen nahi — yani weight sirf API se set ho sakta tha. **Wahi
ghalti jo grading ki thi.** Ab admin term rename kar sakta hai, share de sakta hai,
add/remove kar sakta hai, aur live status parh sakta hai:

```
Weighted: Half Yearly 40% · Annual 60%. The annual result combines the terms in these shares.
Shares add up to 90%, not 100% — until they do, the annual result pools the marks.
Shares are optional. Leave them blank and the annual result pools the year's marks.
```

**QA ne yahan bhi meri apni ghalti pakri:** pehle har row ka apna Save button tha, aur
ek row save karte hi table reload ho kar doosri row mein type ki hui value uda deta tha.
School 40 aur 60 likhta, 40 save hota, 60 gayab — bina bataye. Ab poori table ka ek
Save hai, kyunke shares sirf ek doosre ke sath maani rakhte hain.

### Card par columns

```
Subject      Teacher  Half Yearly (40%)  Annual (60%)  Marks      Weighted %  Grade  Result
Mathematics  —        71 / 100           88 / 100      159 / 200  81.2%       A+     Pass
Total                                                  159 / 200  81.2%       A+     Pass

Weighted result. Half Yearly 40% · Annual 60% — the year is combined in those
shares rather than pooled (159 / 200 = 79.5% unweighted).

POSITION 1st of 2   ·   OVERALL AVERAGE 81.2%
```

Total row ka % ab weighted hai, pooled nahi — warna 159/200 = 79.5% ke bagal mein A+
khara hota jo 81.2% se aaya, yani ek sheet par do hisaab. Pooled figure gayab nahi
hua, neeche likha hai, taake counter par khare walid ko jawab diya ja sake.

### Ek regression jo suite ne pakri

`myClasses` par `policyFor(req.instituteId)` likha tha, magar us route par
`scopeToInstitute` chalta hi nahi (wo khud teacher profile se scope hota hai). So
`req.instituteId` undefined tha aur policy platform default par gir rahi thi — wahi bug,
ek route aage. Ab `req.user.instituteId`. Baqi tamam call sites audit kiye: theek hain.

### Abhi baqi

- Onboarding wizard mein terms aur grading poochna (screens ab hain, wizard mein nahi)
- Terms ko reorder karna abhi bhi delete + re-add hai (sequence unique constraint)

---
## 6f. GRADING KA IKHTIYAR, SIBLINGS, AUR TEACHER KE SUBJECTS (2026-08-28)

Teen cheezein jo user ne maangi thin, aur do bug jo unke neeche se nikle.

### Sab se bara bug: grading policy sirf ek document tak pahunchti thi

Section 6m mein school ko apne bands aur apna pass mark dene ka kaam hua tha, aur
wo **result card par** durust chal raha tha. Baqi product ka kya haal tha:

```
utils/grading.js      → school ke bands   ← sirf result card parhta tha
utils/academics.js    → ek doosra table   ← baqi SAB parhte the
```

`academics.js` mein apna `GRADE_BANDS` tha, aur wahi student list, admin aur parent
dashboard, teacher ki class list, gradebook, subject screen, aur `Enrollment.letterGrade`
(jo har recalculation par likha jata hai) — sab istemal karte the.

Yani school A+ ko 80 par le jaye to **card par A+ aur har screen par A−**. Settings
screen banane ka matlab hi na rehta: wo jhoot bolti.

Ye bug kisi ek endpoint ke test se nazar nahi aata tha — har endpoint apne aap se
muttafiq tha. `tests/gradingreach.test.js` isi liye likha: ek jaan boojh kar ajeeb
policy set karta hai (`TOP` at 10, `LOW` at 0, 5 points) aur phir **har** surface se
wahi sawal poochta hai. 72% ko board scale B kehta hai aur purana das-band scale A−,
so `TOP` sirf tab aa sakta hai jab wo waqai school ki policy parh raha ho.

Ab ek hi band table hai. `policyFor(instituteId)` school ki policy laata hai, aur
`academics.js` ke teen function sirf **fallback** hain un callers ke liye jinke paas
koi school nahi.

**Ek aur faisla:** har screen ab **live policy se hisaab** karti hai, `Enrollment.letterGrade`
cache se nahi. Isliye scale badalne ka asar **foran** dikhta hai — pehle har subject
ke dobara mark hone ka intezar karna parta. Cache abhi bhi likha jata hai; koi use
dikhata nahi.

### Platform default khud apne aap se ulat tha

```
purana:  A+ 90 · A 85 · A− 80 · B+ 75 · B 70 · B− 65 · C+ 60 · C 55 · D 50 · F 0
pass mark: 33
```

F pachaas se neeche, magar pass tetees par. Yani **40% wale bachche ke card par**
**"Grade F" aur "Result: Pass" ek saath**. Default ab board scale hai jiska farsh
pass mark hai:

```
naya:  A+ 80 · A 70 · B 60 · C 50 · D 40 · E 33 · F 0      pass mark 33
```

Ye **sirf default** hai — kisi school ka stored data nahi badla. Jo schools ne apni
policy set nahi ki (yani sab, kyunke screen hi nahi thi), unke card ab is scale par
parhe jayenge.

### Settings mein Grading Policy card

API 6m se mojood thi; screen nahi thi, is liye amalan koi school apni scale set nahi
kar sakta tha. Ab admin pass mark aur har band (from % · grade · points) badal sakta
hai, band add/remove kar sakta hai, aur platform default par wapas ja sakta hai.

Do cheezein jo card khud batata hai:

- **Live preview** — "A child on 72% gets A · Pass", save se pehle.
- **Tazad ki warning** — agar failing band pass mark se upar pahunche:
  `A child on 45% would be graded "D" and told they passed. Add a band starting at 45`
  `if that reads wrong.` Ye **warning hai, refusal nahi** — school ka apna faisla hai.

Component **module scope** par hai. Portal ke andar hota to har parent render par nayi
component identity banti aur React use remount kar deta — adhi type ki hui band table
ghayab. Yehi galti Fees tab mein ho chuki hai.

### Ek guardian, kai bachche

Database hamesha se ye kar sakta tha (`Student.parentId` nullable FK, `Parent.students`
list), aur CSV import guardian email se reuse bhi karta tha. Jo cheez nahi thi wo **upar**
thi:

```
Add Parent    → <Sel label="Child (Student)">   ek dropdown → studentIds:[f.child]
Edit Parent   → kuch bhi nahi
Parents list  → students.find(s => s.id === p.studentId)      ← pehla bachcha
Parent portal → db.students.find(s => s.id === parent.studentId)  ← hamesha wahi
```

Yani teen bachchon wale baap ko ya to teen alag guardian accounts milte (teen passwords),
ya wo portal par ek bachcha dekhta aur baqi do ka use pata hi na chalta.

Ab: `PickList` (checkbox list — multi-select is liye nahi ke daftar ke clerk ko ctrl-click
aana zaroori nahi), Add aur Edit dono mein; student ki taraf se bhi guardian pick ho sakta
hai; list poora khandan dikhati hai; aur parent portal par **ChildSwitcher**.

Switcher ke liye koi naya fetch nahi chahiye tha — loader pehle se har bachche ka poora
record laata tha (`students: full.map(toLegacyStudentFull)`). Sirf ye kehne ka tareeqa
nahi tha ke kaunsa. Ek bachche wale khandan par switcher chhupa rehta hai.

### Tenancy bug jo isi raaste par mila

`createStudent` hamesha check karta tha ke parent isi institute ka hai. `updateStudent`
**nahi** karta tha — `...data` seedha row mein chala jata tha:

```
PATCH /students/:myStudentId { parentId: "<doosre school ka parent>" }   → 200
```

Us guardian ke portal par doosre school ka bachcha aa jata — marks, attendance, fees
samet. Siblings ne ise **rozmarra ka raasta** bana diya, kyunke doosra bachcha jorna
update hi hai. Ab 400, aur link waqai nahi banta (`tests/siblings.test.js`).

### Teacher ke subjects

Edit form sirf name/email/phone bhejta tha. API `subjectIds` hamesha se leti thi. Ab
PickList se badle ja sakte hain.

Aur Add Teacher ki **hardcoded aath subjects** — Mathematics, Physics, Chemistry,
Biology, English, Urdu, Computer Sc., Pak. Studies — hat gayin. Wahi ghalti thi jo
term enum ki thi: platform ne poore mulk ke schools ki taraf se faisla kar liya, aur
Islamiat, Quran, Sindhi ya Accounting parhane wala school apna teacher record hi nahi
kar sakta tha. Ab list `useSubjects()` se aati hai, plus ek field naya subject banane
ke liye.

### QA ne PickList mein bug pakra

`toggle` naya set `value` prop se banata tha. Ek hi React batch mein do tick ka matlab:
dono ek hi purani prop se hisaab karte hain, doosra pehle ko mita deta hai. Browser QA
mein teen subject select the aur **do save hue**. Ab `onChange(prev => …)` — functional
update — is liye har caller ka `onChange` state setter hona chahiye.

### Browser mein verify hua (throwaway school, baad mein purge)

```
Grading   A+ 80→90, pass 33→40, save → student list mein Zain 88% ab A hai, A+ nahi
Warning   pass 45 par → 'A child on 45% would be graded "D" and told they passed.'
Parents   Ahmed Sahib → Zain · Alia · Omar, teeno grade/section/roll ke saath
Teacher   Islamiat aur Sindhi pick hue — jo purani hardcoded list mein thay hi nahi
Portal    switcher: Alia 72% A rank #2 → Zain 88% A rank #1 → Omar 41% D rank #3
Card      Omar 41/100 → D → PASS · 'pass mark 40%' — koi tazad nahi
```

### Abhi baqi

- Term weightage abhi bhi **lagti nahi** (6e dekhein) — ye kaam us par nahi tha
- Onboarding ke waqt grading poochna — screen ab hai, wizard mein nahi
- Ek parent ka doosre school mein bhi bachcha ho: `Parent` ek institute ka hai, so
  aisa khandan do accounts rakhega. Multi-tenant design ka natija hai, bug nahi.

---
## 6e. ExamTerm — SCHOOL APNE TERMS KHUD NAAM DETA HAI (2026-08-27)

### Audit ne design badla

Design se pehle audit chalaya, aur ek baat ne poora khatra hata diya:

```
ASSESSMENTS: 20
  term=null   20
```

**Ek bhi mark par term nahi tha.** Feature schema, API aur card mein poora bana hua tha
magar kabhi istemal nahi hua. Yani enum badalne ka **koi migration bojh nahi** —
`DROP COLUMN` yahan sifar rows ko chhoota hai.

### Kya bana

`enum AssessmentTerm { FIRST, MID, FINAL }` khatam. Uski jagah:

```prisma
model ExamTerm {
  academicSessionId String
  name              String     // "First Term", "Half Yearly", "Annual"
  sequence          Int
  weightage         Int?       // saalana natije mein hissa; null = weighting nahi
  startsOn          DateTime?  // sirf pre-select ke liye, kabhi override nahi
  endsOn            DateTime?
  @@unique([academicSessionId, name])
  @@unique([academicSessionId, sequence])
}
```

`Assessment.term` → `Assessment.examTermId String?` (nullable — class test kisi rasmi
term ka hissa nahi hota; **SetNull**, taake ghalti se banaya term delete karne par uske
marks na uren).

**Session se juda, institute se nahi** — wahi wajah jo enrolments ki thi: jo school teen
terms se do par jaye wo pichle saal ke card ke terms na khoye.

### Do faislay jo user ne kiye

**Default terms banein (F1a):** session ko pehli baar terms poochne par teen standard
ban jate hain — First/Mid/Final, wahi naam jo enum ke thay. School unhein rename, reorder,
delete aur reweight kar sakta hai. Ye guess hai, magar **nazar aane wala aur badla ja
sakne wala** guess — history mein pakka nahi hota.

**Weightage default null (F2a):** weighting ek policy hai jo school sarahatan chune.
`weightingIsComplete()` sirf tab true deta hai jab **har** term ka hissa ho aur sum 100
ho. Adhi configure ki hui weighting khamoshi se combined result banane se behtar hai ke
wo weighting hi na mane.

### Ek design faisla jo QA ne durust karaya

`resolveTerm` pehle sirf dhoondta tha, banata nahi. Natija: saal ka **pehla hi mark** —
jo koi card kholne se pehle record hota hai — 404 khata tha, ye keh kar ke school ke paas
wo term nahi, jabke us se poocha hi kabhi nahi gaya tha. Ab terms **jo bhi pehle poochhe**
us par ban jate hain, sirf card par nahi.

### API

`GET/POST/PATCH/DELETE /institutes/me/sessions/:id/terms` — teacher parh sakta hai (wo
terms jin ke tehat uske marks file hote hain), badal sirf admin sakta hai.

`?term=` ab **naam** leta hai, enum nahi — aur naam us session ke andar resolve hota hai,
case-insensitive. `?term=Mid Term` `?term=cmx7f…` se kaheen behtar parha jata hai aur
share ho sakta hai. Anjaan term par **404** aata hai jo batata hai school ke paas kaunse
terms hain — 422 ye kabhi na keh pata.

### Browser mein verify hua

Ek Karachi school jo do terms chalata hai: default teen se "Half Yearly (40%)" aur
"Annual (60%)" banaye, teesra delete kiya, `weighted: true` hua. Card par:

```
Full Year    2026-27 · Full Year    159 / 200   79.5%  B+
Half Yearly  2026-27 · Half Yearly   71 / 100     71%  B
Annual       2026-27 · Annual        88 / 100     88%  A
```

Picker "Full Year / Half Yearly / Annual" dikhata hai — school ke apne naam.

### Ek friction jo report karne layak hai

Teen terms se do par jane ke liye **pehle delete, phir renumber** karna parta hai —
warna `"Mid Term" already sits at position 2` aata hai. Message durust aur qabil-e-amal
hai, magar tarteeb khud samajhni parti hai. UI banate waqt ye dhyan mein rakhna.

### Jo baqi tha — sab ho chuka

> 2026-08-28 ko band hue. Yahan tarteeb ke liye chhora hai.

- ~~Weightage lagti nahi~~ → **6g**. Ab saalana natija, position aur roll-up teeno
  us par chalte hain.
- ~~Terms ka column view~~ → **6g**.
- ~~Terms aur grading ka settings UI~~ → **6f** (grading) aur **6g** (terms).

**Demo school par asar:** Beaconhouse ke 2026-27 par teen terms ban gaye (suite ke dauran
pehle use par), bina weightage aur bina kisi mark ke — wahi derived-record pattern jo
session row ka hai. `assessments with a term: 0 of 20` — kisi purane mark ko term nahi
diya gaya.

---

## 6m. GRADING POLICY + RESULT CARD (2026-08-27)

Do cheezein jo assessment ne P1 kaha tha, aur ek jo QA ne pakdi.

### 1. Grading scale aur pass mark ab school ke apne hain

`GRADE_BANDS` ek module constant thi — poore platform ke liye ek scale. Koi do Pakistani
school ispar muttafiq nahi: kahin A+ 90 par hai kahin 80 par, bohat se A/B/C par ruk jate
hain, boards ke apne bands hain, aur pass mark zyadatar 33% magar kai private schools
mein 40%. Multi-tenant product is par ek raye nahi rakh sakta.

`Institute.gradingSettings` JSON — wahi pattern jo `notificationSettings` ka hai, to
column additive hai aur naya band add karne ke liye koi migration nahi chahiye. Jis
school ne kuch set nahi kiya usay defaults milte hain.

`src/utils/grading.js` → `gradingFor(institute)` ek object deta hai: `letterGrade`,
`gradePoint`, `passed`, `gpa`, `bands`, `passingPercentage`. Object is liye ke pandrah
call sites mein se koi ek subject school ke scale par aur agla platform ke scale par
grade na kar de.

Do guards jo policy khud lagati hai: **bands ka floor hamesha 0 par** (warna neeche wala
mark bilkul ungraded aata, kyunke `bandFor` upar se neeche chalta hai), aur **do bands ek
hi percentage par nahi** (warna ek mark ke do grade hote).

`GET/PATCH /institutes/me/grading` — teacher parh sakta hai (wo scale jispar uske marks
grade hote hain), badal sirf admin sakta hai.

**Stored `Enrollment.letterGrade` dobara nahi likha jata.** Wo ek cache hai; card apne
letters live policy se banata hai, to card foran durust hota hai. Response batati hai
kitne stored grades ab purane hain — chupke se rows likh dena us se bura hai.

### 2. Card ab marks mein likha jata hai, sirf percentage mein nahi

`assessmentAverage` andar `obtained`/`total` jorta tha aur phenk deta tha. Ab
`marksTotal()` alag hai aur card par:

```
Subject       Marks      %       Grade  Result
Mathematics   86 / 100   86%     A+     Pass
Urdu          19 / 50    38%     F      Fail
Physics       56 / 75    74.7%   A      Pass
Total         161 / 225  71.6%   B      Fail
```

**Grand total marks se jurta hai, percentages se nahi.** 82% aur 36% ka average 59% hai,
magar 100 out of 150 = 66.7% — aur school ka matlab doosra hai, kyunke Urdu aadhe number
ka tha.

### 3. Card ab natija deta hai

Pehle card aankray deta tha aur parhne wale par chhor deta tha ke bacha pass hua ya nahi
— jo ek result card ka wahid kaam hai. Ab `result` block: kitne subject clear, pass mark
kya tha, aur `passed`.

**Pass hone ke liye har subject clear hona zaroori hai *aur* overall bhi** — har board ka
yehi usool. Upar ki misaal mein total 71.6% (B) hai magar natija **Fail**, kyunke Urdu
pass mark se neeche hai, aur card ye saaf kehta hai.

**Bina marks wale subject ko fail nahi gina jata** — `passed` null aata hai aur wo gintii
se bahar rehta hai. Unmarked failed nahi hota.

### Ek cheez jo QA ne pakdi — platform defaults khud se muttaziq nahi

Default bands F ko 50% se neeche har cheez kehte hain, magar default pass mark 33% hai.
Yani 38% wala bacha card par **grade F aur result Pass** dikhata hai. Ye mere code ka bug
nahi, default policy ki apni tanaqus hai.

Asal Pakistani board scale kuch yun hoti hai: A+ 80, A 70, B 60, C 50, D 40, E 33, F 0 —
jahan F waqai fail hai. **Ye default badalna har us school ke grades badal dega jisne apni
policy set nahi ki (demo data samet), is liye chhua nahi. User ka faisla chahiye.**

Har school apne liye abhi bhi theek kar sakta hai — mechanism mojood hai.

### Is area mein jo baqi tha — sab ho chuka

> Ye list 2026-08-27 ki hai. Teeno cheezein 2026-08-27/28 ko ho gayin; niche wale
> sections mein tafseel hai. Yahan is liye chhori ke tarteeb samajh aaye.

- ~~**`ExamTerm` model** enum ki jagah~~ → **6e**. Enum khatam, school apne terms
  khud naam deta hai.
- ~~**Saalana card par terms ka column view**~~ → **6g**. Har term ka apna column,
  aur weighting lagti hai.
- ~~**Grading settings ka UI**~~ → **6f**. Settings mein Grading Policy card.

Aur upar wali platform-default tanaqus (**grade F + result Pass**) bhi **6f** mein hal
hui: default scale ab board scale hai, jiska farsh pass mark par hai.

---

## 6b. ENROLMENT KA SESSION — SABOOT SE, DEFAULT SE NAHI (2026-08-27)

Step 2. Column mojood hai; **backfill abhi chala nahi**.

### Migration `20260827075815_enrollment_session` — additive

```sql
ALTER TABLE "enrollments" ADD COLUMN "academicSessionId" TEXT;   -- nullable
CREATE INDEX ...;
ALTER TABLE "enrollments" ADD CONSTRAINT ... ON DELETE SET NULL;
```

`drop|not null|unique` ka count **0**. Fingerprint aur har row count migration ke
aage-peeche same (`1e4e079717f00426`).

**Nullable jaan boojh kar, aur FK — string nahi.** String hoti to session ka naam badalne
se rows orphan ho jatin. Nullable is liye ke jis row ka session saboot se tay na ho, wo
**khali rahe aur flag ho** — farz na ki jaye. `@@unique([studentId, subjectId])` abhi
waisa hi hai; wo tab badlega jab har row mein value aa jaye.

### `scripts/backfill-enrollment-sessions.js` — report-only default

Har row ka faisla teen darjon mein, isi tarteeb se:

1. **uske apne marks** — `Assessment.takenOn` jis session ki hadd mein girta hai. Sab se
   mazboot saboot.
2. **`createdAt`**, agar koi mark hi nahi.
3. **kuch nahi.** Agar marks aapas mein ikhtelaf karein (do sessions mein bat jayein) ya
   tareekh har mumkin session se bahar ho, to row **chhori jati hai aur list hoti hai**.
   Flag kiya hua row us shakhs ka sawal hai jo school jaanta hai — rounding error nahi.

```bash
npm run sessions:backfill                      # report
npm run sessions:backfill -- --start-month 8   # August school
npm run sessions:backfill -- --apply           # likhta hai
npm run sessions:backfill -- --restore backups/enrollment-sessions-….json
```

`--apply` se pehle rollback file likhti hai, phir **ek transaction** mein: jo
`AcademicSession` rows saboot maangta hai wo banati hai, aur assign karti hai.
`isCurrent` ko haath nahi lagati — school **aaj** kaunsa session chala raha hai, ye us
ka bayan hai, aur ye script maazi bayan kar rahi hai.

### Report ka natija (April, jo user ne confirm kiya)

```
  Enrolments without a session: 24 of 24
  Decided from marks   : 13
  Decided from created : 11
  Left alone, flagged  : 0

  Beaconhouse School   2026-27   24   2026-04-01 → 2027-03-31   would be created
```

### Aur yehi wo khatra jispar user ne rok lagayi thi

Wahi data, `--start-month 8` ke sath:

```
  Decided from marks   : 11
  Left alone, flagged  : 2

  Bilal Raza — Physics    : marks span 2025-26 and 2026-27
  Zain Ahmed — Chemistry  : marks span 2025-26 and 2026-27

  Beaconhouse School   2026-27   22   2026-08-01 → 2027-07-31
```

`DEFAULT '2026-27'` in do enrolments ko khamoshi se 2026-27 mein daal deta, aur ye
haqeeqat — ke unke marks saal ki hadd par phaile hue hain — kabhi samne na aati.
**Saboot par chalne aur default par chalne ka farq yahi hai.**

### `--apply` chala (user ki manzoori se)

```
  Decided from marks   : 13
  Decided from created : 11
  Left alone, flagged  : 0
  Beaconhouse School   2026-27   24   2026-04-01 → 2027-03-31   created
  24 enrolment(s) assigned in one transaction.
```

`enrollment` 24 → 24 (sirf naya column bhara), `academicSession` 0 → 1.
Scores bilkul waise hi: **6 agrees · 7 disagrees · 11 no-marks · 0 empty** —
`inspect-scores.js` se confirm.

**Rollback drill asli data par chala:** `--restore` se 24 wapas null hue, phir dobara
`--apply` se wahi 13/11/0 natija. Round-trip sabit.

**Ek cheez jo pehli baar ghalat chhori:** script ne banayi hui session row ko
`isCurrent: false` rakha tha — jabke uska naam wahi tha jo `Institute.currentSession`
kehta hai, to string aur row ikhtelaf par aa gaye. Ab script sirf us soorat mein current
mark karti hai jab naam school ke apne `currentSession` se mile **aur** koi doosri row
wo daawa na kar rahi ho. Ye "haal ko hilana" nahi — institute wo naam pehle se le kar
chal raha hai. Baqi har saal maazi hai aur unflagged rehta hai.

### Aage (Step 3+)

- 31 enrolment query sites par session filter (default: current)
- attendance aur fee periods `startsOn`/`endsOn` se scope
- promotion naye session ke enrolments banaye, purane apni jagah chhore
- **phir** column NOT NULL aur `@@unique([studentId, subjectId, academicSessionId])`

---

## 6a. ACADEMIC SESSION — TAREEKHON WALI ASAL CHEEZ (2026-08-27)

**Ye multi-year phase ka Step 1 hai.** Audit ne do baatein saaf keen jo mere apne pehle
wale mashware ko ghalat sabit karti hain:

### Audit ka natija

**1. Maine kaha tha "attendance aur fees ko session date-range se scope karo — koi
migration nahi chahiye". Ye ho hi nahi sakta tha.** `Institute.currentSession` ek bare
string thi; April-March ka usool ek **code comment** mein tha, data mein nahi.
`"2026-27"` ko date range mein badalne ka koi zariya mojood nahi tha.

**2. `DEFAULT '2026-27'` wala backfill aaj "theek" jawab deta — aur wahi khatra tha.**
Asal data:

```
institutes    : charon currentSession = 2026-27
enrollments 24: createdAt 2026-08-14
attendance 240: 2026-05-25 → 2026-08-14
fee periods   : 2026-05 … 2026-08
promotions   0: kabhi koi nahi chali
```

April-March par ye sab waqai 2026-27 hai. **Magar wahi school August-July par ho, to
`2026-05`–`2026-07` session 2025-26 ke hain** — aur wahi backfill chaar mahine ki fees
aur teen mahine ki attendance ghalat saal mein daal deta, khamoshi se, hamesha ke liye.

> Sawal ye nahi tha ke value theek hogi ya nahi. Sawal ye tha ke wo **derive** hui ya
> **farz** ki gayi — aur baad mein koi in dono mein tameez nahi kar sakta, kyunke asal
> saboot uspar likha ja chuka hota.

**3. "Kaunsa saal" ke pehle se do representations thay:** `Institute.currentSession`
aur `AcademicClass.academicYear` — jo **caller type karta hai** aur kabhi
`currentSession` ke against validate nahi hota. `Enrollment.session` naya string add
karna unhein teen kar deta.

### Jo bana

```prisma
model AcademicSession {
  instituteId String
  name        String     // "2026-27"
  startsOn    DateTime
  endsOn      DateTime
  isCurrent   Boolean    @default(false)
  @@unique([instituteId, name])
}
```

Migration `20260827074245_academic_sessions` — **purely additive**: CREATE TABLE, 3
index, 1 FK. Verify kiya: `drop|alter table` ka count **0**, aur har row count aur
fingerprint migration ke aage-peeche bilkul same (`06f16ed9bc19acbf`).

**Dates school ki hain, platform ki nahi.** April-March Pakistani norm hai aur default
hai; Karachi aur Cambridge-track schools August-July chalate hain, aur jo school apna
saal bata hi na sake usay durust result card nahi diya ja sakta.

**`src/services/session.service.js`** — `parseSessionName`, `nextSessionName`,
`defaultSpan(name, startMonth)`, `sessionForDate`, `ensureCurrentSession`,
`moveToSession`, `reviseSessionDates`.

**`currentSession` string qayam hai — magar ab wo `isCurrent` row ka denormalised
mirror hai.** `moveToSession` dono ko **ek transaction** mein likhta hai; koi doosra
writer nahi. Aisa mirror jo apne asal se ikhtelaf kar sake, na hone se bura hai.

**Session row pehli baar poochne par banti hai** (`GET /institutes/me/session`), us naam
se jo school pehle se apne saal ko deta aaya hai. Ye jaiz derivation hai — school ke
apne naam ko naam dena. Ye us cheez se bilkul alag hai ke kisi purane mark ka session
andaze se tay kiya jaye, jo yahan koi nahi karta.

**Sessions overlap nahi kar saktin** — warna "ye tareekh kis saal ki hai" phir se
mubham ho jata, jo theek wahi masla hai jise ye table hataata hai.

### Do bugs jo QA ne pakde

**Century rollover:** `parseSessionName("2099-00")` null deta tha kyunke `"20"+"00"`
= saal 2000. Ab doosra hissa **agle saal ke against** check hota hai, chipkaya nahi
jata — `2099-00` → `{from:2099,to:2100}`, `next: 2100-01`.

**Browser mein: card `Mar 31, 2026 — Mar 30, 2027` dikha raha tha** jabke session
1 Apr → 31 Mar hai. Dates UTC midnight par pinned hain magar browser local zone mein
render kar raha tha — wahi bug jo absence alert par tha, ab client side. `timeZone:
"UTC"` se theek. Ab `Apr 1, 2026 — Mar 31, 2027`.

### Browser mein verify hua

Throwaway school par: card session ka naam **aur tareekhein** dikhata hai · "change"
se editor khulta hai, `2026-04-01`/`2027-03-31` se bhara hua · August-July daal kar save
→ `Aug 1, 2026 — Jul 31, 2027` · agle session mein jane par **dono sessions apni apni
tareekhon ke sath** rehte hain aur sirf ek current hota hai.

### Aage kya (Step 2 onwards)

Ab jo mumkin hai wo pehle mumkin nahi tha:

- `Enrollment.academicSessionId` **FK** (string nahi — session ka naam badalne se rows
  orphan na hon)
- backfill **saboot se**: enrolment ke apne assessments ke `takenOn` kis session ki hadd
  mein girte hain → phir `createdAt` → aur agar dono bahar hon to **flag karo, guess mat
  karo**. Report-only script `--apply` ke sath, wahi pattern jo `inspect-scores.js` ka hai.
- attendance aur fee periods ko `startsOn`/`endsOn` se scope karna
- promotion naye session ke enrolments banaye, purane apni jagah chhore

Manzil: `GET /students/:id/report` → Grade 9 / 2027-28, aur `?session=2026-27` → Grade 8 /
2026-27 — dono mukammal aur alag alag.

---

## 5k. `tenancy.test.js` RESET-TOKEN LEAK (2026-08-27)

`tokenreuse.test.js` isolate hone ke baad ye leak nazar aaya — pehle uska broad sweep
ittefaqan isay chhupa deta tha.

Spec ka header kehta tha *"Everything here is read-only against the seeded database"*.
Ek test us daawe se bahar tha:

```js
await request(app).post("/api/auth/forgot-password").send({ email: "admin@bhs.edu" });
```

**Aur ye read nahi hai.** `forgotPassword` jaan boojh kar us user ke har purane unused
token ko `used` stamp karta hai — *"Only the newest link should work"* — phir naya banata
hai. Yani har suite run:

1. demo admin ka koi bhi **pending reset link khamoshi se tor deta tha**
2. uske account par ek naya token chhor deta tha jise koi saaf nahi karta tha

Verify kiya tha: suite ke baad 1, dobara chalane par 2.

**Fix:** test ka maqsad user-enumeration protection hai, wo poora bacha hai — known aur
unknown dono cases abhi bhi test hote hain. Bas "known" address ab spec ka apna throwaway
admin hai. Do throwaway schools banti hain (`probe`, `bystander`), aur `afterAll` unhein
app ke lifecycle se mitati hai — `DELETE` + `/purge` — jo user cascade karta hai aur user
ke sath uske reset tokens.

Sath ek assertion barhai jo test ko asal mein mazboot karti hai:

```js
expect(await prismaRaw.passwordResetToken.count({ where: { userId: probe.userId } })).toBe(1);
```

Iske baghair test tab bhi pass hota agar `forgotPassword` asli address par kuch karta hi
na — barabar messages phir enumeration ke baare mein kuch sabit na karte, sirf ye ke
endpoint yaksan taur par bekaar hai.

**Do naye regression tests (28 → 30):**

- *leaves another user's pending reset link untouched* — bystander ka token abhi bhi
  mojood aur abhi bhi `usedAt: null`.
- *creates its token on the throwaway account and nowhere else* — charon demo users mein
  se kisi ne is run mein koi reset token hasil nahi kiya.

**Probe se sabit** (throwaway users par, demo data bilkul nahi chhua; chala kar delete):
enumeration ko us account par point karo jo pehle se pending link rakhta ho, aur
regression foran fail hoti hai — `expected 2026-08-27T07:10:07.004Z to be null`. Wahi
toota hua link jo demo admin ka tootta tha.

### Saboot: spec ab demo tokens ko chhoti hi nahi

```
BEFORE  passwordResetToken rows: 1
          created 06:45:44 | used: no | admin@bhs.edu
        npx vitest run tests/tenancy.test.js   →  30 passed
AFTER   passwordResetToken rows: 1
          created 06:45:44 | used: no | admin@bhs.edu
```

Wahi ek row, wahi timestamp, abhi bhi unused. Na naya bana, na purana mita, na stamp hua.

**Ek alag cheez jo isi dauran nazar aayi:** poore suite ke aage-peeche count 2 → 1 hua.
Wo kisi test ne nahi kiya — `startMaintenance()` server start par foran chalta hai aur
`purgeExpiredResetTokens()` har **used ya expired** token hata deta hai. Jo gaya wo
`used: yes` tha. Ye app ki apni durust housekeeping hai, test ka asar nahi.

### Test architecture cleanup — BAND

| Spec | Pehle | Ab |
|---|---|---|
| `import.test.js` | Beaconhouse mein import, unscoped parent delete | apna school, purge lifecycle (5i) |
| `tokenreuse.test.js` | demo users ke sessions revoke + token sweep | apne users, purge lifecycle (5j) |
| `tenancy.test.js` | demo admin ka reset link torta tha | apna throwaway account (5k) |

**Koi spec ab seeded/demo data mutate nahi karta.** Baqi sab `deleteMany` id, institute
ya spec ke apne stamp se scoped hain (audit kiya).

---

## 5j. `tokenreuse.test.js` TENANT ISOLATION (2026-08-27)

Spec ka apna header kehta tha *"No seeded record is modified"* — jo us kaam ka sahi
bayan nahi tha jo wo karti thi:

- **`admin@bhs.edu`** par reuse detection chalati thi, jiska poora maqsad hi us account
  ke **har live session ko revoke** karna hai — to koi asli admin jo kahin aur signed in
  ho, khamoshi se kat jata.
- **`hassan@bhs.edu`** aur **`sara@gmail.com`** par forced password reset chalati thi, jo
  un ke sessions bhi revoke karta hai.
- Cleanup mein `passwordResetToken.deleteMany({ where: { userId } })` — jo us user ka
  **har** reset token le jata hai, sirf test ka banaya hua nahi.

Sessions revoke karna aur reset tokens mitana hi wo amal hain jo yahan test ho rahe hain —
is liye is spec ka koi aisa version mumkin nahi tha jo asli accounts par mehfooz ho.

**Ab:** apne throwaway schools signup karti hai, apna admin (H5 ka nishana), apna teacher
aur parent (H6 ke do targets), aur ek **bystander school** jise wo kabhi chhoti nahi.
Cleanup app ke apne lifecycle se — `DELETE /institutes/:id` phir `/purge`. Users institute
ke sath cascade hote hain, aur `RefreshToken`/`PasswordResetToken` dono users ke sath
(`onDelete: Cascade`). Cross-institute 404 test ab bystander ke admin par chalta hai,
`admin@lacas.edu` par nahi.

**Teen naye tests (9 → 12):**

- *leaves another user's live session and reset token exactly as they were* — bystander
  ka session aur uska pehle se plant kiya hua reset token, sab H5/H6 mutations ke baad
  bhi jyun ke tyun.
- *never touched a seeded demo account* — charon demo users mein se kisi ne is run mein
  koi session hasil nahi kiya.
- *takes its own users, sessions and reset tokens with it when purged* — purge ke baad
  user, refreshTokens, passwordResetTokens aur institute, sab ja chuke.

**Purana nuqsan probe se sabit kiya** (`tests/oldshape.probe.test.js`, chala kar foran
delete — poori tarah throwaway users par, demo data bilkul nahi chhua):

1. purani cleanup ne wo reset token bhi le liya jo test ne banaya hi nahi tha
2. kisi account par reuse detection chalane se uske **saare** live sessions revoke ho gaye

**Ek naming trap:** H6 ka assertion `expect(body).not.toMatch(/token/i)` hai, aur response
target user ka naam aur email echo karta hai — to fixtures ka naam "Token Teacher" rakhne
se test **fixture par** fail hota tha, product par nahi. Fixtures ab `rot.` / `Rotation`
hain.

### Ek pehle se mojood leak jo is tabdeeli ne behnaqab kiya

`tests/tenancy.test.js` `POST /auth/forgot-password` ko **`admin@bhs.edu`** par chalati hai
(ye check karne ke liye ke jawab batata nahi ke email mojood hai ya nahi). Wo call ek asli
**password reset token banati hai** demo admin ke liye, aur spec usay saaf nahi karti.

Pehle ye chhupa hua tha kyunke `tokenreuse.test.js` ka broad sweep ittefaqan usay bhi le
jata tha. Ab sweep nahi raha, to token jama hone lagta hai — verify kiya: suite ke baad 1,
`tenancy.test.js` dobara chalane par 2.

Asar halka hai (token expire ho jata hai, aur uska plaintext kisi ke paas nahi), magar ye
hai demo account par pending state jo har run par barhti hai. **Yehi family, P1, abhi
chhua nahi** — user ka scope sirf `tokenreuse.test.js` tha.

---

## 5i. `import.test.js` TENANT ISOLATION (2026-08-27)

Ye spec **seeded Beaconhouse School** — asli demo institute — mein import karti thi
(`admin@bhs.edu` se login karke), aur cleanup mein har us parent ko hard delete karti thi
jiske email mein `example.c` ho, bina kisi institute scope ke. Us jori ne QA ke darmiyan
ek doosre school ka guardian hamesha ke liye mita diya tha.

**Ab wahi karti hai jo baqi har spec karti hai:** apna throwaway school signup karti hai,
usmein import karti hai, aur baad mein usay **app ke apne lifecycle se** mitati hai —
`DELETE /institutes/:id` phir `/purge`. Purge schema ke apne cascades se school ke
students, guardians aur users sath le jata hai, aur banawat ke lehaz se kisi doosre
tenant tak pohanch hi nahi sakta. **Koi bhi cleanup ab condition se rows nahi chunta.**

```js
const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged  = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  if (purged?.status === 200) return true;
  await prismaRaw.institute.delete({ where: { id } }).catch(() => {});  // wahi ek id
  return false;
};
```

**Teen naye tests (12 → 15):**

- *imports into this spec's own school and nowhere else* — CASEFOLD rows apne institute
  mein hain, kahin aur nahi, aur demo institute mein na `Import Probe` na CASEFOLD.
- *cleanup cannot reach a guardian of the same name in another school* — **wo regression
  jiske liye ye kaam hua.** Do throwaway schools, dono mein ek hi guardian email; ek ko
  purge karo, doosre ka guardian apni jagah rehna chahiye. Ye asli `purgeSchool` chalata
  hai jo `afterAll` istemal karti hai, uski copy nahi.
- *takes the purged school's own records with it* — purge ke baad students, parents aur
  institute teeno ja chuke hain.

**Purani shape par ye test fail hota hai.** Probe copy mein `purgeSchool` ko purani
unscoped substring-delete se badal kar chalaya:

```
× cannot reach a guardian of the same name in another school
  AssertionError: expected [] to have a length of 1 but got +0
```

Yani bystander school ka guardian bhi mar gaya — theek wahi bug jo hua tha.

**Isolation verify hui:** 0 leftover test schools; Beaconhouse mein 8 students / 4 parents
jyun ke tyun, 0 `Import Probe`, 0 CASEFOLD, 0 casefold guardian; poore database mein
0 `@test.edu` users. Har domain table ka row count before/after bilkul barabar.

**Ek aur spec par yehi baat baqi hai:** `tokenreuse.test.js` seeded demo users par chalti
hai (`hassan@bhs.edu`, `sara@gmail.com`) — unke liye reset token jari karti hai aur unke
sessions revoke karti hai. Passwords nahi badalti (charon demo logins verify kiye, sab
200), magar iska cleanup ek pehle se mojood `passwordResetToken` bhi le gaya. Yehi
family hai — **P1, abhi chhua nahi.**

---

## 5h. SCORE DECISION — TAHQEEQ, TABDEELI NAHI (2026-08-26)

Option A lagne ke baad `reconcile-scores.js` ne 24 mein se 18 rows flag kiye. **`--apply`
nahi chalaya gaya.** Pehle `scripts/inspect-scores.js` likhi — bilkul read-only — taake
faisla se pehle qeemat nazar aaye.

### Sab se ahem baat: wo 11 rows orphan nahi hain

| Signal | Natija |
|---|---|
| `previousScore` set | **11 / 11** |
| coherent `predictedScore` | 11 / 11 |
| `letterGrade` score se mutabiq | 11 / 11 |
| kisi message/notice mein quoted | 0 |
| aiInsight ya koi stored report | 0 (result card on-demand banta hai) |

Current + previous + prediction, magar koi assessment nahi — ye theek us school ki
shakal hai jo **kaghazi register se grades utha kar laaya** ho. Ek asli orphan (typo,
stray write) ke sath pichle term ka mutabiq snapshot nahi hota.

**Yani Option A ka set khali hai:** koi bhi row "clearly orphaned" nahi.

### Clear karne ka asar (simulated, likha kuch nahi)

```
  STUDENT         SUBJECTS   AVG NOW   AVG AFTER  GPA NOW   GPA AFTER  RANK
  Ayesha Khan     6 (−3)     75.7      66.7       3.17      2.57       1/1  unchanged
  Bilal Raza      6 (−3)     65.7      56.0       2.62      2.00       3/6  unchanged
  Zain Ahmed      6 (−1)     84.8      82.9       3.67      3.60       2/6  unchanged
  Hania Malik     6 (−4)     91.3      93.3       4.00      4.00       1/6  unchanged
```

**Hania ka average barh jata hai (91.3 → 93.3)** kyunke uske cleared subjects uske
average se neeche thay. `calculateGpa` aur `averageScore` null ko **exclude** karte hain,
zero nahi ginte — is liye kam score hatane se student upar chala jata hai. Ye sabit karta
hai ke blanket clearing koi ghair-janibdaar "correction" nahi: ye tay karta hai kaun kis
se aage hai.

Rank sirf is liye nahi hila ke in classes mein teen students ke koi score hain hi nahi
(HAFSA, shanawar bhatti, Fatima — sab 0), jo tarteeb ko pin kar deta hai. Asli class
mein ye hilta.

> **Note (2026-08-30):** ye simulation us waqt ke data par chali thi. HAFSA tab se
> purge ho chuki hai (section 8), is liye aaj ye ginti dobara nahi banegi. Natija
> aur faisla waise hi qaim hai — sirf raqmein dohrayi nahi ja saktin.

### Faisla: 11 rows mehfooz rehte hain (Option C)

Option A ka invariant **naye writes** par hukmran hai — aur wo pehle hi lag chuka hai, to
aisi nayi rows ab ban hi nahi saktin. Usay peeche ja kar school ka historical record
mitane ke liye istemal karna alag cheez hai, aur wo school ka faisla hai.

Jo 7 rows apne marks se ikhtelaf rakhti hain wo alag maamla hain — un ke peeche saboot
**hai**. Magar unmein bhi kuch aise lagte hain jahan term grade quizzes ka saada mean
nahi (Zain Chemistry 72% vs 3 quizzes ka 58.3%). Un ke liye per-subject
**Recalculate** button pehle se mojood hai — jo teacher subject jaanta hai wo faisla kare.

### `scripts/apply-score-decision.js` — reversible, per-id

Jaan boojh kar `reconcile-scores.js --apply` se alag: wo condition se rows chunta hai,
aur condition yahan ghalat auzaar hai.

- **ids ke baghair chalta hi nahi** — koi broad condition nahi
- report-only default; `--apply` sarahatan
- before/after har row ka
- ek transaction — sab ya kuch nahi
- `--apply` se **pehle** `backups/scores-<stamp>.json` likhta hai
- `--restore <file>` bilkul wahi purani values wapas laata hai
- guidance: pehle `npm run db:backup` + `npm run db:verify` (fingerprint note karo)

```bash
npm run scores:inspect                    # read-only report
npm run scores:decide -- --ids a,b        # dry run
npm run scores:decide -- --ids a,b --apply
npm run scores:decide -- --restore backups/scores-….json
```

Dono dry runs chalaye gaye; fingerprint `bf23aa2d48f0c5de` par wahi raha, `enrollment`
ka `updatedAt` 09:47 par hi khara raha. **Kuch nahi likha gaya.**

---

## 5g. MARKS ARE THE TRUTH + ABSENCE ALERTS (2026-08-26)

### Faisla: Option A — `currentScore` ab derived cache hai

Pehle iske **teen** writer thay:

| Writer | Number kahan se |
|---|---|
| `recalcEnrollment` | assessments se derive |
| `updateEnrollment` (Quick Grade Entry) | jo teacher ne type kiya |
| `enrollStudent` | enrolment ke waqt diya gaya |

Aakhri write jeet jata tha, khamoshi se. Result card wo number chhap sakta tha jise
neeche parhe marks jhutla dete — aur bilkul yehi number le kar Pakistani parent test
paper hath mein le kar school aata hai.

**Ab sirf marks likhte hain.** Hath se likhne wale dono raaste 400 dete hain
(*"Subject scores come from marks now. Record the mark with POST /api/assessments"*) —
khamoshi se drop nahi karte, taake purane client ko pata chale kahan jana hai.

`recalcEnrollment` ka early-return bhi hata: pehle marks na hone par purana number
wahin chhor deta tha, yani aakhri assessment delete karne se bhi ek score khara rehta
tha jiske peeche kuch nahi. Ab null ho jata hai.

**Quick Grade Entry → Quick Marks Entry.** Ab wo asli `Assessment` banati hai: mark ka
naam, kitne mein se, aur term. Jo teacher pehle bhi kar raha tha, ab record hota hai.

**`scored` flag (adapter):** enrolment ab bina score ke shuru hota hai, aur adapter
`score: s.score ?? 0` karta tha — yani jis subject par koi mark nahi wo parent ko
**"0%"** dikhta, jo bilkul alag aur bohat bura dawa hai. `score` numeric hi hai (bars aur
arithmetic uspe chalte hain) magar sath `scored` boolean hai; parent/admin ki subject
lists ab "no marks" kehti hain.

**Purani rows ke liye `npm run scores:reconcile`** — report-only, `--apply` par likhta hai
(wahi pattern jo `fix-timetable-conflicts.js` ka hai). Is database par abhi:

```
  Enrolments examined: 24
  Disagreeing with their marks: 7
  Scored with no marks at all:  11
```

**`--apply` NAHI chalaya gaya.** Wo 11 enrolments ke score blank kar dega (Urdu, English,
Pak. Studies waghera) — GPA girega, rank badlega, result card un subjects par khali
hoga. Ye asli demo data hai aur faisla user ka hai.

### Feature: ghair-hazri par usi din guardian ko khabar

Settings mein "Attendance alerts" ka switch shuru se mojood tha, likha tha
*"Messages a guardian when their child is marked absent"* — aur
`grep -rn attendanceAlerts src/` ka **sirf ek** hit tha: khud uski definition. Kuch bhi
usay parhta nahi tha, kabhi kuch bheja nahi gaya. School ye samajh sakta tha ke parents
ko bataya ja raha hai.

`src/services/absence.service.js` — do usool poori shakal tay karte hain:

1. **Sirf ABSENT mein transition batayi jati hai.** Teacher register save kare, ek ghalat
   mark dekhe, dobara save kare — subah ki ghair-hazriyan dobara nahi jatin. Likhne se
   **pehle** stored status se muqabla hota hai.
2. **Ek guardian ko ek message, har bache ka alag nahi.** Do bache ek din ghair-hazir
   hon to ek message dono ke naam ke sath — wahi shakal jo fee reminder ne tay ki thi.

Notification kabhi register ko fail nahi karti. Register hi asal record hai.

**Mera apna bug, QA mein pakda:** school ka din UTC midnight par store hota hai, aur main
usay server ke local zone mein format kar raha tha — Wednesday ke register par guardian
ko "Tuesday" jata tha. Message ki wahi ek cheez hai jo lazmi sahi honi chahiye, kyunke
parent ne bache se usi din ke baare mein poochna hai. `timeZone: "UTC"` se theek hua.

### P0 bug: admin ka "Save Attendance Record" kabhi chala hi nahi

Browser QA mein pakda. Handler ki **pehli line**:

```js
setSaving(true);setErr("");setSaved("");   // ← is component mein `saved` state hai hi nahi
```

`ReferenceError` pehli line par: `try` block mein dakhil hi nahi hota, koi register kabhi
submit nahi hota, aur `finally` bhi nahi chalta to button hamesha ke liye "Saving…" par
atka rehta hai. Admin attendance bilkul kaam nahi karti thi. Ye line tab chhoot gayi thi
jab success message portal banner par gaya tha.

### P0 bug: ek test poore database se parents delete kar raha tha

`tests/import.test.js` ka cleanup:

```js
await prismaRaw.parent.deleteMany({
  where: { email: { contains: "example.c", mode: "insensitive" } },
});
```

Comment mein iska difa tha ke RFC 2606 wala domain hai to "safe" hai. Do baatein ghalat
thin: ye **substring** match hai, domain match nahi — `rana@textexample.com.pk` aur
`head@school-example.ca` jaise asli pattern bhi match karte hain. Aur ye kisi cheez se
scoped nahi tha: na institute, na stamp.

**Isne isi session mein, QA ke beech, ek doosre school ka guardian hamesha ke liye delete
kar diya** — theek wahi blast radius jo test suite ke paas nahi hona chahiye. Ab wo
guardians id se delete hote hain jo isi spec ke students se jure hain.

Baqi tests ke `deleteMany` bhi dekhe: sab id/institute/stamp se scoped hain. Ek
istisna `billing.test.js` ka `processedWebhookEvent.deleteMany({})` hai — wo payment
provider ka ledger hai aur aap ki hidayat par **chhua nahi gaya** (abhi 0 rows).

---

## 5f. PART PAYMENT + PRINTED CHALLAN (2026-08-26)

### Bug: adhi fees lene se poori invoice PAID ho jati thi

`payInvoice` jo raqam milti usay le kar invoice ko **hamesha `PAID`** kar deta tha.
Yani Rs. 11,500 ke challan par Rs. 3,000 dene se poora challan settle:

- bache hue Rs. 8,500 `pending` se nikal jate
- defaulters report se nikal jate
- reminders se nikal jate
- `feeStats` PAID row ka `paidAmount` collected mein ginta tha — to Rs. 8,500
  **na collected mein thay na outstanding mein**

Aur Pakistani school office mein adhi fees lena aam baat hai, koi kona-case nahi.
Paisa khamoshi se kitabon se ghayab ho jata tha.

**Ab:** `paidAmount` ek **running total** hai, settlement flag nahi. `PAID` sirf tab
jab balance sifar ho jaye. Jitni raqam bache us se zyada dene par 400 aata hai jo
batata hai kitna baqi hai. Adhe paid challan par status wahi rehta hai jo tha — jo
pehle se OVERDUE tha wo kuch dene se chupke se current nahi ho jata. `paidAt` tab tak
khali rehta hai jab tak challan clear na ho, taake "Paid On" jhoot na bole.

### Bug: ek hi raqam paanch jagah alag-alag jurti thi

`netAmount`/outstanding ka hisaab **paanch jagah haath se likha hua tha** — fee
controller, student list, student detail, parent dashboard, parent children — aur wo
bikhar chuka tha: ek `amount` raw jorta tha, teen discount/lateFee minus karte thay,
aur **kisi ne bhi `paidAmount` minus nahi kiya**. Ab sab `src/utils/fees.js` parhte hain:
`netAmount`, `balanceOf`, `isOutstanding`, `outstandingTotal`.

### Bug: student list ka dues figure sirf 12 invoices dekhta tha

List `feeInvoices: { take: 12 }` ke sath aati hai (display ke liye), aur `duesOutstanding`
usi kate hue set se jur raha tha. 12 se zyada invoices wale khandan ko **kam dues**
dikhte thay — theek us screen par jahan office paise ka taqaza karta hai. Ab dues alag
query se aate hain jo poora ledger dekhti hai.

### Feature: challan aur receipt chhapte hain

School ka poora kaam do parchon par chalta hai — challan jo ghar wale counter/bank le
jate hain, aur receipt jo office wapas deta hai. **Dono mein se koi mojood nahi tha.**
Heads, discounts aur part payments sirf office ki screen par nazar aate thay.

`FeeSlipModal` ek hi component hai kyunke ye **ek hi document ki do haalatein** hain:
jab tak kuch baqi hai wo challan hai, clear hote hi wahi parcha receipt ban jata hai.
Invoice ki apni haalat se faisla hota hai, do buttons de kar nahi — warna office us
paise ki receipt jari kar sakta jo aaya hi nahi.

Wahi `@media print` machinery jo Result Card use karta hai (`.ec-print-card` /
`.ec-no-print`). Admin Fees table aur parent portal, dono par.

**Browser mein verify hua:** Rs. 15,000 ka 3-head challan → Rs. 6,000 part payment →
banner "Rs. 9,000 still due", row par "Rs. 9,000 due · Rs. 6,000 received", KPI
Collected 6,000 / Outstanding 9,000 (fix se pehle Outstanding 0 hota). Phir baqi
Rs. 9,000 → "challan cleared", wahi parcha FEE RECEIPT ban gaya. Method dropdown se
JazzCash chuna aur DB mein `method: "JazzCash"` pohancha. 375px par page overflow nahi,
table apne andar scroll karti hai, dono dialogs pooray aate hain.

**Jo ye jaan boojh kar NAHI karta:** har instalment ki apni tareekh/method/reference
nahi rakhta — `method` aur `reference` par aakhri payment likhta hai. Har qist ka
alag record `FeePayment` table maangta hai; audit log mein har `fee.payment` amount
samet mojood hai, magar wo first-class ledger nahi. Ye P1 hai.

---

## 5e. ONBOARDING CREDENTIALS (2026-08-26)

**Shikayat:** "Super Admin portal se institute add karta hoon, institute email deta hoon,
magar us mail par credentials nahi jate."

**Ye email ka masla nahi tha. Bhejne ko koi credentials thay hi nahi.**

`POST /api/institutes` institute banata tha aur uska pehla subscription invoice — bas.
Koi admin `User` nahi, koi password nahi, `sendWelcome` ka koi call nahi. Aur jo button
isay call karta hai uspe likha hai **"Create & Send Credentials"**. School live ho jata
tha aur us mein daakhil hone ka koi raasta nahi hota tha — aur screen par kuch nahi kehta
tha ke aisa hua hai. Isi database mein ek aisa institute mila jiska yahi haal tha:
**zero users**.

Ye baat khaas is liye chhupi rahi ke self-service signup (`/auth/signup`) admin banata
**hai** — to "institute banane" ka ek raasta theek chal raha tha aur doosra nahi.

**Teen jaga fix hui, kyunke rasta teen jaga toota hua tha:**

**1. Schema — admin ab lazmi hai.** `createInstituteSchema` mein `adminName` +
`adminEmail` required, `adminPassword` optional. Optional isliye nahi rakha ke
*"jis school mein koi ghus hi nahi sakta wo adhoora record nahi, kharab record hai"* —
schema ab aisa banane se inkaar karta hai (422). `updateInstituteSchema` in fields ko
`.omit()` karti hai: school edit karna uske admin account ko kabhi nahi chhoota.

**2. Controller — ek transaction.** Institute + ADMIN user + pehla invoice ek sath likhe
jate hain, to wo aapas mein alag ho hi nahi sakte. Duplicate admin email par 409. Phir
`sendWelcome`, aur mail na ja sake to temporary password response ke message mein wapas
aata hai — theek waise jaise teacher/parent banane par hota hai.

Ye welcome mail institute ki apni "Welcome emails" preference par gated **nahi** hai,
jaan boojh kar: wo preference school ki hai apne staff ke liye. Ye mail platform ki taraf
se naye school ko uski apni chaabi dena hai, aur us school mein abhi koi hai hi nahi jo
preference set karta.

**3. `api/client.js` — message discard ho raha tha.** Ye sab se ahem hissa hai. Client
sirf `payload.data` unwrap karta tha aur `payload.message` phenk deta tha. Yani server ka
poora soch samajh kar banaya gaya design — "mail na jaye to credentials screen par dikha
do" — client ki seedh par mar jata tha.

**Aur ye sirf institutes ka masla nahi tha:** teacher aur parent banane par bhi wahi temp
password isi tarah zaya ho raha tha. Har teacher/parent login jo is UI se bana, uska
password kisi ko bataya hi nahi gaya. Ab `__message` **non-enumerable** property ke taur
par response par lagta hai — non-enumerable is liye ke is app mein responses ko
`{...res}` kar ke request bodies aur component state mein daala jata hai, aur ek aam
property un sab ke sath ghusti chali jati.

**UI:** modal mein "Who runs this school" section (Admin Name + Admin Email), aur natija
portal ke apne banner par:

```
QA Onboard School … created. Admin qa.principal.…@example.com,
temporary password: EC-b2f53e49 (no mail server configured).
```

Browser mein us password se login kar ke verify kiya: `200`, role `ADMIN`, sahi school.
Teacher/parent modal ab bhi yahi message dikhata hai.

**SMTP is environment mein configured nahi hai** aur na banaya gaya. Jo yahan verify hua
wo ye hai ke account banta hai, login kar sakta hai, aur mail na jane par password us
insaan ke samne aata hai jisne account banaya. **Asli email delivery test nahi hui.**

---

## 5d. FEE HEADS (2026-08-26)

Pakistani challan **ek slip par kai charges** leke chalta hai — us mahine ki tuition,
transport, exam fee jab exam us mahine parhe, April mein annual charges. Pehle product
ke paas ek `amount` aur ek free-text `title` tha, to jis parent ko Rs. 8,000 ki jagah
Rs. 11,500 dikhta uske paas parhne ko kuch nahi tha, aur office ke paas dikhane ko kuch
nahi tha.

**Schema (migration `20260826153805_fee_heads`, 0 destructive statements):**

```sql
CREATE TYPE "FeeHead" AS ENUM ('TUITION','ADMISSION','ANNUAL','EXAMINATION',
                               'TRANSPORT','HOSTEL','LIBRARY','SPORTS','LAB','MISCELLANEOUS');
CREATE TABLE "fee_items" (...);   -- + 1 index, 1 foreign key (ON DELETE CASCADE)
```

Migration `fee_invoices` ko **bilkul haath nahi lagati**. Verify kiya gaya: pehle 16
invoices, baad mein bhi 16.

**Ek hi invariant, aur poora design usi par khara hai:**

> `FeeInvoice.amount` authoritative total rehta hai, aur jab bhi lines mojood hon wo
> unke sum ke barabar rakha jata hai.

Iska seedha faida: stats, reminders, defaulters report, result card — kisi ko heads ka
pata hona zaroori nahi. Jo 16 invoices heads se pehle bane the, unke koi items nahi, aur
wo hu-ba-hu pehle jaisi chalti hain (UI un par toggle tak nahi dikhati). Browser mein
dono shakalain verify hui hain.

**API:**

| Endpoint | Kya badla |
|---|---|
| POST `/fees` | `amount` ab optional — magar `amount` ya `items` mein se ek lazmi (warna 400). Items dene par total unka sum banta hai; sath likha `amount` ignore hota hai, taake do aankray kabhi aapas mein na larain. |
| PATCH `/fees/:id` | `items` poora set replace karta hai; `[]` bhej kar wapas flat challan banta hai. Itemised challan ka sirf `amount` badalna **400** deta hai — batana parega kaunsa head hila. |
| POST `/fees/generate` | Optional `items` = us mahine ka standard breakdown, run ki har **nayi** invoice par. |
| GET `/fees`, `/fees/:id` | `items` sath aate hain. Parent/student reads (student detail, `/parents/children`) mein bhi. |

**`generate` do bulk queries mein likhta hai, jaan boojh kar.** `createMany` nested rows
nahi likh sakta, aur `skipDuplicates` ye nahi batata ke kaun naya tha — is liye us period
ki wo invoices jinke abhi tak koi lines nahi, wahi itemise hoti hain. Isi se dobara
chalane par pehle se jari challan aur uski mojooda lines chhoot jati hain, jo ek billing
run ka theek behaviour hai. Test isi ko pin karta hai.

**UI:**

- Admin → Fees → amount par click se us challan ka breakdown khulta hai. Toggle sirf
  itemised challan par aata hai.
- **Generate Invoices ab ek dialog hai.** Pehle ye button seedhe fire hota tha aur sath
  sirf `period` bhejta tha — yani school sirf apni standing monthly fee hi bill kar sakta
  tha, aur kuch nahi. Ab line builder hai, total live jurta hai (type nahi hota), aur
  breakdown khali chhorne par pehle jaisa flat amount bill hota hai.
- Parent → Fees → har mahine ki row khul kar batati hai ke paisa kis cheez ka hai.

**Raaste mein mila bug — PATCH `/fees/:id` par koi schema hi nahi thi.** Body seedhi
Prisma `update` mein spread ho rahi thi. `instituteId` strip hota tha, `student` nahi —
aur scoping body ko dekhti hi nahi. Chunanche:

```
PATCH /api/fees/<apni invoice>   { "student": { "connect": { "id": "<doosre school ka student>" } } }
→ 200, invoice us doosre school ke student par chali jati hai
```

HEAD ke code par probe chala kar confirm kiya gaya:
`{status:200, movedToOtherSchoolsStudent:true}`. `updateInvoiceSchema` lagne ke baad wahi
probe: `{status:200, movedToOtherSchoolsStudent:false}` — zod unknown keys strip kar deta
hai. Test `tests/feeheads.test.js` mein pinned hai.

**Doosra bug — Fees tab ka koi action kabhi confirm hi nahi karta tha.** Har action
`onReload()` par khatam hota hai, jo `db` swap karke tab ko remount kar deta hai, to local
state mein rakha message usi lamhe zaya ho jata tha. Recorded payment, billing run,
**aur failed run ka error tak** — kuch nazar nahi aata tha. Portal ka mojooda
`PortalFeedback` (`setPNote`/`setPErr`) pehle se isi maqsad ke liye maujood tha; Fees tab
ne use kiya hi nahi tha. Ab karta hai. Browser mein pehle "(no note)", fix ke baad
"0 invoice(s) generated for Aug 2026, 2 already existed."

**Jo ye jaan boojh kar NAHI karta:**

- per-student ya per-class fee structure nahi banata. Heads ek challan par likhe jate
  hain; "Grade 8 ki tuition itni hai" wala structure alag feature hai.
- discount/lateFee ko heads mein nahi ghaseetta — wo invoice par pehle se hain aur
  breakdown ke neeche alag se dikhte hain, taake heads ka sum aur payable dono saaf rahen.
- purani invoices ko retro-fit nahi karta.

---

## 6. SECURITY / SCOPING — genuine bugs jo mile aur fix hue

**🔴 Bug A — Parent poora institute timetable dekh sakta tha**
`GET /api/timetable` par PARENT ke liye **koi scoping thi hi nahi**. Parent ko 60 slots, dono classes milte the (doosri class ke teachers, subjects, rooms). UI mein leak nahi hota tha (wo `/students/:id` use karti hai) lekin API khuli thi.

**🔴 Bug B — Teacher apni scoping bypass kar sakta tha**
Scoping query params par conditional thi: `if (!grade && !teacherId)`. `?grade=Grade 9` bhejne par teacher ko 30 slots aur 6 doosre teachers ka poora schedule mil jata tha.

**Root cause (dono ka ek):** scoping **query params par** lagi thi, **role par nahi** — filter scope ko widen kar sakta tha.

**Fix (`src/controllers/timetable.controller.js`, `getTimetable`):** role scoping ab **hamesha** lagti hai, query filters sirf **narrow** kar sakte hain. TEACHER → hamesha apna `teacherId`. PARENT → sirf apne bachchon ki `(grade, section)`; bachche na hon to khali (poora school nahi).

**Verified:**

| Test | Pehle | Ab |
|---|---|---|
| Parent plain | 60 slots, 2 classes | 30 slots, sirf Grade 8-A |
| Parent `?grade=Grade 9` | 30 slots | **0 slots** |
| Teacher `?grade=Grade 9` | 30, 6 teachers | 5, sirf Mr. Hassan |
| Teacher `?teacherId=other` | — | 11, sirf Mr. Hassan |

**3 regression tests** `tests/classes.test.js` mein add hue.

### 🔴 Bug C — Teacher kisi ka bhi notice rewrite kar sakta tha (2026-08-23)

Teacher portal ko Notices post karne ki UI dete waqt ye nikla: `updateNotice` mein **ownership check tha hi nahi.** Teacher ka `PATCH /api/notices/:id` kisi bhi same-institute notice par 200 deta tha — principal ka announcement bhi. Notices board teacher ko poore institute ke notices dikhata hai, is liye har id uske paas pehle se mojood thi.

**Fix (`src/controllers/notice.controller.js`, `updateNotice`):**

```
TEACHER + kisi aur ka notice  →  403 "You can only edit notices you posted yourself"
```

**403 rakha, 404 nahi** — baqi jagah 404 is liye hai ke id probe na ho sake, magar yahan teacher notice pehle se dekh sakta hai, to chhupana sirf confusion deta. ADMIN/SUPERADMIN apne institute mein kuch bhi edit kar sakte hain, pehle ki tarah.

**UI ka usool:** Teacher card par Edit badge **sirf apne notices par** aata hai (`n.authorId === user.id`), aur Delete kahin nahi — kyunke backend teacher ko delete karne hi nahi deta, aur na-chalne wala button dikhana jhoot hai.

**Baqi authorization (verified, sahi):** teacher/parent class create → 403; admin `/institutes` → 403; unauthenticated → 401; cross-tenant institute read/edit → 403; parent doosra student → **404** (403 nahi — id probe na ho sake); messaging cross-tenant → 403; notice body mein doosre institute ka `instituteId` → **403** (silently ignore nahi hota — `scopeToInstitute` reject karta hai).

### 🔴 Bug D — Teacher ka apna "Parents only" notice uske board se ghayab

Section 4 mein tafseel. Fix `listNotices` ke audience filter mein hai: author hamesha apna notice
dekhta hai, chahe usne kisi bhi audience ko address kiya ho.

### Query-parameter scope bypass sweep (2026-08-24)

Bug A aur Bug B dono ka root cause ek hi tha — scoping **query params par** lagi thi, role par nahi.
Us poori class ko systematically sweep kiya gaya: har list endpoint ko TEACHER, PARENT aur ek
doosre institute ke ADMIN ke taur par aise ids/filters ke sath call kiya gaya jo unke nahi hain.

**39 probes, sab pass** — students, teachers, parents, subjects, notices, classes, fees, timetable,
attendance, assessments, reports, dashboard, `/deleted`. Har case mein ya to **403/404** aaya, ya
200 mein **sirf caller ke apne scope ka data**. Ek bhi widening mumkin nahi.

Isi sweep mein secret-exposure check bhi tha — aur usi ne `GET /api/plans` wala leak pakra
(section 4 dekhein).

**✅ Notice permission gap band ho gaya.** Pehle ye "permission khuli hai magar UI nahi hai" wali halat mein tha (blocker #7). User ne 2026-08-23 ko faisla diya: teacher ko UI do. Ab permission aur UI dono match karte hain, aur ownership guard bhi lag chuki hai.

---

## 7. QA HISTORY

### Product audit — 2026-08-26

**Static audit (do naye scripts, scratchpad mein):** har `api.x.y()` call site ko
`endpoints.js` aur asli Express routes se cross-reference kiya, aur har interactive
element ka handler check kiya.

| Check | Natija |
|---|---|
| endpoints.js jo route maangta hai wo backend deta hai | **0 dead endpoints** |
| `<Btn>`/`<button>` bina onClick | **0** |
| Handlers jo kuch nahi karte | **0** |
| API-calling buttons bina `disabled` guard (double submit) | **0** |
| Mutations bina error handling / refresh | **0** (sab `run()` wrapper ya `onSaved` se) |
| Clickable non-buttons bina keyboard path | 51 → **47** (shared wale theek hue) |

**Journey sweep (API-level, throwaway institute):** **78 checks pass, 0 product bugs.**
Admin (people, classes, subjects+enrolment, timetable, attendance, assessments, fees,
reports, dashboard), Teacher, Parent, Super Admin — plus role guards aur cross-tenant
har naye route par.

⚠️ **Pehli sweep mein 8 "failures" aaye the jo sab mere apne script ke ghalat contracts
the** (`/attendance/mark` mojood hi nahi — asli routes `POST /attendance` aur
`/attendance/bulk` hain; dashboard `/dashboard/superadmin` hai; assessment schema
per-student hai, `marks[]` nahi). Sahi contracts se dobara chalane par 23/23 pass.
**Sabaq: route aur schema pehle padho, phir test likho.**

**Browser QA:** chaaron portals ke saare tabs. Classes tab (create, duplicate-code validation, teacher assign, roster, student assign), Timetable tab (60 slots, create, edit, delete confirmation, teen conflict types, adjacent slots), messaging (send/inbox/sent/reply), login/logout/session, forgot/reset password, billing page, notices (teacher post/edit + admin regression).

**API QA:** 50+ GET endpoints chaaron roles ke liye — sab 200. Negative authorization sweep. Messaging deep regression (6 flows).

**Responsive:** mobile 375, tablet 768, desktop — har tab par **0 page-level horizontal overflow**. Tables `overflow-x: auto` container mein scroll karti hain.

> ✅ **375px ka "notices grid issue" asal mein tha hi nahi.** 2026-08-23 ko jo clipping report ki gayi
> thi wo **measurement ki ghalti** thi: browser pane ko resize karne ke baad **reload nahi kiya gaya
> tha**, is liye `useMediaQuery("(max-width: 900px)")` ki React state stale reh gayi aur sidebar
> 236px par atka raha. Fresh load par 375 pe sidebar **64px** ho jata hai, main **307px** milta hai,
> grid single column (279px) mein chala jata hai, aur kuch bhi clip nahi hota.
>
> **Sabaq:** emulated viewport badalne ke baad **hamesha reload karo**, warna load-time device gates
> dobara nahi chalte aur naap jhooti aati hai.

**Responsive QA (2026-08-24, dobara aur theek se):** har width par reload kar ke naapa gaya,
aur har element ke liye check kiya gaya ke wo kisi `overflow-x: auto` scroller ke **andar** hai ya
nahi (sirf direct parent nahi, poora ancestor chain).

| Portal | Widths | Tabs | Natija |
|---|---|---|---|
| Admin | 375 / 768 / 1440 | 13 | page overflow 0, scroller se bahar nikalne wale elements **0** |
| Teacher | 375 | 7 | **0** |
| Parent | 375 | 9 | **0** |

Students/Parents/Attendance/Fees tabs par wide tables zaroor hain, magar **har ek** `overflow-x: auto`
container ke andar scroll karti hai — koi bhi main area se bahar nahi nikalta.

**Messaging:** 6 flows (T→P, T→A, A→T, A→P, P→T, P→A) sab 201. Inbox/sent separation perfect. Threading `parentId` set. Outsider reply 404. Unread badge 1→0.

**Reports:** `/reports/institute` 200. CSV/JSON generation **asli data se** Node mein verify — 4 roster rows, 12 subject rows, valid JSON, empty guard `false`.

**Console errors:** sirf expected — pre-login 401s aur conflict tests ke 409s. **Koi JS exception nahi, koi React warning nahi.**

**Dead controls scan:** 0 genuine (saare hits `<label>`+checkbox aur wrapped `Toggle` the).

**Jo verify NAHI ho saka:**
- **File downloads** — browser sandbox page-initiated downloads block karta hai. Generation logic Node mein verify hui, file save hona nahi dekha
- **Delete/archive ka actual execution** — `window.confirm` accept karna automation ke bas mein nahi (aur user ne stub karne se mana kiya). Cancel case verify hua, dialog text sahi hai
- **Super Admin Suspend button ka success path** — guard UI mein verify hua, endpoint API par verify hua, dono ka jorr sirf code padh kar
- **SMTP email delivery** — credentials nahi
- **Teacher ka doosre ka notice edit karna, UI se** — button hi mojood nahi hota, is liye sirf API test se verify hua (403 + notice untouched)
- **Screenshots (2026-08-23 session)** — browser pane display nahi ho raha tha, is liye saare clicks `read_page` refs se ya DOM-confirmed targets par kiye gaye

**⚠️ Ek ghalti jo hui:** ek QA pass mein `window.confirm` ko `true` return karne ke liye stub kiya aur text-match se `✕` click kiya — do asli seeded students (Ayesha Khan, Zain Ahmed) **soft-delete ho gaye**. Foran restore kar diye (relations intact rahin). **Sabaq: kabhi `window.confirm` stub mat karna, aur blind scripted clicking mat karna.**

---

## 8. DATABASE BASELINE

**Asli current baseline (2026-08-30 ko naapa gaya):**

```
institute              5     INS001 Beaconhouse · INS002 LACAS · INS003 The City School
                             INS004 the best garrison school · INS005 garrison
user                   24
student                6     5 live (sab Grade 10/A) + 1 recycle bin mein
teacher                12    (2 soft-deleted)
parent                 7
subject                12
enrollment             24
assessment             20    seeded 16 + user ke 4 "quiz"
attendance             248
feeInvoice             16
subscriptionInvoice    35
notice                 5
message                8     seeded 5 + user ke 3 ("physics" thread)
timetableSlot          63
academicClass          4
academicSession        3
examTerm               6
plan                   3     (starter/growth/elite)
processedWebhookEvent  9     Safepay testing ka bacha hua — section 9
soft-deleted           students 1, teachers 2, parents 0, institutes 0
```

> **2026-08-23 wala purana baseline kaafi peechay reh gaya tha** (usme 3 institutes
> aur 4 students likhe the). INS004/INS005 user ke apne schools hain; students,
> teachers aur messages usi ke istemal se barhe. Ye ginti scripts se li gayi hai,
> haath se nahi likhi.

### 2026-08-30 ki safai — kya gaya, kya jaan boojh kar bacha

User ki sarahat ijazat se **paanch students purge huay**. Student ke liye product
mein purge ka endpoint hai hi nahi (wo sirf soft-delete karta hai), is liye ye
seedha DB se hua — har dafa ek scoped script se jo INS001 tak mehdood thi, har row
ka naam **aur** grade match karti thi, aur kisi bhi target par ek se zyada ya sifar
rows milne par poori ruk jati thi.

```
junk grades (live the)   Adeel ahsan  "d;,F?m;lg;wl"   1 attendance row
                         n,           har field bemani  kuch nahi
                         farhan saleem "grade 8"        kuch nahi
recycle bin se           HAFSA        Grade 8/A         kuch nahi
                         Jawad        Grade 10/A        kuch nahi
```

Iska ek asar tha jo user ko pehle bataya gaya: `saleem iqbal bhatti` (siblings
wala parent, login samet) ab teen ke bajaye **ek** bache ke sath hai.

**Ayesha Khan jaan boojh kar bin mein chhori gayi.** User ne 26 Aug ko khud hataya
tha (audit log se tasdeeq shuda), aur purge ki baat aane par usay rok diya gaya —
wo akeli **6 enrolments, 3 marks, 60 attendance rows aur 4 challan** uthaye hue
hai, aur uske marks usi score dataset ka hissa hain jise chhune se mana hai
(section 5h): do `disagreements` mein, ek `agreements` mein, aur teen enrolments
`no-marks` mein. Purge karne se baseline `6 · 7 · 11` toot kar `5 · 5 · 8` ho
jata, aur wapasi ka koi raasta nahi bachta. Wo app mein waise bhi kahin nazar nahi
aati, is liye rakhne ki koi qeemat nahi hai.

`auditLog` aur `refreshToken` har test run par barhte hain — 2026-08-30 ko naapa gaya:
ek full `npm test` **+473 auditLog** aur **+99 refreshToken** rows likhta hai (purana
figure +177/+74 tha, wo chhoti suite ka tha). Ye normal hai aur domain data ko chhoota
nahi — **baseline sirf domain tables par judge karo.**

> `auditLog` ab **49,000+ rows** ka ho chuka hai, jo tقriban poora test noise hai. Koi
> nuqsan nahi karta (kisi query mein nahi aata), magar agar kabhi database dump chhota
> karna ho to sab se pehle yahi table hai — aur ye faisla user ka hai.

⚠️ **Teacher ka naam "Mr. Hassan ali" hai** (user ne profile update test kiya tha) — seeded "Mr. Hassan" nahi.

**Plan tokens:** `growth` ke paas `providerPriceIds = {"SAFEPAY":"plan_ac7f6a81-6049-43aa-b633-9e808e1f2444"}`. `starter` aur `elite` null.

**Temporary QA data jo bana aur hata diya gaya:** QA institutes (INS004-006 aur `td,8a`), QA classes (`QA-101`, `LB3-101`), QA timetable slots, QA messages, QA notices, QA students, QA assessments (Quiz 4, Midterm), processed_webhook_events. **Sab remove ho chuke hain.**

**Backups:** `backend/backups/*.dump` (gitignored). Latest: `educonnect-2026-08-22T15-51-42.dump`.

⚠️ **`pg_dump` PATH par nahi hai** — `PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"` prefix karna parta hai.

✅ **`npm run db:verify` ab saaf chalta hai (2026-08-26).** Wo Prisma error is liye aata tha ke
script har model par `updatedAt` maangta tha aur nakaami ko `try/catch` mein nigal leta tha —
magar Prisma apna error block **reject hone se pehle** log karta hai. Ab schema se pehle poochha
jata hai (DMMF).

⚠️ **Isi ke saath ek bara masla mila:** script teen tables ginta hi nahi tha — `aIInsight` typo
tha (asli key `aiInsight`), aur `academicClass` + `processedWebhookEvent` list mein the hi nahi.
Fingerprint un se andha tha. Ab teenon shamil hain, aur do guards naam se batate hain agar aage
koi model chhoot jaye. **Fingerprint ki value badal chuki hai** — purane likhe hue fingerprints
match nahi karenge. `tests/dbverify.test.js` (5 tests) is invariant ko pin karta hai.

---

## 9a. SAFEPAY 2.0.0 SUBSCRIPTION ADAPTER (2026-08-29)

### Chaar asli payloads mil gaye — aur adapter unme se koi bhi theek nahi parhta tha

Safepay dashboard ke **Send test event** se chaar asli 2.0.0 subscription events
capture hue. Adapter unke SDK types se likha gaya tha, aur uski **har buniyadi**
**farz ghalat nikli**:

| Cheez | Adapter farz karta tha | Asli 2.0.0 |
|---|---|---|
| Event id | `data.token` | **`envelope.token`** (`evt_…`) |
| Event type | `data.type` | **`envelope.type`** |
| Subscription id | `subscription.token` | **`data.id`** (`sub_…`) |
| Period dates | ISO strings | **protobuf `{seconds, nanos}`** |
| Signature | `data` par | **raw body par** |

Sab se khatarnak protobuf wali thi: `new Date({seconds})` → Invalid Date. Yani
**har paid subscription bina period end ke apply hoti**, aur paisa dene wala school
phir bhi locked rehta.

### Status vocabulary — pehle se durust tha

```
subscription.created            INCOMPLETE  → UNPAID
subscription.canceled           CANCELED    → CANCELED
subscription.payment.succeeded  ACTIVE      → ACTIVE
subscription.payment.failed     UNPAID      → UNPAID
```

Chaaron `STATUS_MAP` mein pehle se the. Naqs mapping mein nahi, **raaste** mein tha.

### Security rule jo isme lagi

Envelope sirf tab bharosay ke qabil hai jab **signature usay cover kare**:

```
2.0.0  signedOver = raw-body  → envelope signed hai   → token/type parho
1.0.0  signedOver = data      → envelope unsigned hai → HARGIZ mat parho
```

1.0.0 mein envelope attacker-controlled hai — wahan se event id lena replayer ko
idempotency index se bachne ka rasta de deta. `verifySignature` ab `envelope` aur
`version` **sirf raw-body case mein** return karta hai, warna `null`. Test isay pin
karta hai: data-signed event mein `evt_ATTACKER_CHOSEN` ko id nahi mana jata.

### Tenant binding — matching order badla

2.0.0 subscription events mein **koi customer id nahi**, sirf `data.id`. To:

```
providerSubscriptionId  →  providerCustomerId  →  instituteRef
```

Aur bind hote waqt `paymentProvider` bhi sath chalta hai — warna school `NONE` par
reh jata aur upar wala lookup (jo provider par filter karta hai) usay har agle event
par miss kar deta.

### ⚠️ Jo abhi bhi nahi ho sakta — school se subscription bind karna

Dashboard ke **test events mein `reference` hai hi nahi** — na `user_id`, na metadata.
Hum checkout URL mein `reference=<institute.id>` bhejte hain, magar **asli subscription**
**mein wo aata hai ya nahi, ye unverified hai** — kyunke asli subscription banayi hi
nahi ja saki (Safepay sandbox: `recaptcha_token is required`).

Is liye adapter `reference` parhta hai agar mile, aur **na mile to event kisi school**
**tak nahi pahunchta** — acknowledge ho kar rah jata hai. Ye jaan boojh kar hai:

> `customer_email` ya `plan_id` se school dhoondna **mana hai**. Do school ek email
> de sakte hain, aur plan sab ke paas same hota hai. Ghalat school ko paid mark karne
> se behtar hai ke kuch na ho.

### Invoice ledger — 2.0.0 ke liye abhi band

Unka `amount` bara number hai (`100000`) us plan par jo Rs. 12,999 ka hai. Rupay hain
ya paisa — **maloom nahi**. Andazay par revenue ledger mein likhna platform owner ke
samne ghalat raqam rakhna hai, jo khali row se bura hai. 1.0.0 ka `price_amount`
behaviour waisa hi hai.

### Fixtures

`tests/fixtures/safepay-subscription-2.0.0.js` — chaaron asli payloads. Do tabdeeliyan:
`merchant_api_key` zeroes se badla (wo is account ki **public** key hai, secret nahi),
aur tests unhein apne secret se re-sign karte hain. Asli signatures live verify ho
chuki thin — yehi se pata chala ke 2.0.0 raw body sign karta hai.

### VERIFIED vs NOT VERIFIED

| | |
|---|---|
| Payload shape, field names, nesting | ✅ asli test events se |
| Event id, type, subscription id | ✅ |
| Protobuf timestamps | ✅ |
| Chaar status values | ✅ |
| 2.0.0 raw-body signature | ✅ asli secret se live |
| **`reference` asli subscription mein aata hai?** | ❌ **blocked: reCAPTCHA** |
| **`amount` rupay ya paisa** | ❌ blocked |
| Renewal par period aage barhna | ❌ blocked |
| `cancel` period-end par defer karta hai? | ❌ blocked |

**Jo bhi neeche wale khane hain, un par kaam sirf tab ho sakta hai jab Safepay apne**
**sandbox ka payer signup theek kare. Wo hamare haath mein nahi.**

---
## 9. SAFEPAY B3 — CLOSED (webhook), subscription lifecycle baqi

### ✅ 2026-08-29 — ASLI Safepay webhook receive, verify aur process ho gayi

Pehli martaba. Sandbox se asli delivery aayi, signature verify hui, idempotency
chali, aur duplicate replay ne kuch double-apply nahi kiya.

```
IP         3.213.131.82 (AWS)        user-agent  Go-http-client/2.0
signature  128 chars (HMAC-SHA512)   type        payment:created
state      PAID                      amount      12999.00 PKR
```

### 🎯 Signature ka contradiction HAL ho gaya

Docs kehte the raw body signed hai, unka SDK kehta tha `JSON.stringify(body.data)`.
Docs site kabhi khuli hi nahi (HTTP 000). Asli delivery ne faisla kar diya:

```
✓ SIGNATURE VERIFIED
  signedOver : data      ← SDK sahi tha, docs ghalat
```

Code dono schemes check karta hai (6l dekhein), is liye pehli hi asli delivery par
pass ho gaya. **Wo dual check ab bhi mat hataana** — production ka scheme sandbox se
alag ho sakta hai, aur `signedOver` hi batayega.

### Asli payload ka shape — ab maloom hai

```json
{ "data": {
    "token": "DA9EVL58D4IS73A9NB9G",        // ASLI event id — data ke ANDAR, yani signed
    "type": "payment:created",               // colon, dot nahi
    "endpoint": "https://…/api/billing/webhook/safepay",
    "notification": {
      "tracker": "track_…", "state": "PAID",
      "amount": "12999.00", "currency": "PKR",
      "fee": "823.49", "net": "12175.51",
      "metadata": { "order_id": "…", "source": "custom" }
    },
    "delivery_attempts": 1,
    "next_attempt_at": "…", "created_at": "…"
} }
```

Do baatein jo pehle sirf andaza thin:

- **Event id mojood hai** (`data.token`) aur wo `data` ke andar hai — yani signature se
  covered. Hamara `eventId` isi se banta hai, sath mein digest.
- **Envelope khali hai.** `data` ke bahar kuch nahi. Envelope se kuch na parhne ka
  faisla durust nikla.
- `delivery_attempts` aur `next_attempt_at` sabit karte hain ke Safepay **retry karta
  hai** — is liye 6l wala `releaseEvent()` fix asli zaroorat thi, ehtiyat nahi.

### Duplicate — asli bytes se verify hua

```
replay 1: HTTP 200 | Event already processed | {"duplicate":true}
replay 2: HTTP 200 | Event already processed | {"duplicate":true}
naye event rows: 0  ·  institutes badle: 0
```

### Asal masla kya nikla (TLS nahi tha)

Mahinon ka shak ngrok/TLS par tha. **Dono bekasoor.** Masla Safepay dashboard mein tha:

1. **URL mein ek digit kam** — `…-60-10.ngrok-free.app` likha tha, `…-60-100` hona tha.
   ngrok us subdomain par **404** deta hai, yani request tunnel tak pahunchti hi nahi —
   isi liye ngrok par Inbound Requests = 0 tha.
2. **`NO EVENT`** — endpoint par koi event subscribe hi nahi tha.

> **Debugging ka sabaq:** `capture.jsonl` ka *na banna* faisla-kun saboot tha. Wo file
> signature check se **pehle** likhti hai, to ghalat request bhi record hoti. File ka
> na hona sirf ek hi matlab rakhta tha: request aayi hi nahi. Us ek observation ne
> masla backend se hata kar dashboard par le aaya.

### ngrok — purani note ghalat thi

Pehle likha tha "ngrok TCP level par poori tarah blocked". **Ab nahi.** Verify kiya:

```
tunnel established → https://xxxx-….ngrok-free.app -> localhost:5001
TLS certificate    → Let's Encrypt, *.ngrok-free.app     ← Safepay ko trusted cert
POST webhook       → hamare handler tak pahuncha
```

Free plan par **URL har restart pe badalta hai**, aur dashboard mein dobara daalna
parta hai — yahi ghalti do baar hui. `ngrok` dashboard → Domains se static domain le
lein to ye jhanjhat khatam.

URL copy karne ka mehfooz tareeqa (haath se mat likhein):

```powershell
(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels[0].public_url + "/api/billing/webhook/safepay" | Set-Clipboard
```

### reCAPTCHA — officially allowed rasta mil gaya

Safepay ki **subscription** checkout payer se account maangti hai, aur unka sandbox
signup `recaptcha_token is required` deta hai. **One-time payment guest checkout us se
bachta hai** — `scripts/verify-safepay-sandbox.js` yehi karta hai. Verify kiya: page
seedha card form deta hai, koi account nahi maangta, koi reCAPTCHA nahi.

### ⚠️ Jo ABHI BHI verify nahi hua

Jo delivery aayi wo **one-time payment** ki thi. `toBillingUpdate` `subscription.status`
dhoondta hai, jo is payload mein hai hi nahi → `null` → event acknowledge hua aur
billing state **nahi badli**. Ye durust behaviour hai (anjaan payload ko "paid" banana
sab se khatarnak cheez hoti), magar iska matlab:

| Cheez | Haalat |
|---|---|
| Webhook delivery · signature · idempotency · duplicate | ✅ asli traffic se verified |
| Payload shape · event id · retry behaviour | ✅ asli traffic se verified |
| Subscription status mapping | ❌ sirf test data se |
| Trial conversion · currentPeriodEnd · plan resolution | ❌ |
| Invoice ledger entry | ❌ |
| `cancel` period-end par defer karta hai ya foran | ❌ |

Ye sab **subscription** payment maangte hain, jiske liye payer account chahiye —
wahi reCAPTCHA wali rukawat. Iska koi hal filhal Safepay ke apne haath mein hai.

### Dobara chalane ki tarteeb

```
1. ngrok http 5001                          → naya URL
2. dashboard → Endpoints → URL update       → poora paste karein
3. .env: PAYMENT_PROVIDER=safepay, SAFEPAY_CAPTURE_WEBHOOKS=./capture.jsonl
4. backend restart
5. node scripts/verify-safepay-sandbox.js   → checkout URL
6. test card 4111 1111 1111 1111, future expiry, koi CVV
   ("Save your card details?" tick MAT karein — wahan reCAPTCHA hai)
7. capture.jsonl mein delivery dekhein
```

**Test ke baad:** `PAYMENT_PROVIDER=manual`, `SAFEPAY_CAPTURE_WEBHOOKS=` khali, aur
`capture.jsonl` **delete** karein — usme payer ka asli email aur ek valid signature
hoti hai.

### Production ke liye baqi

1. Safepay live merchant account (Pakistani business registration)
2. Subscription lifecycle ka asli verification (upar wali table)
3. `cancel` ka asli behaviour — period end par defer, ya foran?

---

## 10. CURRENT BLOCKERS

1. ~~**🔴 Safepay B3 — asli webhook traffic**~~ — **2026-08-29 ko CLOSED.** Asli delivery
   receive, verify aur process ho gayi; signature scheme settle (`signedOver: data`);
   duplicate asli bytes se verify. Section 9 dekhein.
2. **🟡 Safepay subscription lifecycle** — jo delivery aayi wo *one-time payment* ki thi,
   is liye status mapping, trial conversion, `currentPeriodEnd`, plan resolution aur
   invoice ledger abhi bhi sirf test data se verified hain. Asli subscription payment
   payer account maangti hai, aur wahan Safepay ka sandbox reCAPTCHA aata hai (unki taraf ka masla)
3. ~~**🟡 SMTP credentials**~~ — **2026-08-30 ko CLOSED.** Gmail App Password laga, aur asli email asli inbox mein pohnchi (`npm run smtp:verify`). Production config guard ab sirf `CORS_ORIGIN` par rukta hai, jiske liye asli domain chahiye. Section 6k dekhein
4. **🟡 Safepay production requirements** — Pakistani business registration, live merchant account
5. **🟢 Rate limiting in-memory hai** — single instance ke liye theek, multi-instance par Redis ya Postgres counter chahiye (documented trade-off)
6. ~~**CSV import ka UI nahi**~~ — **2026-08-24 ko ban gaya.** Section 3 dekhein
7. **🟢 Institute landline validation** — abhi `03XXXXXXXXX` mobile format lock hai (user ne locked rakha). Alag karne ka poora plan Appendix A §7a mein
8. ~~**`fix-timetable-conflicts.js --apply` idempotent nahi**~~ — **2026-08-26 ko fix hua.** Section 5 dekhein
9. **🟢 Frontend ka koi test runner nahi — jaan boojh kar, 2026-08-26 ko dobara evaluate kiya.**
   Faisla: **abhi vitest add na karo.** Wajah: frontend ka har pure module ab covered hai —
   `csv.js` `npm run check:csv` (23 checks) se, aur `validate.js` backend suite ke
   `tests/validationparity.test.js` se (jo bina kisi nayi frontend dependency ke chalta hai,
   kyunke mirror kuch import nahi karta). Sirf vitest add karne se **koi nayi coverage nahi
   milti** — wo bas wohi 23 checks ek behtar runner mein le jata. Asli baqi coverage `App.jsx`
   ke components mein hai, jiske liye jsdom + @testing-library/react chahiye (3+ devDependencies)
   — wo alag faisla hai. **Dobara sochne ka waqt:** jab logic `App.jsx` se nikal kar testable
   modules mein jaye, ya koi component bug production tak pohanch jaye.
10. ~~**Institute purge/restore ka UI nahi**~~ — **2026-08-26 ko ban gaya.** Section 3 dekhein

11. **🟢 Class ki shanakht free-text hai** — class student par `grade` + `section` strings
    hai, koi id nahi. Yani "grade 8" aur "Grade 8" do alag classes ban jati hain, aur
    ghalat wali mein para bacha register, timetable aur promotion — teeno se ghayab ho
    jata hai. **CSV import par guard lag chuka hai** (section 6n, Bug 5); student form
    par jaan boojh kar nahi — wahan laga kar dekha gaya to seeded school ki ek purani
    typo ne har agli **sahi** entry rokna shuru kar di, kyunke rule ye jaan hi nahi
    sakta ke do hijjon mein ghalat kaunsa hai. Sahi hal refusal nahi, **sahoolat** hai:
    frontend par maujooda grades ka `datalist`. Wo abhi banaya nahi gaya.
12. **🟢 Do chhote khule masle** — session se bahar ki *guzri* attendance dates, aur
    GRADUATED student ki attendance. Dono par jaan boojh kar faisla hua hai; wajoohat
    section 6n ke "Khule masle" mein likhi hain. (P2002 ka field-name leak yahan teesra
    tha — wo 2026-08-30 ko theek ho gaya, section 6n Bug 8.)

> ~~Notice permission gap~~ — **2026-08-23 ko band ho gaya.** Section 6 Bug C dekhein.

---

## 11. EXACT NEXT STEPS (checklist)

**Foran (koi external dependency nahi):**
1. Servers chalao: `preview_start {name:"backend"}` aur `{name:"frontend"}`
2. Baseline verify karo: `npm test` (**875** expected) + `cd frontend && npm run check:csv` (23 expected)
   + `node scripts/fix-timetable-conflicts.js` (0 conflicts expected — magar `--apply` mat chalana)

**Safepay — webhook path CLOSED hai; ye sirf dobara chalane ke liye:**
3. `ngrok http 5001` → naya URL (free plan par har restart pe badalta hai)
4. Dashboard → Endpoints → URL update. **Paste karein, type mat karein** — ek digit
   chhoot jane se ngrok 404 deta hai aur delivery tunnel tak pahunchti hi nahi. Yahi
   ghalti do baar hui aur mahinon TLS ka shak rahi
5. `.env`: `PAYMENT_PROVIDER=safepay`, `SAFEPAY_CAPTURE_WEBHOOKS=./capture.jsonl` → restart
6. `node scripts/verify-safepay-sandbox.js` → checkout URL → test card `4111 1111 1111 1111`
   ("Save your card details?" tick MAT karein — wahan reCAPTCHA hai)
7. Test ke baad: `PAYMENT_PROVIDER=manual`, capture band, `capture.jsonl` **delete**
   (usme payer ka asli email aur valid signature hoti hai)

**Safepay subscription lifecycle (user ke action par depend):**
8. Safepay support se poochein ke sandbox mein payer account kaise banaya jaye —
   unka signup `recaptcha_token is required` deta hai. CAPTCHA bypass nahi karna
9. Account milne par asli subscription payment → status mapping, trial conversion,
   `currentPeriodEnd`, plan resolution aur invoice ledger verify karein
10. `cancel` ka asli behaviour dekhein — period end par defer hota hai ya foran

**Production ke liye (baad mein):**
11. SMTP credentials + real email test
12. Deployment se pehle: `pg_dump` PATH mein add karo (`setx PATH "%PATH%;C:\Program Files\PostgreSQL\18\bin"`)

---

## 12. FILES CHANGED (important)

**Backend — schema/migrations**
- `prisma/schema.prisma` — `AcademicClass` model; `TimetableSlot` par `classId`/`academicYear`/`notes`; Institute billing fields (`paymentProvider`, `providerCustomerId`, `providerSubscriptionId`, `currentPeriodEnd`, `paymentStatus`, `lastBillingEventAt`); `ProcessedWebhookEvent` model; `Plan.providerPriceIds`
- `migrations/20260815050000_provider_neutral_billing/`
- `migrations/20260819155845_academic_classes_and_timetable/`
- `migrations/20260819160440_timetable_slot_notes/`

**Backend — controllers**
- `timetable.controller.js` — conflict engine (`conflictsFor`), schedule CRUD, **role-based scoping fix**
- `class.controller.js` (naya) — class CRUD, archive, roster, student assign
- `billing.controller.js` (naya) — status, checkout, cancel, webhook handler + optional raw capture
- `notice.controller.js` — **teacher ownership guard on `updateNotice`** (2026-08-23);
  **author exemption in `listNotices`** ka audience filter (2026-08-24)
- `institute.controller.js` — **`listPlans` ab `PLAN_PUBLIC` select karta hai** (2026-08-24);
  **`listDeletedInstitutes` ab `withoutProviderIds` se scrub karta hai** (2026-08-26)
- `teacher.controller.js`, `parent.controller.js`, `user.controller.js` — **asli mail delivery
  result report karte hain**, aur mail na jane par temp password dikhate hain (2026-08-24)
- `institute.controller.js` — `withoutProviderIds()` har response site par
- `auth.controller.js` — `tokenInBody` hataya, `PLAN_PUBLIC`
- `errorHandler.js` — production mein sab 5xx generic

**Backend — services/payments (naya folder)**
- `provider.js` — 4-method contract, `SignatureError`, `assertProviderShape`
- `safepay.js` — adapter (⚠️ unverified against real traffic)
- `stripe.js` — draft (Pakistan mein unusable)
- `manual.js` — default bank-transfer
- `billing.service.js` — `applyBillingUpdate` (ordering, forward-only, trial→paid, concurrency guard via `updateMany`), `claimEvent`, `planIdForPrice`
- `index.js` — lazy registry

**Backend — baqi**
- `config/env.js` — production guards (CORS, SMTP, JWT, payment credentials, capture flag), Safepay config
- `middleware/rateLimit.js` — 6 limiters including `webhookLimiter`
- `validators/academic.schema.js` — class, assign, schedule schemas + `minutesOf`
- `utils/publicFields.js` (naya) — `PLAN_PUBLIC`, `withoutProviderIds`
- `routes/` — `class.routes.js` (naya), `timetable.routes.js`, `billing.routes.js` (naya), `index.js`
- `scripts/` — `db-backup.js`, `db-verify.js` (**teen missing tables + drift guards**, 2026-08-26),
  `guard-destructive.js`, `backfill-classes.js`,
  `fix-timetable-conflicts.js` (**idempotency guard + simulation + exported pure logic**, 2026-08-26),
  `verify-safepay-sandbox.js`

**Backend — services**
- `email.service.js` — `esc()` (HTML escaping, 12 sites), `undeliveredReason()`, `notSent()` (2026-08-24)

**Frontend**
- `src/utils/csv.js` (naya) — CSV reader + header aliasing + `IMPORT_COLUMNS` / `importTemplateRows`
- `scripts/check-csv.mjs` (naya) + `npm run check:csv` — 23 checks
- `src/App.jsx` — Admin Classes + Timetable tabs (module-scope: `AdminClassesTab`, `AdminTimetableTab`, `ClassModal`, `ClassRosterModal`, `SlotModal`), `MessageComposer` (module-scope), **`NoticeComposer` (module-scope, Admin + Teacher dono use karte hain)**, Admin Messages tab, **Teacher Notices tab (post + apna edit)**, Inbox/Sent split teenon portals, Billing tab, `takeBillingReturn()`
- `src/hooks/useDb.js` — **`fetchAll` ab `meta` preserve karta hai**, aur ab **exported** hai
- `src/App.jsx` — module-scope **`StudentImportModal`**, **`RecycleBinModal`** aur
  **`InstituteBinModal`** (2026-08-26); dono fee-list call sites `fetchAll` par; honest delete
  dialog copy (people **aur** institutes dono); `RecycleBinModal` ka Restore ab keyboard se
  reachable hai (`role="button"`, `tabIndex`, Enter/Space)
- `src/api/endpoints.js` — `classes`, `timetable.schedule/addSlot/editSlot`, `billing`,
  **`students.import`**, students/teachers/parents ke liye **`deleted` + `restore`**,
  aur institutes ke liye **`deleted` + `restore` + `purge`** (2026-08-26)
- `src/adapters/legacy.js` — `toLegacyNotice` ab **`authorId`** bhi deta hai
- `src/utils/download.js` — CSV/JSON helpers

**2026-08-30 — logical bug hunt (section 6n).** Har badlaav ka apna regression test
hai, aur har fix hata kar fail hote dekha gaya:

| file | kya badla | bug |
|---|---|---|
| `controllers/attendance.controller.js` | `refuseFutureDay()`, aur `markBulk` ka dedupe | 1, 4 |
| `controllers/fee.controller.js` | `dueOn()` helper, `markOverdue` ab `todayIn(tz)` se compare karta hai | 2 |
| `controllers/subject.controller.js` | marks maujood hon to delete refuse | 3 |
| `controllers/student.controller.js` | import mein class-spelling guard aur bin-wale roll numbers | 5, 8 |
| `controllers/teacher.controller.js` | delete ab timetable slots bhi free karta hai | 7 |
| `utils/classNames.js` **(naya)** | class hijje ka near-miss rule | 5 |
| `utils/access.js` | `studentScopeWhere` ab `deletedAt: null` khud likhta hai | 6 |
| `config/prisma.js` | `STUDENT_OWNED_MODELS` — soft delete ab `Attendance`/`FeeInvoice` tak pohnchti hai | 6 |
| `validators/common.js` | `notFutureDate()` / `optionalNotFutureDate()` | 1 |
| `validators/ops.schema.js`, `academic.schema.js`, `people.schema.js` | `takenOn`, `dob`, `paidAt` par guard | 1 |
| `middleware/errorHandler.js` | P2002 ab column ke naam nahi bolta | 8 |
| `frontend/src/App.jsx` | date pickers par `max={todayISO()}`; `todayISO()` khud UTC bug tha | 1 |

**Naye test files:** `futuredates`, `overdue`, `subjectdelete`, `removedstudent`,
`removedteacher`, `deletedrolls`, aur `tests/helpers/fixtures.js` (vacuity guard —
33 spec files use karte hain).

**Test fixtures jo theek karne parhe:** `twosessions` (poori timeline ek saal peechay),
`gradingpolicy`, `gradingreach`, `promotionenrolment`, `weightedterms` (aisi `takenOn`
dates jo abhi aayi nahi thin), `absencealerts` aur `emailworkflow` (ab aaj se relative
din lete hain), `reportcard` (raw queries mein soft-delete filter), `errorhandler`
(nayi P2002 wording).

**Docs:** `HANDOFF.md` (ye file), `DEPLOYMENT.md` (Payments section, Safepay verification checklist, go-live checklist), `backend/.env.example`, `.gitignore`, aur `backend/.gitignore` (`capture.jsonl`)

---

## 13. TESTS

**875 tests, 55 files, sab pass. Build clean.**

### Suite ki raftaar — naapa hua, andaza nahi (2026-08-29)

```
per-file kaam   117.6s → 99.2s     (seedguard 34.0s → 13.2s)
wall duration   228-273s           ← nahi badla
```

`seedguard` poori suite ka 29% tha. Uska `buildBundle()` **har call par poora Vite**
**build** chalata tha — paanch builds, jinme sirf **do mukhtalif artifacts** bante the.
Ab environment par cache hai: do content builds, plus ek restore (neeche dekhein).

**Magar wall time nahi badla.** Machine ki run-to-run variance (228s se 273s) us 18s
se bari hai, aur duration ka bara hissa `import ~65s` hai — 46 files ka module
loading, jo isse nahi badalta. Change kaam kam karta hai; suite tez *mehsoos* nahi hoti.

### Cache ne ek asli khatra paida kiya, aur wo band hai

In tests mein se ek `VITE_ENABLE_DEMO=true` ke sath build karta hai. Cache se pehle
file ka aakhri call ek plain rebuild tha, to `frontend/dist` **ittefaqan** mehfooz
chhoot jata tha. Cache lagte hi wo call disk ko chhoota hi nahi — aur `dist` mein
`super123` aur Quick Login panel reh jate, jise koi bhi bina rebuild kiye deploy
kar sakta tha.

`afterAll` ab default build wapas chalata hai. Ye zaroorat **sabit** ki gayi: restore
hata kar chalaya to `dist` mein dono cheezein mil gayin; lagane par saaf.

### Ek hypothesis jo naap ne rad kar di

Pehla shak `bcryptjs` par tha — pure JS, event loop ko yield karta hai, aur suite
sainkron martaba login karti hai. Test run ke liye `BCRYPT_ROUNDS=4` set kiya:

```
rounds 10   tests 149.26s
rounds  4   tests 149.40s     ← koi farq nahi
```

Wajah: bcrypt ki lagat **hash mein embedded rounds** se aati hai, config se nahi —
aur seeded demo accounts ke hashes rounds-10 par bane hue hain. Change wapas le liya,
kyunke uska comment ek aisa daawa karta tha jo evidence se sabit nahi hua.

### Jo ab bhi flaky ho sakta hai

Ek run mein `access.test.js` ka ek test **544 second** le kar timeout hua tha, jabke
isolation mein wo 0.3s ka hai. Wo tab hua jab **ngrok aur frontend dev server dono**
**chal rahe the**. Dono band kar ke teen lagatar runs green rahe.

> **Full suite chalane se pehle ngrok aur frontend band kar dein.** Ye empirically
> sabit hai, aur suite mein koi guard nahi jo isay pakde.
>
> **2026-08-31 — isi ka ek asli natija.** Dev servers chalte hue ek run 415s le gayi aur
> `tokenreuse.test.js` ka ek test **20s par timeout** ho gaya. Wo test
> `auditLog.count()` karta hai, aur wo table 49,000+ rows ka ho chuka hai. Servers band
> kar ke wahi suite **130s** mein 875/875 green, aur akeli file 13/13. Yani ye code ki
> flakiness nahi — contention hai, aur agar audit log aur barha to ye test pehla shikar
> hoga.

### 2026-08-30: raftaar ka asal sabab mil gaya — code nahi tha

Upar wale kaam ne per-file waqt 117.6s se 99.2s kiya tha magar **wall duration**
**bilkul nahi hili** (228-273s). Wajah ab saaf hai. Isi din, ittefaq se, dono
haalat naapi gayin:

```
backend + frontend + ngrok chal rahe the   239-256s
teeno band                                  81-83s
```

**Teen guna farq**, aur ek bhi line code ki nahi badli. Wo purana 544-second
wala outlier isi ka intiha-i-shakl tha. Yani suite ki raftaar par kaam karne se
pehle **dev servers band karein** — us se jo milta hai wo har code optimisation
se bara hai.

Ports se confirm karein:

```powershell
foreach ($p in 5001,5173,4040) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) { "port ${p}: LISTENING" } else { "port ${p}: band" }
}
```

> Per-file counts ka jorr theek **875** banta hai. Base 2026-08-29 ke
> `vitest --reporter=json` se aaya, phir 2026-08-30 ki tabdeeliyan adjust ki gayin:
> **nau nayi files** (`futuredates` 11, `overdue` 6, `subjectdelete` 6,
> `removedstudent` 9, `removedteacher` 7, `deletedrolls` 6, `teacherworkload` 7,
> `platformrevenue` 5, `rankagreement` 7), `import` +7, aur **33 files mein**
> **ek-ek vacuity guard** (section 6n). Jorr ka theek 875 nikalna khud saboot hai
> ke baqi koi file nahi badli.

```
absencealerts 12 · academics 24 · academicsession 31 · academicsetup 14 · access 16
billing 56 · classes 35 · configguard 19 · dates 11 · dbverify 5 · deletedrolls 6
email 12 · emailworkflow 14 · errorhandler 16 · examterms 19 · feeheads 20
futuredates 11 · gradingpolicy 21 · gradingreach 13 · import 23 · institutebin 10
messaging 14 · notices 18 · notificationgating 6 · onboarding 10 · overdue 6
partialpayments 18 · passwordreset 13 · platformrevenue 5 · promotion 15 · promotionenrolment 15
rankagreement 7 · ratelimit 20 · refreshtoken 13 · removedstudent 9 · removedteacher 7
reportcard 17 · safepay 53 · scorereconcile 12 · security 14 · seedguard 20
siblings 14 · smtpdelivery 16 · softdelete 10 · subjectdelete 6 · subscription 18
teacherworkload 7 · tenancy 30 · terms 13 · timetablefix 14 · tokenreuse 13
twosessions 21 · validation 7 · validationparity 7 · weightedterms 19
```

**Frontend:** koi test runner nahi — **jaan boojh kar**, blocker #9 mein wajah likhi hai.
`cd frontend && npm run check:csv` — **23 checks** CSV reader ke liye (quoted commas, embedded
newlines, doubled quotes, BOM, CRLF, header aliasing). Frontend ka doosra pure module
(`utils/validate.js`) backend suite se cover hota hai — `tests/validationparity.test.js`.

**2026-08-27 (Step 4 — promotion enrols) ko add hue:**
- `tests/promotionenrolment.test.js` (14, naya) — dry run batata hai kya banega aur
  banata kuch nahi; promoted bacha **destination class ka curriculum** leta hai (Grade 8
  Urdu sath nahi jata); pichle saal ki enrolments aur marks salamat; naya saal bilkul
  khali; **ek hi subject naam dono saalon mein**; retained wahi class mein rehta hai magar
  naye saal ka curriculum leta hai aur **bilkul wahi subject row dobara**; graduated ko
  kuch naya nahi milta aur uska grade nahi badalta; dobara chalane par koi double
  enrolment nahi; destination mein koi subject na ho to message batata hai; **rank har
  saal apne marks par**

**2026-08-27 (Step 3 — session-scoped reads) ko add hue:**
- `tests/twosessions.test.js` (20, naya) — ek school apne doosre saal mein: is saal ka
  card (marks, attendance, fees, session ka naam), pichle saal ka card naam se, **dono
  ki position alag aur ulti**, promotion ne pichli enrolment apni jagah chhori aur move
  record kiya, student list/detail/gradebook/subject roster sab is saal ke, pichle saal
  ke subject par mark 400 magar `session` naam dene par 201, aur na-mojood saal par 404
  jo mojood saalon ke naam batata hai

**2026-08-27 (Step 2 — enrolment session) ko add hue:**
- `academicsession.test.js` mein 5 aur — `sessionNameForDate`: April school mein kaunsi
  tareekh kis saal ki; **wahi tareekh August school mein alag saal**; UTC mein parhi jati
  hai (31 March 23:00 UTC abhi bhi 2025-26); naam aur uska span hamesha muttafiq;
  na-parhi jane wali tareekh par **null, guess nahi**
- aur ek: `ensureCurrentSession` us row ko **adopt** karta hai jo school ke apne session
  naam se pehle se mojood ho magar current flag na ho — warna `currentSession` aisa
  session naam leti jise koi row claim hi na karti. Yehi path backfill ke baad kaam aaya.

**2026-08-27 (AcademicSession) ko add hue:**
- `tests/academicsession.test.js` (24, naya) — year pair parsing aur **century rollover**;
  April-March aur August-July dono spans; leap year; UTC midnight par edges; kaunsi
  tareekh kis session mein (dono kinare shamil, bahar wali par **null, guess nahi**);
  wahi tareekh August school mein alag session deti hai; pehli baar poochne par row banti
  hai aur doosri baar wahi rehti hai; aage barhne par naam aur row **ek transaction mein**
  chalte hain; wapas jane par purane session ki tareekhein nahi badaltin; sirf ek current;
  ghalat naam 400 aur kuch nahi badalta; school apni August-July tareekhein set karta hai;
  **overlap 400**; ulti tareekhein 400; doosre school ka session 404; unauthenticated 401;
  **seeded demo school ke liye koi row nahi banti**

**2026-08-26 (Option A + absence alerts) ko add hue:**
- `tests/absencealerts.test.js` (10, naya) — nayi ghair-hazri par guardian ko khabar;
  **dobara save par kuch nahi jata**; hazir bache par khamoshi; correction se bani
  ghair-hazri batai jati hai; **do bacchon ka ek message**; bina guardian wala student
  report hota hai; register har haal mein save hota hai; switch off par sach much ruk
  jata hai aur on par phir chalta hai; `markOne` par bhi ek hi baar; **message ki tareekh
  register ki tareekh se milti hai** (UTC)
- `tests/scorereconcile.test.js` **naye invariant par dobara likhi** — purana spec do-writer
  duniya ko pin karta tha jo ab jaan boojh kar khatam hai. Ab: hath se score type nahi
  ho sakta (400), enrolment ke waqt bhi nahi, mark record hote hi score hilta hai aur
  mark delete hone par wapas aata hai, gradebook wahi number deta hai, legacy row
  `recalculate` se theek hoti hai, aur **bina marks wala score clear ho jata hai**

**2026-08-26 (part payment) ko add hue:**
- `tests/partialpayments.test.js` (17, naya) — adha payment challan khula rakhta hai aur
  `paidAt` khali; qistein jur kar aakhri par clear hoti hain; raqam na batao to poora
  balance; baqi se zyada dena 400 aur kuch nahi badalta; clear challan par payment 400;
  sifar 400; discount pehle minus hota hai; adha-paid OVERDUE, OVERDUE hi rehta hai;
  WAIVED par paisa nahi; stats mein adha hissa outstanding aur adha collected; monthly
  chart upar wale KPI se muttafiq; invoice par `balance`; **student list aur student
  page ek hi dues quote karte hain**; **guardian ko baqi raqam dikhti hai, poora challan
  nahi**; **guardian sirf apne bache ka challan khol sakta hai, doosre ka 404**

**2026-08-26 (onboarding credentials) ko add hue:**
- `tests/onboarding.test.js` (9, naya) — bana hua admin **waqai login karta hai** (aur
  role ADMIN, sahi institute); response batata hai admin kaun hai; owner ka set kiya hua
  password chalta hai aur wapas print nahi hota; **bina admin ke school 422** aur kuch
  likha nahi jata; pehle se mojood admin email par 409 aur institute nahi banta; institute
  + admin + pehla invoice ek sath, ghalat plan par kuch bhi nahi bachta; ACTIVE se shuru
  hota hai (self-service PENDING se ulta); superadmin-only (403); **school edit karna admin
  account ko nahi chhoota**

**2026-08-26 (fee heads) ko add hue:**
- `tests/feeheads.test.js` (19, naya) — heads ka sum hi total banta hai; sath likha
  `amount` ignore hota hai; flat challan pehle jaisa; na total na heads → 400; anjaan
  head 422; negative line 422; list aur single fetch dono mein breakdown; stats sirf
  total ginte hain; doosre school ko 404; breakdown replace + re-total; `items: []` se
  wapas flat; itemised par akela `amount` edit 400; **nested `student.connect` se invoice
  doosre school ke student par nahi ja sakti**; invoice delete par lines bhi jati hain;
  billing run har nayi invoice ko breakdown deta hai; **dobara chalane par pehle se jari
  challan re-itemise nahi hota**; breakdown na ho to flat bill; anjaan head par kuch
  likhne se pehle 422

**2026-08-26 (session rollover) ko add hue:**
- `tests/promotion.test.js` (14, naya) — session default aur per-class counts; ghalat
  shakal ka session 400; teacher parh sakta hai magar badal nahi sakta; **dry run kuch
  nahi likhta** (na grade badalta, na history banti); asli promotion class ko hilata hai
  aur har move ka record banata hai (from/to grade, session, kis ne kiya); class history
  padhna; marks/attendance/fees jahan the wahin; usi session mein promote karna 400;
  khali class 400; sirf chune hue students hilana; **RETAINED wahin rehta hai magar
  record banta hai**; **GRADUATED status badalta hai, grade nahi**, aur toGrade null;
  bina destination ke promotion 400; teacher/parent 403, unauthenticated 401, doosra
  school hamare students ko nahi hila sakta

**2026-08-26 (score reconciliation) ko add hue:**
- `tests/scorereconcile.test.js` (10, naya) — mark se score set hone par dono milte hain;
  Quick Grade Entry se 23 likhne par card `score 23` aur `marksAverage 80` dono deta hai;
  gradebook par bhi wahi; bina kisi mark ke score par `marksAverage: null`; recalculate
  score ko marks ke barabar kar deta hai aur DB mein bhi; bina marks wala subject
  chhoota nahi jata (zero nahi hota); subject ka apna teacher kar sakta hai, doosra
  teacher 404, unauthenticated 401

**2026-08-26 (exam terms) ko add hue:**
- `tests/terms.test.js` (11, naya) — term ke sath mark record hona, enum se bahar term
  par 422, bina term ka mark; term card sirf us term ke marks reporte, **position term
  ke sath badalti hai** (Alia FIRST mein 1st, Bilal MID mein 1st), grade shared bands se;
  **bina marks wala term sab null deta hai, 0/F nahi**; bina `?term=` ke behaviour bilkul
  pehle jaisa; aur gradebook ka average bhi usi term ka hota hai

**2026-08-26 (product audit) ko add hue:**
- `tests/reportcard.test.js` (**16**) — result card ka poora payload contract (header,
  student, guardian, subjects ke columns, attendance ke chhe fields, fees, generatedAt),
  attendance ka jorr aur rate, koi provider id nahi, aur kaun maang sakta hai: admin ✓
  teacher ✓ parent apna bachcha ✓ · parent doosra bachcha 404 · doosra institute 404 ·
  unauthenticated 401.
  **+6 (position aur grading):** rank/classSize payload par hain aur `GET /students/:id`
  se **agree** karte hain; poori class 1..n bina gap/tie ke rank hoti hai aur tarteeb
  averages ke mutabiq hai; classSize sirf apni class ginta hai, poora school nahi;
  `overallGrade` wahi bands use karta hai jo subject letters karte hain; aur 80 = A−.

  ⚠️ **Ek verification pehle ghalat thi:** "test purane code par fail hota hai" prove
  karte hue mera regex ne `getStudent` ka payload match kar liya (jo file mein pehle
  aata hai), `studentReport` ka nahi — yani maine ghalat endpoint tora aur sirf 1 test
  fail hua. Sahi endpoint tor kar dobara kiya: **chaaron** position tests fail hote hain.
  Dono functions ka payload block bilkul ek jaisa dikhta hai — anchor unique rakho.

**2026-08-26 (pehla pass) ko add hue:**
- `tests/institutebin.test.js` (9, naya) — delete kuch erase nahi karta (row, students aur users
  survive, users deactivate hote hain), bin listing, restore + reactivation, non-deleted ko
  restore karna 400, purge sirf bin se, purge waqai erase karta hai, ADMIN/TEACHER ko 403,
  unauthenticated 401, aur bin par provider ids scrub
- `tests/timetablefix.test.js` (14, naya) — `sweep`/`simulate` pure logic constructed timetables
  par: half-open periods, teacher/class/room clashes, case-insensitive rooms, period fallback,
  aur sab se ahem — **plan apna inverse hai** (dobara lagane se conflicts wapas), is liye
  improvement check doosri run ko refuse karta hai
- `tests/dbverify.test.js` (5, naya) — har schema model MODELS mein hai, har naam client par
  resolve hota hai, koi duplicate nahi, `updatedAt` sirf wahan maanga jata hai jahan hai, aur
  script sirf padhta hai
- `tests/validationparity.test.js` (7, naya) — frontend `validate.js` aur backend
  `common.js` har case par **ek hi verdict** dete hain (phone aur email), normalisation bhi
  aik jaisi. Landline cases jaan boojh kar 11-digit hain — 10-digit wale to length rule se
  waise hi ruk jate, wo drift pakar hi nahi sakte the

**Haal hi mein add hue (2026-08-24):**
- `tests/email.test.js` (10, naya) — mail na jane par temp password dikhta hai (teacher, parent,
  super-admin-created user), "welcome emails off" ka case, admin ka chuna hua password,
  `undeliveredReason`, `esc`. Ek test **alag process** mein chalta hai jahan `SMTP_HOST=127.0.0.1:1`
  set hai — SMTP configured hai magar har send fail hota hai, yani wohi asli bug ka scenario
- `tests/notices.test.js` 9 → **17** — teacher vs teacher (edit/delete → 403, read → 200) aur
  audience filtering (author exemption, parents-only, teachers-only, admin par filter nahi)
- `tests/softdelete.test.js` 4 → **9** — recycle bin ka poora round trip (student/teacher/parent),
  teacher ko bin se bahar rakhna, cross-tenant restore → 404
- `tests/security.test.js` 11 → **13** — `GET /api/plans` bina token, aur us par koi provider id nahi;
  admin endpoints par bhi wahi promise

**Purane (2026-08-23):**
- `tests/notices.test.js` (9, 2026-08-23) — teacher publish (author + role), cross-institute post → 403, admin ko dikhta hai / doosre institute ko nahi, parent → 403, apna edit → 200 (DB mein persist), doosre ka edit → **403 aur notice untouched**, teacher delete → 403, admin edit+delete → 200. Har banaya hua notice `afterAll` mein delete ho jata hai
- `tests/classes.test.js` (35) — class CRUD, duplicate prevention, archive, student assign, timetable CRUD, teen conflict types, adjacent slots, tenant isolation, **+3 scoping regression tests**
- `tests/messaging.test.js` (10) — recipient lists, send flows, inbox/sent separation, threading, cross-tenant
- `tests/safepay.test.js` (22) — signature (fake secret se), idempotency keys, status mapping, checkout URL
- `tests/configguard.test.js` (17) — CORS/SMTP/payment/capture production guards

---

## 14. ENVIRONMENT / COMMANDS

**Servers** (Bash se dev server mat chalao):

```
preview_start {name:"backend"}    # port 5001
preview_start {name:"frontend"}   # port 5173, autoPort:false
```

**Tests aur build:**

```bash
cd backend && npm test
cd backend && npx vitest run tests/notices.test.js
cd frontend && npm run build
```

**Prisma:**

```bash
cd backend && npx prisma validate
cd backend && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
cd backend && npx prisma generate
```

⚠️ `prisma generate` par **EPERM** aata hai agar backend chal raha ho — pehle backend band karo (port 5001 ka process + uska nodemon parent). Tafseel Appendix A §3 mein.

**Database:**

```bash
cd backend && PATH="/c/Program Files/PostgreSQL/18/bin:$PATH" npm run db:backup
cd backend && npm run db:verify
cd backend && node scripts/fix-timetable-conflicts.js          # dry-run conflict sweep (--apply MAT karo)
cd backend && node scripts/backfill-classes.js                 # dry-run
```

**Safepay/tunnel:**

```bash
cd backend && node scripts/verify-safepay-sandbox.js           # SAFEPAY_PUBLIC_KEY chahiye
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:5001
```

**Demo credentials (local only):** `sa@educonnect.io/super123`, `admin@bhs.edu/admin123`, `hassan@bhs.edu/teach123`, `sara@gmail.com/parent123`

---

## 15. IMPORTANT SAFETY RULES

- **Secrets kabhi print/expose mat karo.** `.env` ki values na padho na dikhao — sirf presence/length check karo
- **`.env` bila zaroorat modify mat karo.** Agar test ke liye change karo to test ke baad **foran revert** karo aur user ko batao
- **Asli data delete mat karo.** Sirf apne banaye QA records hatao, aur pehle confirm karo ke wo QA ke hi hain
- **`window.confirm` kabhi stub mat karo.** Isi se do asli students soft-delete ho gaye the
- **Blind scripted/coordinate clicking mat karo.** Browser pane ka coordinate frame shift hota rehta hai. Har click se pehle screenshot lo aur target visually confirm karo. Agar screenshot na mile to `read_page` refs ya DOM query se target confirm karo; ambiguous ho to ruk jao aur API/code-level verification karo
- **Unrelated changes mat karo.** Sirf wahi chhoo jo task maangta hai
- **Jo verify nahi hua usay "verified" mat likho.** Honesty > completeness
- **Test baseline preserve karo** — 875/875. Existing tests weaken ya remove mat karo
- **Webhook claim ko nakaami par release karo.** `claimEvent` ke baad jo bhi kaam ho,
  agar wo throw kare to `releaseEvent()` chalna chahiye — warna gateway ka retry
  "already processed" sun kar chala jata hai aur payment hamesha ke liye gum.
- **Envelope sirf tab parho jab `signedOver === "raw-body"` ho.** 1.0.0 mein envelope
  unsigned hai; wahan se event id lena replayer ko idempotency se bachne ka rasta hai.
- **`toDate` protobuf `{seconds, nanos}` bhi samajhta hai.** Ye mat hataana — iske
  baghair har 2.0.0 subscription bina period end ke apply hoti hai.
- **`customer_email` se kabhi institute bind mat karo.** Sirf `reference` (signed) ya
  pehle se bound `providerSubscriptionId`.
- **Safepay signature ke dono scheme check hote hain** (`data` aur raw body). Ek hata
  kar "simplify" mat karna jab tak asli delivery se `signedOver` na dekh lein.
- **Credentials wale relay par TLS maangna default hai.** `SMTP_REQUIRE_TLS=false`
  sirf tab jab relay waqai TLS na kar sakta ho — warna password plain text mein jata
  hai aur send phir bhi kaamyab report hota hai.
- **Email ke test asli socket par karo, mock par nahi.** `tests/helpers/smtp-sink.js`
  mojood hai; `SMTP_REQUIRE_TLS=false` ke sath point kar dein.
- **Cleanup ko child process ke bharose mat chhoro** — parent ke `afterAll` mein bhi
  sweep rakho, warna crashed run school orphan chhor jata hai.
- **Message par `studentId`/`parentId` hamesha institute ke against validate karo.**
  `message.routes.js` par koi `scopeToInstitute` nahi hai — jo bhi id body se aaye
  uska scope controller mein khud check karna hoga.
- **Jis challan par paisa aaya usay delete mat karo** — WAIVED karo. Receipt void hoti
  hai, mitti nahi.
- **Koi notification preference bina consumer ke mat add karo** —
  `notificationgating.test.js` foran fail karega, aur yahi maqsad hai.
- **Test ka fixture demo data se mat lo.** Khud banao, warna demo data badalte hi test
  khamoshi se vacuous ho jayega.
- **`if (skip()) return` wala har naya spec ek `it("built its fixtures")` bhi rakhe.**
  Wo switch test ko chupa deta hai; bina is guard ke ek tuta hua `beforeAll` poori file
  ko green tick de deta hai. 2026-08-30 ko theek yehi hua — `tests/helpers/fixtures.js`
  mein poora waqia likha hai.
- **Terms ki tarteeb badalne ke liye `reorderTerms` istemal karo, delete + re-add nahi.**
  Delete us term ke marks ko azaad kar deta hai; reorder ek transaction mein do phase
  se guzarta hai aur kuch nahi girata.
- **Saal ka score `weightedAverage` se nikalta hai jab school ne terms ko wazan diya ho.**
  `currentScore` likhte waqt hi weighted hota hai; usay pool karne wale hisaab se mat
  badlo, warna list aur card phir se aapas mein jhagrenge.
- **Grade ka letter kabhi platform ke scale se mat nikalo.** Jahan pata ho kis school
  ki baat ho rahi hai, `policyFor(instituteId)` ya `gradingFor(institute)` istemal karo.
  `academics.js` ke `letterGrade`/`gradePoint`/`calculateGpa` sirf fallback hain.
- **Guardian ke ek hi bachche ka farz mat karo.** `parent.studentId` purane callers ke
  liye chhora gaya hai; `students` / `children` parho.
- **Term ka naam kabhi hardcode mat karo.** `FIRST`/`MID`/`FINAL` ab kahin nahi hain.
  Term school ka naam hai, session ke andar resolve hota hai — `resolveTerm(sessionId,
  name)` se lo, aur UI ki list `GET /institutes/me/sessions/:id/terms` se aati hai.
- **Grade kabhi hardcode mat karo.** `letterGrade`/`gradePoint` ab school ki policy par
  chalte hain — `gradingFor(institute)` se lo. `utils/academics.js` wale purane exports
  abhi mojood hain magar platform default par chalte hain; naye code mein unhein mat use
  karo jahan institute haath mein ho.
- **Naya spec apna throwaway school banaye** — signup → SA approve → apna admin, aur
  `afterAll` mein app ke lifecycle (`DELETE` + `/purge`) se mitaye. Seeded institutes sirf
  parhne ke liye. `import.test.js` (5i), `tokenreuse.test.js` (5j) aur `tenancy.test.js`
  (5k) — teeno ab yehi karte hain, aur koi baqi spec seeded data mutate nahi karta.
- **Endpoint "read-only" lagne se read-only nahi hota.** `forgot-password` ek GET jaisa
  lagta hai magar wo purane reset links invalidate karta hai. Naya test likhte waqt
  poochho: *"ye call us account par kya chhor jati hai?"*
- **Test cleanup HAMESHA apni data tak mehdood rakho** — institute id, record id, ya spec
  ka apna stamp. Email domain par `contains` match kabhi nahi: `import.test.js` isi tarah
  ek doosre school ka guardian mita chuka hai. Naya spec likhte waqt `afterAll` ko is
  nazar se parho: *"agar ye kisi aur ke database par chala to kya mit jayega?"*
- **`git stash push -- <file>` se "purana code fail hota hai" mat sabit karna.** Wo file ko
  poore ke poore HEAD par le jata hai, aur in files mein sessions ka bohat sa uncommitted
  kaam hai — `institute.controller.js` par ye karne se session-rollover ke handlers ghayab
  ho gaye aur app hi load nahi hui. Sirf mutasira function ko surgically revert karo,
  backup se restore karo, aur baad mein `app loads` + full suite dono check karo.
- **Naya Prisma model add karo to `scripts/db-verify.js` ki MODELS list bhi update karo.**
  `tests/dbverify.test.js` is ko pakadta hai (`StudentPromotion` par pakda bhi) — wo guard
  isi liye likha gaya tha. Fingerprint badal jayega, jo expected hai.
- **Seeded data ke counts test mein hardcode mat karo.** `classes.test.js` ka
  *"reports the roster and teaching load from live data"* `studentCount` ko `3` se
  compare karta tha — user ne app se Grade 8-A mein students add kiye aur test toot
  gaya. Ab wo count DB se hi nikalta hai, jo us test ke apne naam ke mutabiq hai.
- **Patch script mein file kabhi truncate mat hone do.** `student.controller.js` ko
  edit karte hue ek script ne file ka pehla hissa gira diya (774 → 124 lines) kyunke
  `untouched` prefix wapas jorna reh gaya tha. Ab har aisi script ke aakhir mein
  length-check hai: `if (out.length < whole.length * 0.9) throw`. Backup se restore hua.
- **Import block par greedy regex mat chalao.** `/import \{([\s\S]*?)\}/` ne kai import
  statements ko ek match samajh liya aur poora block scramble kar diya.
- **Browser pane resize karne ke baad hamesha reload karo** — warna `useMediaQuery` ki state stale
  reh jati hai aur responsive naap jhooti aati hai (2026-08-23 ko isi se ek bug "report" hua tha
  jo tha hi nahi)
- **Is Bash tool ka heredoc double-backslash collapse kar deta hai** (`\\n` → `\n`). Jis patch
  script mein backslashes hon usay scratchpad file mein likh kar `node file.cjs` se chalao
- **Change se pehle inspect karo** — khaaskar migrations aur destructive operations
- **Destructive changes se pehle ruk kar poocho** — migrations, deletes, resets. User ne hamesha exact SQL dekhna chaha hai
- **Kabhi mat karo:** `prisma migrate reset`, `db:push`, seed, database reset/wipe, deploy, commit, push — bina explicit permission
- **Safepay:** sirf sandbox. Asli payment mat karo. reCAPTCHA bypass/stub mat karo. `PAYMENT_PROVIDER` production par mat karo
- **Webhook route `express.json()` se pehle mount hai** — ye ordering mat toro, warna har signature fail hogi
- **Backup lo** kisi bhi DB write se pehle

---

## 16. LANGUAGE PREFERENCE

**User ko har jawab ROMAN URDU mein chahiye.**

- Sab explanations, reports, QA results, implementation summaries Roman Urdu mein
- Headings bhi Roman Urdu mein jahan practical ho
- **Technical terms, code, file names, API names, database names, commands aur error messages English mein rakho**
- Code blocks bilkul modify mat karo
- English mein bewajah lambi explanations mat do
- Exact error/message English mein quote kar sakte ho, magar uski **explanation Roman Urdu mein** honi chahiye
- Ye preference tab tak chalegi jab tak user khud English mein na maange

*(Ye memory mein bhi save hai: `user-language-roman-urdu.md`)*

---

## RESUME POINT — next Claude yahan se shuru kare

**State stable hai. Koi kaam adhoora nahi chhoda gaya.**

```
tests   875/875, 55 files          build   clean, 519 kB (gzip 135)
git     branch deploy-prep pushed  DB      3 demo schools (INS001-003)
score   6 agrees · 7 disagrees · 11 no-marks    + user ke 2 (INS004, INS005)
        ↑ ye data chhuna MANA hai — section 5h
```

### ⚠ Pehle ye teen cheezein dekh lein

1. **`.env` mein `PAYMENT_PROVIDER` do dafa hai** — line 17 `manual`, line 24 `safepay`.
   Baad wali jeetti hai, to abhi **`safepay`** chal raha hai. Demo se pehle line 24 hata
   dein. `SAFEPAY_CAPTURE_WEBHOOKS` bhi on hai, is liye har test run `capture.jsonl`
   dobara bana deta hai — wo ab `.gitignore` mein hai, magar band karna behtar hai.
2. **Full suite se pehle backend, frontend aur ngrok — teeno band kar dein.** Ye suite ki
   raftaar ka sab se bara factor hai, aur 2026-08-30 ko dono haalat naapi gayin:

   ```
   teeno chal rahe the   239-256s
   teeno band             81-83s      ← teen guna
   ```

   Ek dafa `access.test.js` ka ek test 544 second le kar timeout bhi hua tha (akela wo
   0.3s ka hai). Suite mein koi guard nahi jo isay pakde. Ports se confirm karein:
   `5001`, `5173`, `4040`.
3. **Baseline confirm karein** — `npm test` → **875**, aur `node scripts/inspect-scores.js`
   → **6 · 7 · 11**.

### Aakhri kaam (2026-08-30) — logical bug hunt

User ne kaha tha: koi aisa logical bug na rahe jo asli school chalane par saamne aaye.
**Gyarah mile, gyarah theek hue**, har ek ka regression test dono taraf sabit — poora
hisaab **section 6n** mein:

| Bug | Kya hota tha |
|---|---|
| attendance ki koi date limit nahi | 2099 ki attendance qubool; summary 5 din ginta, result card 2 — do screen, do jawab |
| fee jis din due, usi din OVERDUE | 10 tareekh ka challan 10 ko 00:00 baje defaulter + late fee |
| subject delete | har saal ke saare marks Cascade se khatam, guard nahi, recycle bin nahi |
| bulk register | dobara bheja gaya student do dafa gina — 30 ki class "31 marked" |
| CSV import | "grade 8" vs "Grade 8" — phantom class, bachay register/timetable/promotion se ghayab |
| nikala hua student | uski ghair-hazri hamesha school ke attendance rate mein, challan outstanding total mein |
| hataya hua teacher | timetable par naam baqi, aur uski jagah aane wale ko usi period par "Teacher Conflict" |
| recycle bin ka roll number | "A record with this instituteId, rollNo already exists" — na number bataya, na jagah |
| teacher ka workload | chaar teachers ko aisi class dikhti thi jismein koi tha hi nahi |
| platform revenue | breakdown 65,995 aur uske neeche total 60,996 — ek hi card par |
| bina marks wale ka rank | Grades tab par "Ranked #4 of 5", usi bache ke card par khali |

> Isi hunt ne 6 test files ke 46 tests bhi toray — **wajah guard nahi thi.** Wo tests
> aisi dates use kar rahe the jo aayi hi nahi, aur `twosessions` to poora school
> 2027-28 mein le jata tha. Fixtures theek hue, tafseel 6n ke aakhir mein.

### Us se pehle (2026-08-29)

Ek hi din mein kaafi kuch hua — har ek ka apna section hai:

| Kaam | Section |
|---|---|
| SMTP — asli SMTP server ke against verify (local sink, koi dependency nahi) | **6k** |
| Product readiness audit + P0/P1 fixes (message leak, fee delete, dead toggle) | **6j** |
| Safepay B3 — **asli webhook receive ho gayi**, signature scheme settle | **9** |
| Safepay 2.0.0 subscription adapter — chaar asli payloads se likha gaya | **9a** |
| Test suite ki raftaar — naapi gayi, `seedguard` 34s → 13s | **13** |

### Launch ke liye kahan khare hain (2026-08-30)

> **Demo credentials ab production tak pohnch hi nahi saktin.** Seed pehle se
> production mein block tha, magar wo sirf **ek raasta** band karta tha. Asli
> khatra doosra hai: demo dikhane ke liye dev ka dump production mein restore
> kar dena — restore ko pata hi nahi hota wo kya utha kar la raha hai, aur
> natija `sa@educonnect.io / super123` internet par. Ab server **halat** check
> karta hai, sirf raasta nahi: production mein koi seeded login mile, ya koi
> SUPERADMIN un chaar documented passwords mein se koi istemal kar raha ho, to
> pehli request serve karne se pehle inkar kar deta hai
> (`src/config/demo-guard.js`). Development bilkul waise ka waisa — wahan demo
> data hi to maqsad hai.

User ne poocha *"ab ye launch karne ke qaabil hai?"* — jawab **abhi nahi**,
aur wajah code nahi, **operations** hain. Us din do rukawaten hat gayin:

| | halat |
|---|---|
| **Step 1 — SMTP** | ✅ **ho gaya.** Asli email asli inbox mein pohnchi, aur asli reset flow chala. Section 6k |
| **Step 2 — backup/restore** | ✅ **ho gaya.** Dump restore ho kar wahi fingerprint deta hai. Section 6p |
| **Step 3 — deploy** | ⏳ **shuru ho gaya.** Code `deploy-prep` branch par push ho gaya (pehli dafa), Render blueprint durust kiya, aur production ab demo credentials ke sath start hi nahi hoti. Baqi: host, domain, TLS |
| **Step 4 — payments** | ❌ asli subscription kabhi bani hi nahi (Safepay sandbox reCAPTCHA). Aur ye sawal khula hai ke payload `reference` laata hai ya nahi — **uske baghair koi payment kisi school se bind nahi hoti** |

Production config guard ab **sirf domain** par rukta hai — `CORS_ORIGIN` aur
`APP_URL`, dono ko asli https URL chahiye. Sirf check ke liye dono de kar
chalaya to guard **PASS** hua, yani peechay aur kuch chhupa nahi.

**Scale ab maloom hai** — 1,200 students par har endpoint 350 ms se neeche (section 6r).
Ye un chaar fikron mein se ek thi; wo door ho gayi.

**Baqi jo launch se pehle chahiye:** off-site/managed backups (6p ka local dump
kharab migration se bachata hai, machine kho jane se nahi), rate limiting
multi-instance ke liye (abhi in-memory), aur Safepay production ke liye
Pakistani business registration.

> **Aur ek baat jo darj hone layak hai:** 30 August ko ek din mein **gyarah**
> logical bugs mile, jin mein se teen sirf app khol kar click karne se. Jab kaam
> ruka, milne ki raftaar kam nahi hui thi. Iska matlab code bura nahi — iska
> matlab ise **asli istemal nahi mila**. Ek pilot school (ek term, paise ke
> baghair) sab se sasta tareeqa hai baqi bugs milne ka.

### Khula kya hai

**1 · Safepay subscription lifecycle** — ye ikloti bari cheez hai, aur wo **hamare haath
mein nahi**. Adapter asli 2.0.0 payloads par likha ja chuka hai aur live route par verify
ho chuka hai, magar ek asli subscription kabhi ban hi nahi saki: Safepay ka sandbox payer
signup `recaptcha_token is required` deta hai. Jo iske peechay atka hai:

- kya asli subscription payload `reference` (institute id) laata hai — **iske baghair koi**
  **subscription kisi school se bind nahi ho sakti**
- `amount` rupay hain ya paisa (isi liye 2.0.0 ka invoice ledger abhi band hai)
- renewal par period aage barhna, aur `cancel` period-end par defer karta hai ya foran

**CAPTCHA bypass nahi karna.** Ye Safepay ki taraf ka masla hai.

**2 · SMTP credentials** — code taiyar aur verified hai (asli SMTP conversation, local
server ke against). Asli inbox mein kabhi koi email nahi gayi, aur ye kehna bhi nahi.

**3 · Do documented decisions** — landline validation (blocker #7) aur frontend test runner
(blocker #9). Dono par soch kar faisla hua hai; dobara mat kholein bina wajah.

**4 · Bug hunt ke teen chhote khule masle** — student form par free-text class
(blocker #11, sahi hal `datalist` hai), session se bahar ki *guzri* attendance dates,
aur GRADUATED student ki attendance (blocker #12). Teeno par wajah section 6n ke
"Khule masle" mein likhi hai. Koi bhi demo rokne wali cheez nahi.

### Jo kabhi mat karna

- **11 no-mark enrolments aur 7 score disagreements** — user ka sarahat faisla hai, chhoona
  mana hai (section 5h)
- **Demo credentials** badalna
- **Deploy** — abhi kahin nahi hua, aur user ki sarahat ijazat ke baghair na ho
- **Commit aur push** — 2026-08-30 tak har session mein mana tha; us din user ne
  `deploy-prep` branch ke liye sarahatan ijazat di. Wo ijazat **usi kaam ke liye**
  thi, aage ke commits ke liye dobara poochein
- **`customer_email` se institute bind karna** — do school ek email de sakte hain
- **Safepay ke dual signature check ko "simplify" karna** — 1.0.0 `data` sign karta hai,
  2.0.0 raw body; dono asli traffic se dekhe ja chuke hain (section 9)
- **`STUDENT_OWNED_MODELS` ka "caller ka explicit filter jeetta hai" usool torna** —
  usi par teacher aur parent ki row-level scoping tiki hui hai (section 6n, Bug 6)
- **`it("built its fixtures")` guard kisi spec se hatana** — wo ek tute hue `beforeAll`
  ko poori file ke green ticks mein badalne se rokta hai (section 6n)
- **`dueDate` / `publishedAt` / `expiresAt` par "consistency" ke naam par future guard**
  **lagana** — teeno ke liye aage ki tareekh jaayaz hai, aur test isay pin karta hai

---
---

# APPENDIX A — 2026-08-14 handoff ka reference material

Ye hissa purane handoff se **jyun ka tyun** liya gaya hai (asli English mein). Jo sections stale ho
chuke the — test counts, "current state", suggested first message — wo hata diye gaye hain, kyunke
unki jagah upar sections 2, 11 aur 13 le chuke hain. Jo neeche hai wo aaj bhi valid hai aur upar
kahin repeat nahi hota.

---

## A§3. THE TRAP THAT WILL BITE YOU

**After any schema change or `prisma migrate`, restart the backend.**

`prisma generate` rewrites `node_modules/.prisma`, which nodemon does **not** watch. The running
server keeps the old client and throws confusing errors — `Unknown argument 'deletedAt'`, or a
blanket **500 on every login**. This wasted time three separate times in one session.

```bash
# after any migrate/generate
# stop the server, then:
cd backend && npx prisma generate && npm run dev
```

Symptom → cause: login suddenly 500s but `npm test` passes = stale running server (tests spawn a
fresh process). **Restart, don't debug the code.**

---

## A§5. Data loss you must tell the user about

Running `npx prisma migrate reset --force` during an earlier session **wiped the database**. The
three seeded demo institutes were restored, but **four test schools the user had registered
themselves were destroyed**:

`THE BEST GARRISON SCHOOL`, `tresysutst`, `fakd;ljfkjwe'f`, `chcbgchgchg`

They cannot be recovered. This was flagged to the user. **Never run `migrate reset` on their
database again without explicit permission** — use `migrate dev` (additive) instead.

---

## A§6. Architecture you need to understand

### Frontend: the adapter pattern

`App.jsx` is thousands of lines of prototype presentation code that was **deliberately not
rewritten**. Instead:

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

## A§7. Validation rules (strict — locked by tests)

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

### A§7a. If landline support is wanted — exactly what to separate

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
- the signup step 1 `label:"Contact phone"` field. **This is the only institute call site.**
  (the adjacent `"Admin phone"` is a person — leave it.)
- the bare `phoneError(f.phone)` inside `step1Ok`, same institute field.
- `InstituteSettingsCard` — its "Phone" input has **no** client-side check at all today and relies
  on the server, so it needs the new rule adding if you want inline feedback.
- the two person-phone call sites — leave them.

> ⚠️ Line numbers in `App.jsx` from the 2026-08-14 doc are stale — the file has grown a lot since.
> Search by label text instead.

**Two things to know before starting:**
- `backend/tests/validation.test.js:11` (`describe("Pakistani phone validation")`) pins the current
  behaviour. A split needs new cases for `orgPhone`, not edits to the existing ones.
- `people.schema.js:67` — the **CSV bulk-import row** uses a plain `z.string().optional()` and is
  not validated by this rule at all. Phone numbers can already enter the database through that
  path in any format, so whatever rule you settle on, that gap is separate and still open.

---

## A§9. Responsive — how it actually works

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

## A§10. Two traps worth knowing (from the 2026-08-14 audit)

- `Inp` used to swallow every prop it didn't destructure, so `maxLength={11}` and `min="1"` did
  nothing in seven places. It now forwards `...rest` to the input.
- Components defined **inside** a portal body get a new identity on every parent render, so they
  remount whenever `onReload()` swaps `db` — any local state, including a success banner, is lost.
  Report outcomes through portal-level state (`pNote`/`pErr`) as AdminPortal already did.
  **This is why `MessageComposer` and `NoticeComposer` live at module scope.**

---

## A§10c. Still-open items carried over

1. ~~**Landing page marketing figures**~~ — **fixed 2026-08-28, section 6i.** All four were
   replaced with figures that can be checked against the product in the next click.
2. **Institute landline phones** — see A§7 and A§7a. Reviewed, confirmed broken for landline-only
   schools, and deliberately **not** changed. (Also blocker #7 above.)
3. ~~**The CSV import endpoint has no frontend.**~~ — **built 2026-08-24**, and blocker #6
   above already said so while this line still claimed otherwise. `StudentImportModal`
   in `App.jsx` calls it.
4. **Email delivery is unconfigured.** With no SMTP the mail service falls back to the server
   console, so password resets and fee reminders create the in-app message but send no email.
   (Also blocker #3 above.)
5. **Nothing is committed.** Everything from all sessions is still working-tree only.

## A§10d. CSV import validation — fixed 2026-08-14

`importRow` keeps every cell a loose string **on purpose**, so one bad value can't reject a whole
file with an opaque `rows.47.phone` path; the controller collects problems per row and reports them
with line numbers instead. Phone numbers were simply missing from that per-row pass, so the bulk
path wrote values the single-record endpoints refuse.

Fixed in the controller, not the schema, to preserve that design. A `phoneProblem()` helper
delegates to the shared `phone` rule via `safeParse` — one source of truth, so changing
`validators/common.js` (including any A§7a landline split) carries straight through. Both columns
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

### Import test cautions

`backend/tests/import.test.js` — 12 tests, all confirmed to fail without their fix (5 for phone,
4 for email). Almost every batch contains a deliberately bad row with `partial` left false, so the
all-or-nothing rollback means those never write. The one block that *must* write — case-insensitive
guardian dedup — cleans up in `afterAll`, and that teardown is deliberately broader than the happy
path needs so a future regression can't leave rows behind.

⚠️ If you ever disable one of these checks to see the tests fail, **the rejected rows start
importing for real**. Clean up afterwards: students named `Import Probe`, rolls starting
`CASEFOLD`, and any guardian on `example.com`.

---

**House rules the user has set:** local only, never deploy, never push without being asked, never
fake success or mock data, fix root causes not symptoms, verify before claiming something works,
and be honest about what wasn't tested.

# HANDOFF END
