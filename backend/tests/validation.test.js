import { describe, expect, it } from "vitest";
import { emailField, phone } from "../src/validators/common.js";

/**
 * These are the exact accept/reject lists the product requires, pinned as
 * tests so a future change to the regexes can't silently loosen them.
 */

const accepts = (schema, v) => schema.safeParse(v).success;

describe("Pakistani phone validation", () => {
  it("accepts every valid 03xx mobile prefix", () => {
    for (const v of [
      "03001234567", "03111234567", "03221234567", "03331234567", "03451234567",
      "03551234567", "03661234567", "03771234567", "03881234567", "03991234567",
    ]) {
      expect(accepts(phone, v), `${v} should be accepted`).toBe(true);
    }
  });

  it("rejects wrong prefixes, wrong lengths and non-digits", () => {
    for (const v of [
      "3001234567",       // missing leading 0
      "0300123456",       // 10 digits
      "030012345678",     // 12 digits
      "+923001234567",    // +92
      "00923001234567",   // 0092
      "03001234abc",      // letters
      "abc03001234567",
      "03 001234567",     // spaces are not allowed at all
      "0300-1234567",     // dashes are not allowed at all
      "0300 1234567",
      "(0300)1234567",    // brackets are not allowed at all
      "0300",
      "",
      "   ",
      "0400123456789",    // wrong prefix
      "02112345678",      // landline prefix
    ]) {
      expect(accepts(phone, v), `${JSON.stringify(v)} should be rejected`).toBe(false);
    }
  });

  it("keeps a valid number exactly as typed", () => {
    expect(phone.parse("03001234567")).toBe("03001234567");
    expect(phone.parse("  03001234567  ")).toBe("03001234567"); // surrounding space only
  });

  it("explains the problem rather than saying 'invalid'", () => {
    expect(phone.safeParse("+923001234567").error.errors[0].message).toMatch(/\+92/);
    expect(phone.safeParse("0300123456").error.errors[0].message).toMatch(/exactly 11 digits/);
    expect(phone.safeParse("04001234567").error.errors[0].message).toMatch(/start with 03/);
  });
});

describe("email validation", () => {
  it("rejects the malformed addresses the browser would allow", () => {
    for (const v of [
      "test", "test@", "@gmail.com", "test@gmail", "test@gmail.",
      "test..test@gmail.com", "test@.com", "test@gmail..com",
      "", "   ", "a@b", "test@-gmail.com", "test@gmail.c",
      ".test@gmail.com", "test.@gmail.com", "te st@gmail.com",
      "test@@gmail.com",
    ]) {
      expect(accepts(emailField, v), `${JSON.stringify(v)} should be rejected`).toBe(false);
    }
  });

  it("accepts legitimate addresses", () => {
    for (const v of [
      "user@gmail.com", "user.name@gmail.com", "user_name@gmail.com",
      "user-name@gmail.com", "user123@example.com", "a.b.c@sub.domain.co.uk",
      "user+tag@gmail.com",
    ]) {
      expect(accepts(emailField, v), `${v} should be accepted`).toBe(true);
    }
  });

  it("trims and lowercases so duplicates can't slip past uniqueness", () => {
    expect(emailField.parse("  User@Gmail.COM  ")).toBe("user@gmail.com");
  });
});
