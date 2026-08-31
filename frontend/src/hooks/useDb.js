import { useCallback, useEffect, useState } from "react";
import api from "../api/endpoints.js";
import {
  toLegacyInstitute,
  toLegacyMessage,
  toLegacyNotice,
  toLegacyParent,
  toLegacyStudentFull,
  toLegacyStudentSummary,
  toLegacyTeacher,
  toLegacyUser,
} from "../adapters/legacy.js";

const EMPTY = {
  institutes: [],
  users: [],
  branches: [],
  students: [],
  teachers: [],
  parents: [],
  messages: [],
  notices: [],
};

const PAGE_SIZE = 200;

/**
 * Hard ceiling on how much a portal will pull into memory. Well above the
 * Growth plan's 800 seats; an institute past this needs server-side paging
 * in the list views rather than a bigger number here.
 */
const MAX_RECORDS = 5000;

/**
 * Fetches every page of a list endpoint.
 *
 * A single `limit: 200` request silently truncated any institute with more
 * than 200 students — and the Growth plan sells 800, so the product
 * contradicted itself with no error and no visible clue.
 */
export async function fetchAll(fn, params = {}) {
  const first = await fn({ ...params, page: 1, limit: PAGE_SIZE });
  const total = first.meta?.total ?? first.length;
  const rows = [...first];

  /**
   * `meta` is carried through deliberately. Spreading into a plain array drops
   * the properties the client hangs off it, and some endpoints put figures
   * there that are computed across the WHOLE table rather than the page —
   * `subscription-invoices` returns a paid/pending summary that way. Losing it
   * left the super admin's "Outstanding" tile reading a permanent Rs. 0 while
   * six invoices sat unpaid, which is the kind of wrong that looks like good
   * news. It comes from the first page because it does not vary by page.
   */
  if (total <= rows.length) {
    return Object.assign(rows, { truncated: false, total, meta: first.meta });
  }

  const capped = Math.min(total, MAX_RECORDS);
  const lastPage = Math.ceil(capped / PAGE_SIZE);

  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) =>
      fn({ ...params, page: i + 2, limit: PAGE_SIZE })
    )
  );
  for (const page of rest) rows.push(...page);

  return Object.assign(rows.slice(0, MAX_RECORDS), {
    truncated: total > MAX_RECORDS,
    total,
    meta: first.meta,
  });
}

/**
 * Loads everything the signed-in role's portal needs and returns it in the
 * legacy `db` shape.
 *
 * Each role fetches only what its portal renders — a parent never pulls the
 * institute's full student list, and the API would refuse it anyway.
 */
async function loadForRole(user) {
  switch (user.role) {
    case "superadmin": {
      const [institutes, users, dash, planList, subs] = await Promise.all([
        fetchAll(api.institutes.list),
        fetchAll(api.users.list),
        api.dashboard.superadmin(),
        api.plans.list(),
        fetchAll(api.subscriptions.list),
      ]);
      return {
        ...EMPTY,
        institutes: institutes.map(toLegacyInstitute),
        users: users.map((u) => ({
          ...toLegacyUser(u),
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
        })),
        platformDashboard: dash,
        plans: planList,
        subscriptions: subs,
        subscriptionSummary: subs.meta?.summary ?? {},
        truncated: institutes.truncated || users.truncated,
      };
    }

    case "admin": {
      // `branches` comes back empty for the schools that only have one campus,
      // and every campus control in the portal hides itself when it is.
      const [institute, students, teachers, parents, notices, messages, dash, subscription, branches] =
        await Promise.all([
          api.institutes.get(user.inst),
          fetchAll(api.students.list),
          fetchAll(api.teachers.list),
          fetchAll(api.parents.list),
          fetchAll(api.notices.list),
          fetchAll(api.messages.list, { box: "all" }),
          // Real attendance/fee aggregates — the dashboard tiles used to be
          // hardcoded because this was never fetched.
          api.dashboard.admin(),
          api.institutes.mySubscription(),
          api.branches.list().catch(() => []),
        ]);

      return {
        ...EMPTY,
        institutes: [toLegacyInstitute(institute)],
        students: students.map(toLegacyStudentSummary),
        teachers: teachers.map(toLegacyTeacher),
        parents: parents.map(toLegacyParent),
        notices: notices.map(toLegacyNotice),
        messages: messages.map((m) => toLegacyMessage(m, user.id)),
        adminDashboard: dash,
        subscription,
        branches,
        truncated: students.truncated,
        studentTotal: students.total,
      };
    }

    case "teacher": {
      const [dash, students, teachers, notices, messages, classes] = await Promise.all([
        api.dashboard.teacher(),
        fetchAll(api.students.list), // already narrowed to this teacher's classes
        fetchAll(api.teachers.list),
        fetchAll(api.notices.list),
        fetchAll(api.messages.list, { box: "all" }),
        api.teachers.myClasses(),
      ]);

      return {
        ...EMPTY,
        institutes: [toLegacyInstitute({ ...dash.teacher.institute, ...dash.institute })],
        students: students.map(toLegacyStudentSummary),
        teachers: teachers.map(toLegacyTeacher),
        notices: notices.map(toLegacyNotice),
        messages: messages.map((m) => toLegacyMessage(m, user.id)),
        teacherDashboard: dash,
        myClasses: classes,
      };
    }

    case "parent": {
      const [dash, children, notices, messages] = await Promise.all([
        api.dashboard.parent(),
        api.parents.myChildren(),
        fetchAll(api.notices.list),
        fetchAll(api.messages.list, { box: "all" }),
      ]);

      // The parent portal renders one child in full detail, so pull the
      // complete record for each — there are only ever a handful.
      const full = await Promise.all(children.map((c) => api.students.get(c.id)));

      const parentRecord = {
        ...toLegacyParent(dash.parent),
        studentId: full[0]?.id ?? null,
        studentIds: full.map((s) => s.id),
      };

      return {
        ...EMPTY,
        institutes: [toLegacyInstitute(dash.parent.institute)],
        parents: [parentRecord],
        students: full.map(toLegacyStudentFull),
        notices: notices.map(toLegacyNotice),
        messages: messages.map((m) => toLegacyMessage(m, user.id)),
        parentDashboard: dash,
      };
    }

    default:
      return EMPTY;
  }
}

export function useDb(user) {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  /** Re-fetch everything — call after a mutation so the UI reflects the server. */
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!user) {
      setDb(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadForRole(user)
      .then((next) => {
        if (!cancelled) setDb(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  return { db, loading, error, reload, setDb };
}
