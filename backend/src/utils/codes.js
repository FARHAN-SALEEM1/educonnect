import { prisma } from "../config/prisma.js";

/**
 * Human-friendly sequential codes (INS001, STU001, TCH001, PAR001).
 * Codes are unique per institute, so each school starts its own numbering.
 */
const pad = (n, width = 3) => String(n).padStart(width, "0");

export async function nextInstituteCode() {
  const count = await prisma.institute.count();
  return `INS${pad(count + 1)}`;
}

export async function nextStudentCode(instituteId) {
  const count = await prisma.student.count({ where: { instituteId } });
  return `STU${pad(count + 1)}`;
}

export async function nextTeacherCode(instituteId) {
  const count = await prisma.teacher.count({ where: { instituteId } });
  return `TCH${pad(count + 1)}`;
}

export async function nextParentCode(instituteId) {
  const count = await prisma.parent.count({ where: { instituteId } });
  return `PAR${pad(count + 1)}`;
}
