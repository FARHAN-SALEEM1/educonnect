import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { recalcEnrollment } from "../services/grading.service.js";
import { resolveTerm } from "../services/term.service.js";
import { readSessionId } from "../services/session.service.js";
import { resolveSession, sessionFilter } from "../services/session.service.js";
import { findAccessibleSubject } from "../utils/access.js";
import { assessmentAverage } from "../utils/academics.js";
import { policyFor } from "../services/grading.service.js";
import { count } from "../utils/plural.js";

/** Where-clause that keeps teachers to their own subjects. */
const scopeWhere = (req) => ({
  ...(req.instituteId && { enrollment: { student: { instituteId: req.instituteId } } }),
  ...(req.user.role === "TEACHER" && {
    enrollment: {
      ...(req.instituteId && { student: { instituteId: req.instituteId } }),
      subject: { teacherId: req.user.teacherId },
    },
  }),
  ...(req.user.role === "PARENT" && {
    enrollment: { student: { parentId: req.user.parentId } },
  }),
});

/** GET /api/assessments */
export const listAssessments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { studentId, subjectId, type, term, from, to } = req.query;

  /**
   * A term is named by the school now, and named within one year — so it has
   * to be resolved against a session before it means anything. Nothing named
   * means every term, which is what this always did.
   */
  const session = await resolveSession(req.instituteId, req.query.session);
  const examTerm = term ? await resolveTerm(session.id, term) : null;

  const where = {
    ...scopeWhere(req),
    ...(type && { type }),
    ...(examTerm && { examTermId: examTerm.id }),
    ...((from || to) && {
      takenOn: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  if (studentId || subjectId) {
    where.enrollment = {
      ...(where.enrollment || {}),
      ...(studentId && { studentId }),
      ...(subjectId && { subjectId }),
    };
  }

  const [total, assessments] = await Promise.all([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ takenOn: "desc" }, { id: "asc" }],
      include: {
        examTerm: { select: { name: true } },
        enrollment: {
          include: {
            student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
            subject: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
  ]);

  const data = assessments.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    // The school's own name for the term, not an enum value.
    term: a.examTerm?.name ?? null,
    examTermId: a.examTermId,
    obtained: a.obtained,
    total: a.total,
    percentage: Number(((a.obtained / a.total) * 100).toFixed(1)),
    takenOn: a.takenOn,
    remarks: a.remarks,
    student: a.enrollment.student,
    subject: a.enrollment.subject,
  }));

  return ok(res, data, "Assessments fetched", pageMeta(total, page, limit));
});

/** POST /api/assessments — record one mark. */
export const createAssessment = asyncHandler(async (req, res) => {
  // `session` names the year to file the mark under; it is not a column on the
  // mark itself, so it must not ride along into the create below.
  const { studentId, subjectId, session: _session, term: _term, ...data } = req.body;

  await findAccessibleSubject(req, subjectId);

  /**
   * The enrolment for the year the mark belongs to.
   *
   * This used to read `studentId_subjectId` — the composite unique — which can
   * name only one enrolment per subject for a student's whole time at the
   * school. A student repeating a year, or a school reusing a subject across
   * years, has more than one, and the unique is due to gain the session for
   * exactly that reason. Asking by session says which year the mark is for.
   */
  const session = await resolveSession(req.instituteId, req.body.session);
  /**
   * The term the school itself named, resolved inside the year the mark is
   * being filed under. Nothing named files the mark under no term, which is
   * right for a class test that belongs to no formal examination.
   */
  const examTerm = await resolveTerm(session.id, req.body.term);

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, subjectId, ...sessionFilter(session?.id) },
  });
  if (!enrollment) {
    throw ApiError.badRequest(
      session
        ? `This student is not enrolled in that subject for ${session.name}`
        : "This student is not enrolled in that subject"
    );
  }

  const assessment = await prisma.assessment.create({
    data: { ...data, enrollmentId: enrollment.id, examTermId: examTerm?.id ?? null },
  });

  // Roll the new mark into the student's subject score.
  await recalcEnrollment(enrollment.id);

  audit(req, { action: "assessment.create", entity: "Assessment", entityId: assessment.id });
  return created(res, assessment, "Assessment recorded");
});

/**
 * POST /api/assessments/bulk
 * Enter one assessment for a whole class in a single request — the flow
 * behind the teacher portal's "+ Add Assessment" button.
 */
