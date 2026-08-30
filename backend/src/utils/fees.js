/**
 * What a challan comes to, and what is still owed on it.
 *
 * These two lines were written out by hand in five places — the fee controller,
 * the student list, the student detail, the parent dashboard and the parent
 * children list — and they had drifted: one summed the raw `amount`, three
 * netted off the discount and late fee, and none of them subtracted what had
 * already been received. Once part payment became possible that last omission
 * meant a guardian who had paid half a challan was still shown the whole thing.
 *
 * A family being quoted two different figures for the same child is worse than
 * being quoted none, so there is one definition and every screen reads it.
 */

/** Discount off, late fee on — what the challan is for. */
export const netAmount = (invoice) =>
  invoice.amount - (invoice.discount ?? 0) + (invoice.lateFee ?? 0);

/**
 * What is still owed. `paidAmount` is a running total of instalments, not a
 * settlement flag, so it is netted off whatever the invoice's status says.
 */
export const balanceOf = (invoice) =>
  Math.max(0, netAmount(invoice) - (invoice.paidAmount ?? 0));

/** Statuses that still owe money. WAIVED and PAID do not. */
export const isOutstanding = (invoice) =>
  invoice.status === "PENDING" || invoice.status === "OVERDUE";

/** Total still owed across a set of invoices. */
export const outstandingTotal = (invoices = []) =>
  invoices.filter(isOutstanding).reduce((sum, i) => sum + balanceOf(i), 0);
