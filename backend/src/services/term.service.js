import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assessmentAverage } from "../utils/academics.js";

/**
 * The examination terms a school reports on.
 *
 * These used to be an enum — FIRST, MID, FINAL — which decided for every school
 * on the platform that a year has exactly three terms with those names. Plenty
 * of Pakistani schools run two, Half Yearly and Annual; some run four; and the
 * names differ everywhere. A school that cannot name its own terms cannot
 * produce its own result card.
 *
 * They hang off the session, not the institute, so a school that moves from
 * three terms to two keeps the terms last year's cards were written in.
 */

/**
 * What a school gets before it has said otherwise.
 *
 * Three terms with the names the enum used, so a school that never opens the
 * settings screen behaves exactly as it did — and, unlike the enum, can rename,
 * reorder, delete or reweight any of them.
 *
 * `weightage` is null on purpose. Weighting the terms into a combined annual
 * result is a policy a school should choose deliberately; with no weights the
 * annual card pools the year's marks, which is what it does today.
 */
export const DEFAULT_TERMS = [
  { name: "First Term", sequence: 1 },
  { name: "Mid Term", sequence: 2 },
  { name: "Final Term", sequence: 3 },
];

/** A session's terms, in the order they fall in the year. */
export const listTerms = (academicSessionId) =>
  prisma.examTerm.findMany({
    where: { academicSessionId },
    orderBy: { sequence: "asc" },
  });

/**
 * A session's terms, creating the standard three the first time it is asked.
 *
 * Created on demand rather than when the session is made, the same way the
 * session itself is: a school that never looks at terms is not carrying rows it
 * did not ask for, and one that does look finds something workable rather than
 * an empty screen.
 */
export async function ensureTerms(academicSessionId) {
  const existing = await listTerms(academicSessionId);
  if (existing.length) return existing;

  await prisma.examTerm.createMany({
    data: DEFAULT_TERMS.map((t) => ({ ...t, academicSessionId })),
    // Two requests arriving together must not race into a duplicate.
    skipDuplicates: true,
  });
  return listTerms(academicSessionId);
}

/**
 * Whether this year's terms combine into a single weighted result.
 *
 * True only when every term carries a share and the shares add up to 100.
 * Anything else — no weights at all, some weights, weights that do not add up —
 * means the school is not weighting, and the annual card pools the year's marks
 * as it always has. A half-configured weighting silently producing a combined
 * result would be worse than none.
 */
export const weightingIsComplete = (terms = []) =>
  terms.length > 0 &&
  terms.every((t) => Number.isFinite(t.weightage)) &&
  terms.reduce((sum, t) => sum + t.weightage, 0) === 100;

/**
 * One subject's year, weighted the way the school weights its terms.
 *
 * Weightage was stored, validated and reported for a while before anything
 * used it: a school could say Half Yearly 40% and Annual 60%, the card would
 * say `termsAreWeighted: true`, and then pool the year's marks anyway — 79.5%
 * where the school's own policy says 81.2%. Reporting a weighting and then not
 * applying it is worse than not offering one.
 *
 * Renormalised across the terms that have marks, rather than counting an
 * unmarked term as zero. A card printed after the half-yearly and before the
 * annual has to report the half-yearly, not a failure — the annual has not
 * been sat. So the weights of the marked terms are scaled back up to 1.
 *
 * Marks belonging to no term — a class test, or anything recorded before the
 * school named its terms — carry no weight and are left out. `unweighted`
 * counts them so a card can say so rather than quietly dropping them.
 */
export const weightedAverage = (assessments = [], terms = []) => {
  const parts = terms
    .map((t) => ({
      term: t,
      average: assessmentAverage(assessments.filter((a) => a.examTermId === t.id)),
    }))
    .filter((p) => p.average !== null);

  const carried = parts.reduce((sum, p) => sum + (p.term.weightage ?? 0), 0);
  const unweighted = assessments.filter((a) => !a.examTermId).length;

  if (!parts.length || !carried) return { score: null, parts, carried, unweighted };

  const score = parts.reduce((sum, p) => sum + p.average * (p.term.weightage ?? 0), 0) / carried;
  return { score: Number(score.toFixed(1)), parts, carried, unweighted };
};

/**
 * The term a request means, by name, within one session.
 *
 * Names rather than ids: a card is always about one session, and a name is
 * unique inside it — so `?term=Mid Term` is unambiguous, readable, and survives
 * being pasted into a message.
 */
export async function resolveTerm(academicSessionId, name) {
  if (!name) return null;

  /**
   * Terms are created on first use, whatever asks first.
   *
   * Creating them only when the result card looked would mean the very first
   * mark of the year — recorded before anyone opened a card — was refused for
   * naming a term the school "did not have", when in fact it had never been
   * asked. A school's terms come into being the moment something needs them.
   */
  const terms = await ensureTerms(academicSessionId);
  const wanted = String(name).trim().toLowerCase();
  const term = terms.find((t) => t.name.toLowerCase() === wanted);

  if (!term) {
    throw ApiError.notFound(
      `This session has no term called "${name}". It has ${terms.map((t) => t.name).join(", ")}.`
    );
  }
  return term;
}

