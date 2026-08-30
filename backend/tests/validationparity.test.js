import { describe, expect, it } from "vitest";
import { phone, emailField } from "../src/validators/common.js";
import {
  phoneError,
  emailError,
  normalizeEmail,
  isValidPhone,
} from "../../frontend/src/utils/validate.js";

/**
 * The frontend validators must agree with the server about what is valid.
 *
 * `frontend/src/utils/validate.js` is a hand-written mirror of the rules in
 * `backend/src/validators/common.js`. The backend suite pins the server side
 * and the frontend has no test runner, so until now nothing compared the two:
 * loosening either one would have gone unnoticed until a form accepted
 * something the API then refused, or refused something it would have taken.
 *
 * These live here rather than in the frontend precisely so no test tooling has
 * to be added there — the mirror imports nothing, so it loads fine from this
 * side, and zod is already available for the server half.
 *
 * Only the verdict is compared. The wording deliberately differs: the server
 * writes for an API consumer, the form writes for whoever is typing.
 */

const verdicts = (cases, fe, be) =>
  cases.map((value) => ({
    value,
    frontend: fe(value) ? "reject" : "accept",
    backend: be.safeParse(value).success ? "accept" : "reject",
  }));

describe("phone: the form and the API agree", () => {
  const CASES = [
    "03001234567", // the one good shape
    "03123456789",
    "0300123456", // ten digits
    "030012345678", // twelve
    "3001234567", // no leading zero
    "+923001234567",
    "00923001234567",
    "0300 123 4567",
    "0300-1234567",
    "(0300)1234567",
    // Landlines, rejected on both sides by decision — see HANDOFF Appendix A §7.
    // The eleven-digit ones matter most: a ten-digit landline is already caught
    // by the length rule, so only these can tell a real "allow landlines" drift
    // apart from a rule that happens to reject them for the wrong reason.
    "04235761234", // Lahore, eleven digits
    "02134567890", // Karachi, eleven digits
    "0421234567", // Lahore, ten digits
    "0213456789", // Karachi, ten digits
    "0300123456a",
    "abcdefghijk",
    "",
    "   ",
  ];

  it("reaches the same verdict on every case", () => {
    const disagreements = verdicts(CASES, (v) => phoneError(v, { required: true }), phone)
      .filter((r) => r.frontend !== r.backend);
    expect(
      disagreements,
      `form and API disagree on: ${disagreements.map((d) => JSON.stringify(d.value)).join(", ")}`
    ).toEqual([]);
  });

  it("accepts exactly one shape, and it is the documented one", () => {
    const accepted = CASES.filter((v) => phone.safeParse(v).success);
    expect(accepted).toEqual(["03001234567", "03123456789"]);
    for (const v of accepted) expect(isValidPhone(v)).toBe(true);
  });

  it("still refuses landlines on both sides — changing that is a decision, not a slip", () => {
    for (const landline of ["04235761234", "02134567890", "0421234567", "0213456789"]) {
      expect(phoneError(landline, { required: true }), `form accepted ${landline}`).toBeTruthy();
      expect(phone.safeParse(landline).success, `API accepted ${landline}`).toBe(false);
    }
  });
});

describe("email: the form and the API agree", () => {
  const CASES = [
    "a@b.com",
    "a@b.co",
    "a+tag@b.com",
    "user.name@school.edu.pk",
    "A@X.COM",
    " a@b.com ",
    "test@gmail", // no dot in the domain
    "a@b",
    "a..b@x.com",
    ".a@x.com",
    "a.@x.com",
    "a@x..com",
    "a@x.c", // one-letter TLD
    "a@b.com.",
    "a@-b.com",
    "a b@c.com",
    "@x.com",
    "a@",
    "plain",
    "a@@b.com",
    "",
  ];

  it("reaches the same verdict on every case", () => {
    const disagreements = verdicts(CASES, (v) => emailError(v, { required: true }), emailField)
      .filter((r) => r.frontend !== r.backend);
    expect(
      disagreements,
      `form and API disagree on: ${disagreements.map((d) => JSON.stringify(d.value)).join(", ")}`
    ).toEqual([]);
  });

  it("normalises the same way, so a lookup finds what was stored", () => {
    // The import path stored addresses as typed while the API lowercased them,
    // and Postgres compares case-sensitively — two parents for one guardian.
    for (const raw of ["A@X.COM", " Mixed.Case@School.EDU ", "user@Example.Com"]) {
      const server = emailField.parse(raw);
      expect(normalizeEmail(raw)).toBe(server);
    }
  });
});

describe("required vs optional", () => {
  it("treats a blank as fine when the field is optional, on both sides", () => {
    expect(phoneError("", { required: false })).toBeNull();
    expect(emailError("", { required: false })).toBeNull();
    // The server models optional-ness with .optional(), not inside the rule.
    expect(phone.optional().safeParse(undefined).success).toBe(true);
    expect(emailField.optional().safeParse(undefined).success).toBe(true);
  });

  it("treats a blank as a problem when the field is required", () => {
    expect(phoneError("", { required: true })).toBeTruthy();
    expect(emailError("", { required: true })).toBeTruthy();
    expect(phone.safeParse("").success).toBe(false);
    expect(emailField.safeParse("").success).toBe(false);
  });
});