export const bulkCreateAssessments = asyncHandler(async (req, res) => {
  const { subjectId, title, type, term, total, takenOn, results } = req.body;

  await findAccessibleSubject(req, subjectId);

  const session = await resolveSession(req.instituteId, req.body.session);
  const examTerm = await resolveTerm(session.id, term);
  const studentIds = results.map((r) => r.studentId);
  const enrollments = await prisma.enrollment.findMany({
    where: { subjectId, studentId: { in: studentIds }, ...sessionFilter(session?.id) },
    select: { id: true, studentId: true },
  });

  const enrollmentByStudent = new Map(enrollments.map((e) => [e.studentId, e.id]));

  const skipped = [];
  const rows = [];

  for (const r of results) {
    const enrollmentId = enrollmentByStudent.get(r.studentId);
    if (!enrollmentId) {
      skipped.push({ studentId: r.studentId, reason: "not enrolled in this subject" });
      continue;
    }
    if (r.obtained > total) {
      skipped.push({ studentId: r.studentId, reason: `obtained (${r.obtained}) exceeds total (${total})` });
      continue;
    }
    rows.push({
      enrollmentId,
      title,
      type,
      examTermId: examTerm?.id ?? null,
      total,
      obtained: r.obtained,
      remarks: r.remarks ?? null,
      ...(takenOn && { takenOn }),
    });
  }

  if (!rows.length) {
    throw ApiError.badRequest("No valid results to record", skipped);
  }

  await prisma.assessment.createMany({ data: rows });
  for (const row of rows) await recalcEnrollment(row.enrollmentId);

  audit(req, {
    action: "assessment.bulk_create",
    entity: "Assessment",
    meta: { subjectId, title, recorded: rows.length, skipped: skipped.length },
  });

  return created(
    res,
    { recorded: rows.length, skipped },
    `${title} recorded for ${count(rows.length,"student")}`
  );
});

/** PATCH /api/assessments/:id */
export const updateAssessment = asyncHandler(async (req, res) => {
  const existing = await prisma.assessment.findFirst({
    where: { id: req.params.id, ...scopeWhere(req) },
  });
  if (!existing) throw ApiError.notFound("Assessment not found");

  const obtained = req.body.obtained ?? existing.obtained;
  const total = req.body.total ?? existing.total;
  if (obtained > total) throw ApiError.badRequest("Obtained marks cannot exceed total marks");

  const assessment = await prisma.assessment.update({
    where: { id: existing.id },
    data: req.body,
  });

  await recalcEnrollment(existing.enrollmentId);

  return ok(res, assessment, "Assessment updated");
});

/** DELETE /api/assessments/:id */
export const deleteAssessment = asyncHandler(async (req, res) => {
  const existing = await prisma.assessment.findFirst({
    where: { id: req.params.id, ...scopeWhere(req) },
  });
  if (!existing) throw ApiError.notFound("Assessment not found");

  await prisma.assessment.delete({ where: { id: existing.id } });
  await recalcEnrollment(existing.enrollmentId);

  return ok(res, null, "Assessment deleted");
});

/**
 * GET /api/assessments/gradebook?subjectId=&grade=&section=
 * The teacher portal's grade book grid: one row per student, one column
 * per assessment title, plus the running average and letter grade.
 */
