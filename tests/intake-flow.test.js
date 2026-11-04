// Tests for the Intake flow (app/js/intake-flow.js).
const test = require("node:test");
const assert = require("node:assert");
const flow = require("../app/js/intake-flow.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");

// Answers every screen in order. answers[id] is a value, a function (biz) => value,
// or { skip: true }. Returns the finished profile and the screens visited.
function runIntake(answers) {
  let profile = flow.newProfile("he", () => "p-test");
  let pos = flow.first();
  const visited = [];
  for (let guard = 0; pos.id !== "summary" && guard < 200; guard++) {
    visited.push(pos.biz === null ? pos.id : `${pos.id}#${pos.biz}`);
    let a = answers[pos.id];
    if (typeof a === "function") a = a(pos.biz);
    const answer = a && a.skip ? { skip: true } : a && a.value !== undefined ? a : { value: a };
    profile = flow.applyAnswer(profile, pos, answer);
    pos = flow.next(profile, pos);
  }
  return { profile, visited };
}

const twoBusinesses = {
  firstName: "נועם",
  phone: "050-123 4567",
  city: "באר שבע",
  family: "partner_children",
  role: "לוגיסטיקה",
  reserveDays: { value: 210, estimate: true },
  status: "home",
  bizName: (b) => (b === 0 ? "נגרות נועם" : "תיקון רהיטים"),
  bizDescription: (b) => (b === 0 ? "מטבחים וארונות בהזמנה" : "תיקונים בסופי שבוע"),
  bizSector: (b) => (b === 0 ? "trades_construction" : "other"),
  bizYears: 6,
  bizEmployees: 1,
  bizRevenueBefore: { value: 32000, estimate: true },
  bizRevenueNow: 14000,
  bizFixedCosts: 9000,
  bizHasDebt: (b) => (b === 0 ? "yes" : "no"),
  bizDebtAmount: 7500,
  bizDebtOverdue: "yes",
  bizCustomers: 12,
  bizPain: "אין עבודות בצנרת לחודש הבא",
  another: (b) => (b === 0 ? "yes" : "no"),
  goal: "הכנסה יציבה של 25,000 בחודש"
};

test("two businesses: person and service asked once, each business asked in full", () => {
  const { profile, visited } = runIntake(twoBusinesses);
  assert.strictEqual(visited.filter((v) => v === "firstName").length, 1);
  assert.strictEqual(visited.filter((v) => v === "role").length, 1);
  assert.ok(visited.includes("bizName#0") && visited.includes("bizName#1"));
  assert.ok(visited.includes("another#0") && visited.includes("another#1"));
  assert.strictEqual(profile.businesses.length, 2);
  assert.strictEqual(profile.businesses[0].name, "נגרות נועם");
  assert.strictEqual(profile.businesses[1].biggestPain, "אין עבודות בצנרת לחודש הבא");
  assert.deepStrictEqual(profile.businesses[0].numbers.debts, [{ type: "total", amount: 7500, overdue: true }]);
  assert.deepStrictEqual(profile.businesses[1].numbers.debts, []);
  assert.strictEqual(profile.goals.threeMonthOutcome, "הכנסה יציבה של 25,000 בחודש");
});

test("the finished profile passes the schema check", () => {
  const { profile } = runIntake(twoBusinesses);
  assert.deepStrictEqual(validator.validateProfile(flow.completeIntake(profile), schema).errors, []);
});

test("it keeps asking 'another business?' until the answer is no", () => {
  const { profile, visited } = runIntake({ ...twoBusinesses, another: (b) => (b < 2 ? "yes" : "no") });
  assert.strictEqual(profile.businesses.length, 3);
  assert.deepStrictEqual(visited.filter((v) => v.startsWith("another")), ["another#0", "another#1", "another#2"]);
  assert.deepStrictEqual(profile.businesses.map((b) => b.id), ["b-1", "b-2", "b-3"]);
});

