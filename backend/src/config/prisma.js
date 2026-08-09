import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

/**
 * Models that are soft-deleted: their rows carry `deletedAt` and are hidden
 * from normal reads instead of being removed. Deleting any of these cascades
 * through a school's real records, so a mistaken click has to be recoverable.
 */
export const SOFT_DELETE_MODELS = new Set(["Institute", "Student", "Teacher", "Parent"]);

const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Unextended client. Only the recycle-bin, restore and purge paths use this —
 * everywhere else should go through `prisma` so deleted rows stay hidden.
 */
export const prismaRaw = new PrismaClient({
  log: env.isProd ? ["error"] : ["warn", "error"],
});

/**
 * Reads are filtered automatically; **writes are not**. Soft-deleting is done
 * explicitly in the controllers (`update({ deletedAt })`) rather than by
 * rewriting `delete` here — partly so the intent is visible at the call site,
 * and partly because extensions don't reliably apply inside interactive
 * transactions, which is exactly where the delete paths live.
 */
export const prisma = prismaRaw.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model) || !READ_OPERATIONS.has(operation)) {
          return query(args);
        }

        // An explicit deletedAt filter from the caller always wins — that's
        // how the recycle bin asks for the deleted rows.
        if (args?.where && "deletedAt" in args.where) return query(args);

        return query({ ...args, where: { ...args?.where, deletedAt: null } });
      },

      /**
       * findUnique can only filter on unique fields, so it can't carry
       * `deletedAt`. Rewriting it as findFirst keeps deleted rows hidden
       * without changing any call site.
       */
      async findUnique({ model, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model)) return query(args);
        return prismaRaw[model[0].toLowerCase() + model.slice(1)].findFirst({
          ...args,
          where: { ...args.where, deletedAt: null },
        });
      },
    },
  },
});

export async function connectDatabase() {
  await prismaRaw.$connect();
  console.log("[db] PostgreSQL connected");
}

export async function disconnectDatabase() {
  await prismaRaw.$disconnect();
  console.log("[db] PostgreSQL disconnected");
}
