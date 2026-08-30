import { prismaRaw } from "../config/prisma.js";

/**
 * Human-friendly sequential codes (INS001, STU001, TCH001, PAR001).
 * Codes are unique per institute, so each school starts its own numbering.
 *
 * These deliberately use `prismaRaw`, the client *without* the soft-delete
 * read filter. A deleted row keeps its code — the unique index on
 * (instituteId, code) still holds it — so numbering off a filtered count made
 * the next code collide with a deleted one and every create failed with
 * "A record with this instituteId, code already exists". Deleting a single
 * teacher was enough to make adding teachers impossible from then on.
 *
 * Taking the highest code ever issued, rather than counting rows, also
 * survives the gaps that deletes leave behind.
 */
const pad = (n, width = 3) => String(n).padStart(width, "0");

/** Highest numeric suffix already issued for this prefix, including deleted rows. */
async function highestIssued(model, where) {
  const rows = await prismaRaw[model].findMany({ where, select: { code: true } });
  return rows.reduce((max, { code }) => {
    const n = Number.parseInt(String(code ?? "").replace(/^\D+/, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

/**
 * The next `count` codes in a series, for bulk paths that create many rows at
 * once and can't call the single-code helpers per row inside a transaction.
 */
export async function reserveCodes(model, prefix, where, count) {
  const start = await highestIssued(model, where);
  return Array.from({ length: count }, (_, i) => `${prefix}${pad(start + i + 1)}`);
}

export async function nextInstituteCode() {
  return `INS${pad((await highestIssued("institute", {})) + 1)}`;
}

export async function nextStudentCode(instituteId) {
  return `STU${pad((await highestIssued("student", { instituteId })) + 1)}`;
}

export async function nextTeacherCode(instituteId) {
  return `TCH${pad((await highestIssued("teacher", { instituteId })) + 1)}`;
}

export async function nextParentCode(instituteId) {
  return `PAR${pad((await highestIssued("parent", { instituteId })) + 1)}`;
}
