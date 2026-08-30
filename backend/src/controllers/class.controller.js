import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";

/**
 * Academic classes — the school's own class/section structure.
 *
 * A class here is metadata: what the school calls it, its code, year, room and
 * class teacher. It is deliberately not the owner of student membership; see
 * the comment on the model. A class's roster is every student whose
 * `grade`/`section` match the class's `name`/`section`, which is the pair
 * attendance, the gradebook and the parent timetable already read.
 */

const CLASS_INCLUDE = {
  classTeacher: { select: { id: true, name: true, code: true } },
};

/** The roster and teaching load behind a class, counted from live data. */
const withCounts = async (cls) => {
  const [students, subjects, slots] = await Promise.all([
    prisma.student.count({
      where: { instituteId: cls.instituteId, grade: cls.name, section: cls.section },
    }),
    prisma.subject.count({
      where: { instituteId: cls.instituteId, OR: [{ grade: cls.name }, { grade: null }] },
    }),
    prisma.timetableSlot.count({
      where: { instituteId: cls.instituteId, grade: cls.name, section: cls.section },
    }),
  ]);
  return { ...cls, studentCount: students, subjectCount: subjects, slotCount: slots };
};

/** GET /api/classes */
export const listClasses = asyncHandler(async (req, res) => {
  const { search, academicYear, includeArchived } = req.query;

  const classes = await prisma.academicClass.findMany({
    where: {
      ...(req.instituteId && { instituteId: req.instituteId }),
      ...(academicYear && { academicYear }),
      // Archived classes are hidden unless asked for — an archived class is
      // still referenced by last year's timetable and must not vanish.
      ...(includeArchived === "true" ? {} : { isArchived: false }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { section: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { room: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    include: CLASS_INCLUDE,
    orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }],
  });

  const data = await Promise.all(classes.map(withCounts));

  // Every year present, so the filter can be built without a second call.
  const years = await prisma.academicClass.findMany({
    where: { ...(req.instituteId && { instituteId: req.instituteId }) },
    distinct: ["academicYear"],
    select: { academicYear: true },
    orderBy: { academicYear: "desc" },
  });

  return ok(res, data, "Classes fetched", { academicYears: years.map((y) => y.academicYear) });
});

/** GET /api/classes/:id — the class plus its roster. */
export const getClass = asyncHandler(async (req, res) => {
  const cls = await prisma.academicClass.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: CLASS_INCLUDE,
  });
  if (!cls) throw ApiError.notFound("Class not found");

  const students = await prisma.student.findMany({
    where: { instituteId: cls.instituteId, grade: cls.name, section: cls.section },
    select: { id: true, name: true, rollNo: true, code: true, status: true },
    orderBy: { rollNo: "asc" },
  });

  const slots = await prisma.timetableSlot.findMany({
    where: { instituteId: cls.instituteId, grade: cls.name, section: cls.section },
    include: {
      subject: { select: { id: true, name: true, color: true } },
      teacher: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  return ok(res, { ...(await withCounts(cls)), students, timetable: slots });
});

/**
 * POST /api/classes
 *
 * The unique indexes on (institute, year, code) and (institute, year, name,
 * section) are the real guard; this check exists to turn the resulting P2002
 * into a message that names what clashed.
 */
export const createClass = asyncHandler(async (req, res) => {
  const { name, section, code, academicYear } = req.body;

  const clash = await prisma.academicClass.findFirst({
    where: {
      instituteId: req.instituteId,
      academicYear,
      OR: [{ code }, { AND: [{ name }, { section }] }],
    },
  });
  if (clash) {
    throw ApiError.conflict(
      clash.code === code
        ? `Class code "${code}" is already used by ${clash.name} ${clash.section} in ${academicYear}`
        : `${name} ${section} already exists in ${academicYear} as "${clash.code}"`
    );
  }

  if (req.body.classTeacherId) await assertTeacher(req.body.classTeacherId, req.instituteId);

  const cls = await prisma.academicClass.create({
    data: { ...req.body, instituteId: req.instituteId },
    include: CLASS_INCLUDE,
  });

  audit(req, { action: "class.create", entity: "AcademicClass", entityId: cls.id, meta: { code } });
  return created(res, await withCounts(cls), `${cls.name} ${cls.section} created`);
});

/** PATCH /api/classes/:id */
export const updateClass = asyncHandler(async (req, res) => {
  const existing = await prisma.academicClass.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Class not found");

  const next = { ...existing, ...req.body };
  const clash = await prisma.academicClass.findFirst({
    where: {
      instituteId: existing.instituteId,
      academicYear: next.academicYear,
      id: { not: existing.id },
      OR: [{ code: next.code }, { AND: [{ name: next.name }, { section: next.section }] }],
    },
  });
  if (clash) {
    throw ApiError.conflict(
      `Another class in ${next.academicYear} already uses that ${clash.code === next.code ? "code" : "name and section"}`
    );
  }

  if (req.body.classTeacherId) await assertTeacher(req.body.classTeacherId, existing.instituteId);

  const cls = await prisma.academicClass.update({
    where: { id: existing.id },
    data: req.body,
    include: CLASS_INCLUDE,
  });

  audit(req, { action: "class.update", entity: "AcademicClass", entityId: cls.id });
  return ok(res, await withCounts(cls), "Class updated");
});

/**
 * PATCH /api/classes/:id/archive
 *
 * Archive rather than delete. A class is referenced by a term's timetable and
 * by the grade/section on every student who sat in it; removing the row would
 * strand that history for the sake of tidying a list.
 */
export const archiveClass = asyncHandler(async (req, res) => {
  const existing = await prisma.academicClass.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Class not found");

  const archive = req.body?.isArchived !== false;

  const cls = await prisma.academicClass.update({
    where: { id: existing.id },
    data: { isArchived: archive },
    include: CLASS_INCLUDE,
  });

  audit(req, {
    action: archive ? "class.archive" : "class.restore",
    entity: "AcademicClass",
    entityId: cls.id,
  });
  return ok(res, await withCounts(cls), archive ? "Class archived" : "Class restored");
});

/**
 * POST /api/classes/:id/students — move students into this class.
 *
 * Writes the class's name/section onto each student, because that pair is what
 * the register, gradebook and parent timetable read. Students from another
 * institute are refused rather than silently skipped.
 */
export const assignStudents = asyncHandler(async (req, res) => {
  const cls = await prisma.academicClass.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!cls) throw ApiError.notFound("Class not found");
  if (cls.isArchived) throw ApiError.badRequest("That class is archived — restore it before assigning students");

  const { studentIds } = req.body;

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, instituteId: cls.instituteId },
    select: { id: true },
  });
  if (students.length !== studentIds.length) {
    throw ApiError.badRequest("One or more of those students do not belong to this institute");
  }

  const { count } = await prisma.student.updateMany({
    where: { id: { in: students.map((s) => s.id) }, instituteId: cls.instituteId },
    data: { grade: cls.name, section: cls.section },
  });

  audit(req, {
    action: "class.assign_students",
    entity: "AcademicClass",
    entityId: cls.id,
    meta: { count },
  });

  return ok(res, await withCounts(cls), `${count} student(s) moved into ${cls.name} ${cls.section}`);
});

/** A teacher must exist inside the same institute before being attached. */
async function assertTeacher(teacherId, instituteId) {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, instituteId } });
  if (!teacher) throw ApiError.badRequest("That teacher does not belong to this institute");
  return teacher;
}