/** Refuses a name or sequence already taken in this session. */
async function assertFree(academicSessionId, { name, sequence, exceptId }) {
  const clash = await prisma.examTerm.findFirst({
    where: {
      academicSessionId,
      ...(exceptId && { id: { not: exceptId } }),
      OR: [
        ...(name ? [{ name: { equals: name, mode: "insensitive" } }] : []),
        ...(sequence !== undefined ? [{ sequence }] : []),
      ],
    },
    select: { name: true, sequence: true },
  });
  if (!clash) return;

  throw ApiError.badRequest(
    clash.name.toLowerCase() === String(name ?? "").toLowerCase()
      ? `This session already has a term called "${clash.name}"`
      : `"${clash.name}" already sits at position ${clash.sequence} in the year`
  );
}

const cleanWeightage = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw ApiError.badRequest("A term's weightage has to be a percentage between 0 and 100");
  }
  return Math.round(n);
};

export async function createTerm(academicSessionId, body) {
  const name = String(body?.name ?? "").trim();
  if (!name) throw ApiError.badRequest("A term needs a name");
  if (name.length > 60) throw ApiError.badRequest("That name is too long for a result card");

  const sequence = Number(body?.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw ApiError.badRequest("A term needs its position in the year — 1, 2, 3 …");
  }

  await assertFree(academicSessionId, { name, sequence });

  return prisma.examTerm.create({
    data: {
      academicSessionId,
      name,
      sequence,
      weightage: cleanWeightage(body?.weightage) ?? null,
      startsOn: body?.startsOn ? new Date(body.startsOn) : null,
      endsOn: body?.endsOn ? new Date(body.endsOn) : null,
    },
  });
}

/**
 * How many rolled-up subject scores were built on a different weighting.
 *
 * `Enrollment.currentScore` is written when marks are recorded, so changing
 * a share leaves every existing figure standing on the old policy. The
 * result card recomputes from the marks and is right at once; the list and
 * the dashboards read the cache and are not. Saying how many are behind is
 * better than silently rewriting rows the school did not ask to touch.
 */
export const scoresBuiltOnOldWeighting = (academicSessionId) =>
  prisma.enrollment.count({
    where: { academicSessionId, currentScore: { not: null } },
  });

export async function updateTerm(academicSessionId, termId, body) {
  const term = await prisma.examTerm.findFirst({ where: { id: termId, academicSessionId } });
  if (!term) throw ApiError.notFound("Term not found");

  const name = body?.name === undefined ? undefined : String(body.name).trim();
  if (name !== undefined && !name) throw ApiError.badRequest("A term needs a name");

  const sequence = body?.sequence === undefined ? undefined : Number(body.sequence);
  if (sequence !== undefined && (!Number.isInteger(sequence) || sequence < 1)) {
    throw ApiError.badRequest("A term's position has to be 1 or more");
  }

  if (name !== undefined || sequence !== undefined) {
    await assertFree(academicSessionId, { name, sequence, exceptId: termId });
  }

  const weightage = cleanWeightage(body?.weightage);

  return prisma.examTerm.update({
    where: { id: termId },
    data: {
      ...(name !== undefined && { name }),
      ...(sequence !== undefined && { sequence }),
      ...(weightage !== undefined && { weightage }),
      ...(body?.startsOn !== undefined && { startsOn: body.startsOn ? new Date(body.startsOn) : null }),
      ...(body?.endsOn !== undefined && { endsOn: body.endsOn ? new Date(body.endsOn) : null }),
    },
  });
}

/**
 * Puts the year in a different order.
 *
 * Reordering used to mean deleting a term and adding it back, because two
 * terms cannot share a position and there is no way to swap them one at a
 * time — `Mid Term` cannot move to 1 while `First Term` is still sitting
 * there. That workaround released every mark recorded under the deleted term,
 * to get a cosmetic change, which is a bad trade for a school to be offered.
 *
 * So it is done in two phases inside one transaction: every term is parked on
 * a negative position, which nothing else can collide with, and then given its
 * final one. Nothing is deleted and no mark moves.
 *
 * The whole year has to be listed. A partial order would leave the terms it
 * did not mention wherever they were, which is how you end up with two terms
 * at position 2 and a school that cannot save either of them.
 */
export async function reorderTerms(academicSessionId, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw ApiError.badRequest("Send the terms in the order you want them");
  }

  const terms = await listTerms(academicSessionId);
  const known = new Set(terms.map((t) => t.id));

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw ApiError.badRequest("The same term is listed twice");
  }
  const unknown = orderedIds.find((id) => !known.has(id));
  if (unknown) throw ApiError.notFound("That term is not in this year");
  if (orderedIds.length !== terms.length) {
    throw ApiError.badRequest(
      `Order every term of the year — ${terms.length} of them, and ${orderedIds.length} were listed`
    );
  }

  await prisma.$transaction(async (tx) => {
    // Park them out of the way first, so nothing collides on the way past.
    for (const [i, id] of orderedIds.entries()) {
      await tx.examTerm.update({ where: { id }, data: { sequence: -(i + 1) } });
    }
    for (const [i, id] of orderedIds.entries()) {
      await tx.examTerm.update({ where: { id }, data: { sequence: i + 1 } });
    }
  });

  return listTerms(academicSessionId);
}

/**
 * Removes a term. The marks recorded under it stay, and stop belonging to any
 * term — `SetNull` on the foreign key. A school correcting a term it created by
 * mistake must not lose the exam that was sat under it.
 */
export async function deleteTerm(academicSessionId, termId) {
  const term = await prisma.examTerm.findFirst({
    where: { id: termId, academicSessionId },
    include: { _count: { select: { assessments: true } } },
  });
  if (!term) throw ApiError.notFound("Term not found");

  await prisma.examTerm.delete({ where: { id: termId } });
  return { name: term.name, marksReleased: term._count.assessments };
}
