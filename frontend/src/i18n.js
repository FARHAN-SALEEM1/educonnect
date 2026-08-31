/**
 * Urdu for the people who did not choose English.
 *
 * The admin and the teachers run English software all day. A guardian checking
 * whether their child was marked absent did not sign up for that, and in most
 * Pakistani households they are the one member of the family least served by an
 * English-only screen. So this covers the parent portal, and only that.
 *
 * No i18n library. There are about a hundred and twenty strings here; a
 * dependency to look them up in a table would weigh more than the table.
 *
 * The layout is **not** flipped to RTL. A browser lays Urdu out right-to-left
 * inside its own run whichever way the page runs, so the words read correctly
 * without touching 1,889 inline styles — and a half-finished RTL flip reads far
 * worse than a clean left-to-right page with Urdu in it. If the whole product
 * is ever translated, that is the moment to do the flip properly.
 */
import { useEffect, useState } from "react";

const UR = {
  // ── navigation ─────────────────────────────────────────────────────────
  Dashboard: "ڈیش بورڈ",
  Attendance: "حاضری",
  Grades: "نتائج",
  "AI Insights": "اے آئی تجزیہ",
  Messages: "پیغامات",
  Fees: "فیس",
  Timetable: "ٹائم ٹیبل",
  Notices: "اعلانات",
  Profile: "پروفائل",
  More: "مزید",
  "Log out": "لاگ آؤٹ",

  // ── greeting and framing ───────────────────────────────────────────────
  "Good morning": "صبح بخیر",
  "Good afternoon": "دوپہر بخیر",
  "Good evening": "شام بخیر",
  // Urdu puts the name first, so the lead-in is empty and the tail carries it.
  "Here's everything about ": "",
  "'s academic journey.": " کے تعلیمی سفر کی مکمل تفصیل۔",

  // ── the headline figures ───────────────────────────────────────────────
  Average: "اوسط",
  "Across all subjects": "تمام مضامین میں",
  "Class Rank": "کلاس میں پوزیشن",
  "AI Score": "اے آئی اسکور",
  "No marks recorded yet": "ابھی کوئی نمبر درج نہیں",
  "Current Average": "موجودہ اوسط",
  "Quick Stats": "مختصر اعداد و شمار",
  // Counted phrases carry {n} rather than being glued together, because Urdu
  // puts the number where English does not: "5 طلبہ میں سے", not "of 5".
  "of {n} students": "{n} طلبہ میں سے",
  "{n} school day": "{n} اسکول دن",
  "{n} school days": "{n} اسکول دن",

  // ── attendance ─────────────────────────────────────────────────────────
  Present: "حاضر",
  Absent: "غیر حاضر",
  Late: "دیر سے",
  Leave: "چھٹی",
  Day: "دن",
  "Attendance Record": "حاضری کا ریکارڈ",
  "Attendance — last 12 months": "حاضری — گزشتہ بارہ ماہ",
  "Most Recent Days": "حالیہ دن",
  Tracking: "حاضری",

  // ── marks and subjects ─────────────────────────────────────────────────
  Subject: "مضمون",
  "Subject Performance": "مضامین کی کارکردگی",
  "Subject Breakdown": "مضامین کی تفصیل",
  "Recent Assessments": "حالیہ ٹیسٹ",
  "All Assessments": "تمام ٹیسٹ",
  "Grades & Results": "نتائج",
  "View Result Card": "رزلٹ کارڈ دیکھیں",
  "Full report →": "مکمل رپورٹ ←",
  "Details →": "تفصیل ←",
  "All →": "سب ←",
  Academic: "تعلیمی",
  "Overall Performance Trend": "مجموعی کارکردگی کا رجحان",
  "Average across all subjects, previous assessment vs current.":
    "تمام مضامین کی اوسط — پچھلے ٹیسٹ کے مقابلے میں۔",
  "Click a row for details · ↑↓ = AI trend":
    "تفصیل کے لیے قطار پر کلک کریں · ↑↓ = اے آئی رجحان",

  // ── fees ───────────────────────────────────────────────────────────────
  "Fee Management": "فیس",
  Finance: "مالیات",
  Invoiced: "کل بل",
  Paid: "ادا شدہ",
  Outstanding: "واجب الادا",
  Pending: "باقی",
  Overdue: "میعاد گزر چکی",
  "Payment History": "ادائیگی کی تفصیل",
  "Invoice Amounts": "بل کی رقم",
  "Download Fee Statement": "فیس اسٹیٹمنٹ ڈاؤن لوڈ کریں",
  "No invoices have been issued yet.": "ابھی کوئی بل جاری نہیں ہوا۔",
  "Nothing billed yet.": "ابھی کوئی بل نہیں۔",
  Month: "مہینہ",
  Amount: "رقم",
  "Due Date": "آخری تاریخ",
  "Paid On": "ادائیگی کی تاریخ",
  Status: "حالت",
  "✓ Nothing Due": "✓ کچھ واجب الادا نہیں",
  "What the school has billed per period.": "اسکول نے ہر مدت میں کتنا بل کیا۔",
  "{n} invoice": "{n} بل",
  "{n} invoices": "{n} بل",
  "{n} settled": "{n} ادا شدہ",
  "{n} unpaid": "{n} غیر ادا شدہ",
  "All issued invoices for {n} have been settled.": "{n} کے تمام جاری بل ادا ہو چکے ہیں۔",
  Viewing: "دیکھ رہے ہیں",

  // ── the rest of the guardian's screens ─────────────────────────────────
  "Total": "کل",
  "Rate": "شرح",
  "Current": "موجودہ",
  "Target": "ہدف",
  "Minimum": "کم از کم",
  "Days recorded": "درج شدہ دن",
  "Best month": "بہترین مہینہ",
  "On-time rate": "وقت پر آنے کی شرح",
  "Leave days": "چھٹی کے دن",
  "Inbox": "موصولہ",
  "Sent": "بھیجے گئے",
  "+ Compose": "+ نیا پیغام",
  "Parent": "والد / سرپرست",
  "Grade": "جماعت",
  "Rank": "پوزیشن",
  "Subjects": "مضامین",
  "Not ranked yet": "ابھی پوزیشن نہیں",
  "Full Name": "پورا نام",
  "Date of Birth": "تاریخِ پیدائش",
  "Blood Group": "بلڈ گروپ",
  "Phone": "فون",
  "Name": "نام",
  "Email": "ای میل",
  "Relation": "رشتہ",
  "Roll No.": "رول نمبر",
  "Class rank not available yet": "کلاس میں پوزیشن ابھی دستیاب نہیں",
  "No concerns flagged": "کوئی تشویش نہیں",
  "✓ All fees cleared": "✓ تمام فیس ادا",
  "AI Performance Score": "اے آئی کارکردگی اسکور",
  "Academic Standing": "تعلیمی حیثیت",
  "Current Class Rank": "موجودہ کلاس پوزیشن",
  "Message the school →": "اسکول کو پیغام بھیجیں ←",
  "▼ Read more": "▼ مزید پڑھیں",
  "✦ AI Insight": "✦ اے آئی تجزیہ",
  "{n} has no outstanding academic or attendance concerns this term.": "اس ٹرم میں {n} کے تعلیم یا حاضری سے متعلق کوئی مسئلہ نہیں۔",
  "No attendance concerns flagged for {n}.": "{n} کی حاضری میں کوئی تشویش نہیں۔",
  "No subject data recorded for {n} yet": "{n} کے مضامین کا ابھی کوئی ڈیٹا نہیں",
  "Once marks and attendance are recorded, predictions appear here.": "نمبر اور حاضری درج ہونے کے بعد پیش گوئی یہاں آئے گی۔",
  "No timetable has been published for {n} yet.": "{n} کے لیے ابھی ٹائم ٹیبل جاری نہیں ہوا۔",
  "Academic": "تعلیمی",
  "Finance": "مالیات",
  "Event": "تقریب",
  "General": "عام",

  // ── messages ───────────────────────────────────────────────────────────
  Communication: "رابطہ",
  Message: "پیغام",
  "New Message": "نیا پیغام",
  Send: "بھیجیں",
  Cancel: "منسوخ",
  "Select a message": "کوئی پیغام منتخب کریں",
  "Choose from the inbox on the left": "بائیں طرف انباکس سے منتخب کریں",
  "To (Teacher / Admin)": "بنام (استاد / ایڈمن)",
  "Subject of message": "پیغام کا عنوان",
  "Write your message here…": "اپنا پیغام یہاں لکھیں…",

  // ── notices, timetable, profile ────────────────────────────────────────
  School: "اسکول",
  "Notices & Announcements": "اعلانات",
  Schedule: "شیڈول",
  "Class Timetable": "کلاس کا ٹائم ٹیبل",
  Account: "اکاؤنٹ",
  "Student Profile": "طالبِ علم کی معلومات",
  "Personal Information": "ذاتی معلومات",
  "Academic Info": "تعلیمی معلومات",
  "Parent / Guardian": "والد / سرپرست",
  Address: "پتہ",
  Change: "تبدیل کریں",
  Notifications: "اطلاعات",

  // ── the AI panel ───────────────────────────────────────────────────────
  Intelligence: "تجزیہ",
  "AI Insights & Predictions": "اے آئی تجزیہ اور پیش گوئی",
  "AI Academic Intelligence Engine": "اے آئی تعلیمی تجزیہ",
  "AI Alert": "اے آئی انتباہ",
  "Personalized Recommendations": "تجاویز",
  "Per-Subject Predictions": "ہر مضمون کی پیش گوئی",
  "View AI Insights →": "اے آئی تجزیہ دیکھیں ←",
  Predicted: "متوقع",
  "vs. Target": "ہدف کے مقابلے میں",
};

