/**
 * Field validation shared across every form.
 *
 * These rules mirror the Zod schemas in backend/src/validators/common.js.
 * The server is still the authority — nothing here can be trusted, because a
 * request can always be sent straight to the API. This exists so the user
 * gets immediate, specific feedback instead of a round-trip.
 */

// ─────────────────────────── Email ───────────────────────────

/**
 * Deliberately stricter than the browser's `type="email"`, which accepts
 * things like `test@gmail` and `a@b`.
 *
 *   local @ label(.label)+   with a TLD of 2+ letters
 *
 * Rejects: consecutive dots, a leading/trailing dot in either part, a hyphen
 * at the start or end of any domain label, and single-segment domains.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Trims and lowercases — what gets sent and stored. */
export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

export const isValidEmail = (value) => {
  const email = normalizeEmail(value);
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false; // "test..test@gmail.com"
  const [local] = email.split("@");
  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  return EMAIL_RE.test(email);
};

/** null when valid, otherwise a message aimed at a normal user. */
export const emailError = (value, { required = true, label = "Email" } = {}) => {
  const email = normalizeEmail(value);
  if (!email) return required ? `${label} is required.` : null;
  if (!email.includes("@")) return `${label} must contain @ — for example name@gmail.com`;
  if (email.split("@").length > 2) return `${label} can only contain one @`;

  const [local, domain] = email.split("@");
  if (!local) return `${label} is missing the part before @`;
  if (!domain) return `${label} is missing the part after @ — for example name@gmail.com`;
  if (!domain.includes(".")) return `${label} needs a domain ending such as .com`;
  if (domain.endsWith(".")) return `${label} can't end with a dot`;
  if (email.includes("..")) return `${label} can't contain two dots in a row`;
  if (!/[A-Za-z]{2,}$/.test(domain)) return `${label} must end in a valid domain such as .com or .pk`;

  return isValidEmail(email) ? null : `Enter a valid ${label.toLowerCase()} — for example name@gmail.com`;
};

// ─────────────────────────── Phone ───────────────────────────

/**
 * Pakistani mobile format only: exactly 11 digits beginning 03.
 * e.g. 03001234567 — no +92, no 0092, no spaces, dashes or brackets.
 */
const PK_PHONE_RE = /^03\d{9}$/;

/** Trim only. Formatting characters are rejected, not silently removed. */
export const normalizePhone = (value) => String(value ?? "").trim();

export const isValidPhone = (value) => PK_PHONE_RE.test(normalizePhone(value));

export const phoneError = (value, { required = true, label = "Phone number" } = {}) => {
  const phone = normalizePhone(value);
  if (!phone) return required ? `${label} is required.` : null;

  if (/^\+92/.test(phone)) return `${label} must start with 03, not +92 — for example 03001234567`;
  if (/^0092/.test(phone)) return `${label} must start with 03, not 0092 — for example 03001234567`;
  if (/[\s()-]/.test(phone)) return `${label} must be digits only — no spaces, dashes or brackets. For example 03001234567`;
  if (/[^\d]/.test(phone)) return `${label} may only contain digits — for example 03001234567`;
  if (!phone.startsWith("03")) return `${label} must start with 03 — for example 03001234567`;
  if (phone.length !== 11) {
    return `${label} must be exactly 11 digits — you entered ${phone.length}. For example 03001234567`;
  }
  return PK_PHONE_RE.test(phone) ? null : `Enter a valid ${label.toLowerCase()} — for example 03001234567`;
};

// ─────────────────────────── Generic ───────────────────────────

export const requiredError = (value, label) =>
  String(value ?? "").trim() ? null : `${label} is required.`;

export const positiveIntError = (value, label, { min = 1, max = 100000, required = true } = {}) => {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? `${label} is required.` : null;
  if (!/^\d+$/.test(raw)) return `${label} must be a whole number — digits only.`;
  const n = Number(raw);
  if (n < min) return `${label} must be at least ${min}.`;
  if (n > max) return `${label} can't be more than ${max.toLocaleString()}.`;
  return null;
};

export const moneyError = (value, label, { required = true } = {}) => {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? `${label} is required.` : null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return `${label} must be a valid amount, e.g. 12500 or 12500.50`;
  if (Number(raw) < 0) return `${label} can't be negative.`;
  return null;
};

export const passwordError = (value, { min = 8 } = {}) => {
  const v = String(value ?? "");
  if (!v) return "Password is required.";
  if (v.length < min) return `Password must be at least ${min} characters.`;
  if (v.length > 72) return "Password is too long (max 72 characters).";
  return null;
};

export const nameError = (value, label = "Name", { min = 2, max = 120 } = {}) => {
  const v = String(value ?? "").trim();
  if (!v) return `${label} is required.`;
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  if (v.length > max) return `${label} can't be longer than ${max} characters.`;
  return null;
};

export const dateError = (value, label = "Date", { required = true, future = true } = {}) => {
  const v = String(value ?? "").trim();
  if (!v) return required ? `${label} is required.` : null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return `${label} is not a valid date.`;
  if (!future && d > new Date()) return `${label} can't be in the future.`;
  return null;
};

/** First error in a map of { field: message|null }, or null if all clear. */
export const firstError = (errors) => Object.values(errors).find(Boolean) ?? null;
