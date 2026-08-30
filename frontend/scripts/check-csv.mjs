/**
 * Checks the CSV reader behind the student bulk import.
 *
 * The frontend has no test runner, so this is a plain script rather than a
 * suite: `npm run check:csv`. It covers the parts of CSV that actually bite —
 * quoted commas, embedded newlines, doubled quotes, Excel's BOM, CRLF — plus
 * the header aliasing that lets a person write "Roll No" instead of "rollNo".
 */
import { parseCsv, readImportSheet, REQUIRED_COLUMNS, IMPORT_COLUMNS } from "../src/utils/csv.js";

let pass=0, fail=0;
const eq=(label, actual, expected)=>{
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  const ok=a===e; ok?pass++:fail++;
  console.log(`  ${ok?"✓":"✗"} ${label}`);
  if(!ok) console.log(`      got      ${a}\n      expected ${e}`);
};

console.log("\n=== parseCsv ===");
eq("plain rows", parseCsv("a,b\n1,2"), [["a","b"],["1","2"]]);
eq("CRLF", parseCsv("a,b\r\n1,2\r\n"), [["a","b"],["1","2"]]);
eq("BOM stripped", parseCsv("﻿a,b\n1,2")[0], ["a","b"]);
eq("quoted comma", parseCsv('a,b\n"Khan, Ayesha",9'), [["a","b"],["Khan, Ayesha","9"]]);
eq("doubled quote", parseCsv('a\n"she said ""hi"""'), [["a"],['she said "hi"']]);
eq("embedded newline", parseCsv('a,b\n"line1\nline2",x'), [["a","b"],["line1\nline2","x"]]);
eq("inch mark mid-cell stays literal", parseCsv('a\n5" pipe'), [["a"],['5" pipe']]);
eq("trailing blank lines dropped", parseCsv("a,b\n1,2\n\n\n"), [["a","b"],["1","2"]]);
eq("empty cells preserved", parseCsv("a,b,c\n1,,3"), [["a","b","c"],["1","","3"]]);
eq("empty input", parseCsv(""), []);
eq("header only", parseCsv("name,grade"), [["name","grade"]]);

console.log("\n=== readImportSheet — header aliasing ===");
const aliased = readImportSheet("Name,Class,Roll No,Guardian Email\nAyesha,Grade 9,2024-1,a@b.com");
eq("aliases map to API field names", aliased.mapped, ["name","grade","rollNo","guardianEmail"]);
eq("record uses API keys", {...aliased.records[0]}, {__line:2,name:"Ayesha",grade:"Grade 9",rollNo:"2024-1",guardianEmail:"a@b.com"});
eq("no missing required columns", aliased.missing, []);

const snake = readImportSheet("name,grade,roll_no,guardian_phone\nA,G,1,03001234567");
eq("snake_case headers", snake.mapped, ["name","grade","rollNo","guardianPhone"]);

console.log("\n=== readImportSheet — problems it must surface ===");
const missing = readImportSheet("name,section\nAyesha,B");
eq("missing required columns reported", missing.missing, ["grade","rollNo"]);

const unknown = readImportSheet("name,grade,rollNo,favourite_colour\nA,G,1,blue");
eq("unknown column reported", unknown.unknown, ["favourite_colour"]);
eq("unknown column not in record", Object.keys(unknown.records[0]).includes("favourite_colour"), false);

const spaced = readImportSheet("name,grade,rollNo\n  Ayesha  ,  Grade 9 ,  2024-1 ");
eq("cells trimmed", {...spaced.records[0]}, {__line:2,name:"Ayesha",grade:"Grade 9",rollNo:"2024-1"});

const numbered = readImportSheet("name,grade,rollNo\nA,G,1\nB,G,2\nC,G,3");
eq("__line matches the file's line numbers", numbered.records.map(r=>r.__line), [2,3,4]);

const short = readImportSheet("name,grade,rollNo\nA,G");
eq("short row fills missing cell with empty string", short.records[0].rollNo, "");

console.log("\n=== constants ===");
eq("required columns", REQUIRED_COLUMNS, ["name","grade","rollNo"]);
eq("template column count", IMPORT_COLUMNS.length, 13);

console.log(`\n${"=".repeat(50)}\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
