import { prisma } from "../config/prisma.js";

/**
 * Fire-and-forget audit trail. Never allowed to fail a request —
 * a logging problem shouldn't roll back a successful operation.
 */
export const audit = (req, { action, entity, entityId = null, meta = null }) => {
  prisma.auditLog
    .create({
      data: {
        userId: req.user?.id ?? null,
        instituteId: req.instituteId ?? req.user?.instituteId ?? null,
        action,
        entity,
        entityId,
        meta,
        ip: req.ip,
      },
    })
    .catch((err) => console.error("[audit] failed to record:", err.message));
};