test("debt amount and overdue are asked only when there is a debt", () => {
  const { visited } = runIntake(twoBusinesses);
  assert.ok(visited.includes("bizDebtAmount#0"));
  assert.ok(!visited.includes("bizDebtAmount#1"));
});

test("call-up dates are asked only when serving or expecting a call-up", () => {
  assert.ok(!runIntake(twoBusinesses).visited.includes("callUpDates"));
  const serving = runIntake({ ...twoBusinesses, status: "expecting_call_up", callUpDates: ["2026-12-01", ""] });
  assert.ok(serving.visited.includes("callUpDates"));
  assert.strictEqual(serving.profile.service.callUpStart, "2026-12-01");
  assert.strictEqual(flow.markOf(serving.profile, "service.callUpEnd"), "missing");
});

test("skipped questions are marked missing, estimates are marked estimated", () => {
  const { profile } = runIntake({ ...twoBusinesses, city: { skip: true }, bizCustomers: { skip: true } });
  assert.strictEqual(profile.person.city, undefined);
  assert.strictEqual(flow.markOf(profile, "person.city"), "missing");
  assert.strictEqual(flow.markOf(profile, "businesses[0].customers.regularCount"), "missing");
  assert.strictEqual(flow.markOf(profile, "service.reserveDaysLastTwoYears"), "estimated");
  assert.strictEqual(flow.markOf(profile, "businesses[0].numbers.monthlyRevenueBefore"), "estimated");
  assert.strictEqual(flow.markOf(profile, "businesses[0].numbers.monthlyRevenueNow"), null);
});

test("skipping a business name or sector still gives a valid profile", () => {
  const { profile } = runIntake({ ...twoBusinesses, bizName: { skip: true }, bizSector: { skip: true } });
  assert.strictEqual(profile.businesses[0].name, "");
  assert.strictEqual(profile.businesses[0].sector, "other");
  assert.strictEqual(flow.markOf(profile, "businesses[0].sector"), "missing");
  assert.deepStrictEqual(validator.validateProfile(profile, schema).errors, []);
});

test("answering again replaces the old answer and its mark", () => {
  let { profile } = runIntake(twoBusinesses);
  profile = flow.applyAnswer(profile, { id: "reserveDays", biz: null }, { value: 230 });
  assert.strictEqual(profile.service.reserveDaysLastTwoYears, 230);
  assert.strictEqual(flow.markOf(profile, "service.reserveDaysLastTwoYears"), null);
});

test("changing 'another business?' to no never deletes a business already entered", () => {
  let { profile } = runIntake(twoBusinesses);
  profile = flow.applyAnswer(profile, { id: "another", biz: 0 }, { value: "no" });
  assert.strictEqual(profile.businesses.length, 2);
});

test("Back goes to the previous screen and stops at the first one", () => {
  const { profile } = runIntake(twoBusinesses);
  assert.deepStrictEqual(flow.previous(profile, { id: "bizName", biz: 1 }), { id: "another", biz: 0 });
  assert.strictEqual(flow.previous(profile, flow.first()), null);
});

test("Intake never asks about service experiences, combat, or health", () => {
  const ids = flow.QUESTIONS.map((q) => q.id + " " + (q.path || "")).join(" ").toLowerCase();
  for (const word of ["combat", "experience", "medical", "health", "injur", "trauma", "unit"]) {
    assert.ok(!ids.includes(word), `found "${word}"`);
  }
});

test("numbers can be typed with commas or a shekel sign", () => {
  assert.strictEqual(flow.parseNumber("32,000"), 32000);
  assert.strictEqual(flow.parseNumber("₪ 14000"), 14000);
  assert.strictEqual(flow.parseNumber("about 5"), null);
  assert.strictEqual(flow.parseNumber(""), null);
});

test("completing intake sets intakeComplete and changes nothing else", () => {
  const { profile } = runIntake(twoBusinesses);
  const done = flow.completeIntake(profile);
  assert.strictEqual(done.meta.intakeComplete, true);
  assert.strictEqual(profile.meta.intakeComplete, false);
});