export const gradebook = asyncHandler(async (req, res) => {
  const { subjectId, grade, section, term } = req.query;
  if (!subjectId) throw ApiError.badRequest("subjectId is required");

  const subject = await findAccessibleSubject(req, subjectId);
  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else. Reading the live policy here also means a scale change shows up at
   * once, instead of waiting for every subject to be recalculated.
   */
  const grading = await policyFor(subject.instituteId);
  // The year being marked. A gradebook mixing two years would list a student
  // twice and average across both.
  const session = await resolveSession(req.instituteId, req.query.session);
  const examTerm = term ? await resolveTerm(session.id, term) : null;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      subjectId,
      ...sessionFilter(session?.id),
      student: {
        ...(grade && { grade }),
        ...(section && { section }),
        status: "ACTIVE",
      },
    },
    include: {
      student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
      // `?term=` narrows the book to one term's marks. Without it the book
      // shows the whole year, which is what it always did.
      assessments: {
        ...(examTerm && { where: { examTermId: examTerm.id } }),
        include: { examTerm: { select: { name: true } } },
        orderBy: { takenOn: "asc" },
      },
    },
  });

  /**
   * One column per sitting, not per title.
   *
   * The columns used to be the distinct titles, and each cell was filled with
   * `assessments.find(a => a.title === title)` — the first match. A teacher who
   * sets a quiz called "quiz" twice therefore got one column and one of the two
   * marks; the other was invisible in the book and in the CSV, while still
   * counting towards the average printed beside it. The page showed 12/20 and
   * 18/20 next to an average of 82%, which is the arithmetic of a third mark
   * nobody could see.
   *
   * `bulkCreateAssessments` writes one row per enrolment sharing a title, type,
   * total, term and date, so that tuple is most of what a column is. It is not
   * quite all of it: the two quizzes above were recorded forty-four seconds
   * apart on the same afternoon, so they agree on every one of those fields.
   * A batch has no id of its own to key on, so where a group holds more than
   * one paper for a student it opens that many columns, and each student's
   * marks fill them in the order they were entered.
   */
  const groupOf = (a) =>
    [
      a.title,
      a.type,
      a.total,
      a.examTermId ?? "",
      a.takenOn ? a.takenOn.toISOString().slice(0, 10) : "",
    ].join("|");

  /** Each enrolment's marks, bucketed by group and kept in entry order. */
  const bucketed = new Map();
  for (const e of enrollments) {
    const byGroup = new Map();
    for (const a of [...e.assessments].sort((x, y) => x.createdAt - y.createdAt)) {
      const g = groupOf(a);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(a);
    }
    bucketed.set(e.id, byGroup);
  }

  /** How many columns each group needs — the most any one student sat. */
  const groups = new Map();
  for (const byGroup of bucketed.values()) {
    for (const [g, list] of byGroup) {
      const seen = groups.get(g);
      if (!seen) groups.set(g, { slots: list.length, sample: list[0] });
      else seen.slots = Math.max(seen.slots, list.length);
    }
  }

  const titleCounts = new Map();
  for (const { sample } of groups.values())
    titleCounts.set(sample.title, (titleCounts.get(sample.title) ?? 0) + 1);

  const columns = [...groups.entries()]
    .sort(([, a], [, b]) => {
      const t = (a.sample.takenOn?.getTime() ?? 0) - (b.sample.takenOn?.getTime() ?? 0);
      return t !== 0 ? t : a.sample.title.localeCompare(b.sample.title);
    })
    .flatMap(([g, { slots, sample }]) =>
      Array.from({ length: slots }, (_, i) => {
        /*
         * The date appears only when the title alone would not tell two
         * columns apart, and the number only when one sitting was not enough,
         * so a book with no repeats keeps its clean headings.
         *
         * Read back in UTC, because `takenOn` is a date rather than a moment:
         * it is stored at midnight UTC, and formatting that in a server zone
         * behind UTC names the day before. A paper sat on the 31st was labelled
         * "30 Aug" — the same mistake the absence mail already carries a comment
         * about, where a register saved for Wednesday told a guardian their
         * child was absent on Tuesday.
         */
        const dated =
          titleCounts.get(sample.title) > 1 && sample.takenOn
            ? `${sample.title} · ${sample.takenOn.toLocaleDateString("en-GB", {
                timeZone: "UTC",
                day: "numeric",
                month: "short",
              })}`
            : sample.title;
        return {
          key: `${g}#${i}`,
          title: sample.title,
          type: sample.type,
          takenOn: sample.takenOn,
          term: sample.examTerm?.name ?? null,
          label: slots > 1 ? `${dated} (${i + 1})` : dated,
        };
      })
    );

  const rows = enrollments
    .map((e) => {
      const marks = {};
      const byGroup = bucketed.get(e.id) ?? new Map();
      for (const col of columns) {
        const hash = col.key.lastIndexOf("#");
        const a = (byGroup.get(col.key.slice(0, hash)) ?? [])[Number(col.key.slice(hash + 1))];
        marks[col.key] = a
          ? { obtained: a.obtained, total: a.total, term: a.examTerm?.name ?? null, percentage: Number(((a.obtained / a.total) * 100).toFixed(1)) }
          : null;
      }
      // Asked for one term, the average is that term's. Leaving it as the
      // rolled-up `currentScore` would show one term's marks beside the whole
      // year's average, which is two periods on one screen.
      const average = term ? assessmentAverage(e.assessments) : e.currentScore;

      return {
        enrollmentId: e.id,
        student: e.student,
        marks,
        average,
        // The average the marks in this book add up to. Differs from
        // `average` only when somebody typed a score by hand.
        marksAverage: assessmentAverage(e.assessments),
        previousScore: e.previousScore,
        letterGrade: grading.letterGrade(average),
        // A term average has nothing to trend against — `previousScore` is
        // last term's roll-up, not the term before this one.
        trend:
          !term && e.currentScore !== null && e.previousScore !== null
            ? Number((e.currentScore - e.previousScore).toFixed(1))
            : 0,
      };
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  return ok(res, {
    subject: { id: subject.id, name: subject.name, color: subject.color, grade: subject.grade },
    columns,
    rows,
    classAverage: rows.length
      ? Number(
          (
            rows.reduce((s, r) => s + (r.average ?? 0), 0) /
            rows.filter((r) => r.average !== null).length || 0
          ).toFixed(1)
        )
      : 0,
  });
});