const KEY = "ec-lang";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "ur" ? "ur" : "en";
  } catch {
    // A private window, or a browser told to keep no site data. English is the
    // honest fallback; it is what the rest of the product speaks.
    return "en";
  }
};

let lang = read();
const listeners = new Set();

export const getLang = () => lang;

export const setLang = (next) => {
  lang = next === "ur" ? "ur" : "en";
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  for (const f of listeners) f(lang);
};

export const subscribeLang = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Translate, or hand back exactly what came in.
 *
 * A missing key returns the English rather than a placeholder, so a string
 * nobody has translated yet reads as English instead of shouting about itself
 * to the guardian.
 */
export const t = (s) => (lang === "ur" && UR[s] !== undefined ? UR[s] : s);

/** A phrase with a number in it, placed where the language puts it. */
export const tn = (key, n) => t(key).split("{n}").join(n);

/** Every key that has an Urdu translation — used by the coverage check. */
export const urduKeys = () => Object.keys(UR);

/**
 * Subscribes a component to the choice, so switching language repaints the
 * screen instead of waiting for the next unrelated render.
 *
 * Returns the language rather than `t` itself: `t` reads the module's current
 * value, so it is always correct, but React needs *something* to change for it
 * to re-run the component at all.
 */
export const useLang = () => {
  const [current, setCurrent] = useState(getLang);
  useEffect(() => subscribeLang(setCurrent), []);
  return current;
};
