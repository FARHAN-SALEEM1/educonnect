/**
 * Reading CSV in the browser, for the student bulk import.
 *
 * Hand-written rather than pulled in as a dependency: the import only needs
 * quoted fields, embedded commas and newlines, doubled quotes, and both line
 * endings — that is one screen of code, and it keeps the bundle where it is.
 * `utils/download.js` writes CSV; this reads it.
 */

/**
 * Splits raw CSV text into rows of string cells.
 *
 * A quote only opens a quoted field at the start of a cell, so a stray inch
 * mark in the middle of a value (`5" pipe`) stays literal instead of
 * swallowing the rest of the file.
 */
export const parseCsv = (text) => {
  const src = String(text ?? "").replace(/^﻿/, ""); // Excel writes a BOM
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quoted) {
      if (ch !== '"') {
        cell += ch;
      } else if (src[i + 1] === '"') {
        cell += '"'; // "" inside a quoted field is one literal quote
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  // Whatever follows the last newline.
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  // Blank lines — including the one most editors leave at the end of a file.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
};

/** "Roll No", "roll_no" and "RollNo" all have to reach the same column. */
const normalizeHeader = (h) => String(h ?? "").toLowerCase().replace(/[\s._-]+/g, "");

/**
 * Header spellings a person might reasonably type, mapped onto the field names
 * `POST /students/import` expects. Anything unrecognised is dropped rather
 * than guessed at, and reported so the uploader can see it was ignored.
 */
const HEADER_ALIASES = {
  name: "name",
  studentname: "name",
  fullname: "name",
  grade: "grade",
  class: "grade",
  section: "section",
  rollno: "rollNo",
  roll: "rollNo",
  rollnumber: "rollNo",
  dob: "dob",
  dateofbirth: "dob",
  birthdate: "dob",
  gender: "gender",
  bloodgroup: "bloodGroup",
  blood: "bloodGroup",
  phone: "phone",
  mobile: "phone",
  contact: "phone",
  phonenumber: "phone",
  address: "address",
  guardianname: "guardianName",
  parentname: "guardianName",
  guardian: "guardianName",
  guardianemail: "guardianEmail",
  parentemail: "guardianEmail",
  guardianphone: "guardianPhone",
  parentphone: "guardianPhone",
  guardianrelation: "guardianRelation",
  relation: "guardianRelation",
  relationship: "guardianRelation",
};

/** The columns the API refuses a row without. */
export const REQUIRED_COLUMNS = ["name", "grade", "rollNo"];

/** Every column the API reads, in the order the template writes them. */
export const IMPORT_COLUMNS = [
  "name",
  "grade",
  "section",
  "rollNo",
  "dob",
  "gender",
  "bloodGroup",
  "phone",
  "address",
  "guardianName",
  "guardianEmail",
  "guardianPhone",
  "guardianRelation",
];

/**
 * Reads a CSV file's text into import-shaped records.
 *
 * @returns {{headers: string[], mapped: string[], unknown: string[], missing: string[], records: object[]}}
 *   `records` carry a `__line` matching the line number the server reports in
 *   its per-row errors, so both sides point at the same row of the file.
 */
export const readImportSheet = (text) => {
  const rows = parseCsv(text);
  if (!rows.length) {
    return { headers: [], mapped: [], unknown: [], missing: [...REQUIRED_COLUMNS], records: [] };
  }

  const headers = rows[0].map((h) => String(h).trim());
  const keys = headers.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);

  const mapped = keys.filter(Boolean);
  const unknown = headers.filter((_, i) => !keys[i] && headers[i] !== "");
  const missing = REQUIRED_COLUMNS.filter((c) => !mapped.includes(c));

  const records = rows.slice(1).map((cells, i) => {
    // +1 for the header row, +1 because humans count from one — the same
    // arithmetic the import controller uses.
    const record = { __line: i + 2 };
    keys.forEach((key, col) => {
      if (key) record[key] = String(cells[col] ?? "").trim();
    });
    return record;
  });

  return { headers, mapped, unknown, missing, records };
};

/** A blank file in the exact shape the importer wants. */
export const importTemplateRows = () => [
  {
    name: "Ayesha Khan",
    grade: "Grade 9",
    section: "B",
    rollNo: "2024-095",
    dob: "2010-04-22",
    gender: "Female",
    bloodGroup: "O+",
    phone: "03001234567",
    address: "House 4, Model Town, Lahore",
    guardianName: "Imran Khan",
    guardianEmail: "imran.khan@example.com",
    guardianPhone: "03007654321",
    guardianRelation: "Father",
  },
];
