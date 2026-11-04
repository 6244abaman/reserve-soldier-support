// Tests for the Diagnostic form (app/js/diagnostic-form.js).
const test = require("node:test");
const assert = require("node:assert");
const form = require("../app/js/diagnostic-form.js");
const Paths = require("../app/js/profile-paths.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function fullAnswers(over) {
  return Object.assign({
    monthlyRevenueBefore: { value: 32000 },
    monthlyRevenueNow: { value: "14,000" },
    fixedMonthlyCosts: { value: 9000, estimate: true },
    cashOnHand: { value: 18000 },
    monthsOfCashLeft: { value: 2, estimate: true },
    debts: { value: [{ type: "Wood supplier", amount: "7,500", overdue: true, deadline: "2026-11-30" }] },
    regularCount: { value: 12 },
    lostDuringService: { value: 5 },
    sources: { value: ["referrals", "groups"] },
    method: { value: "per_job" },
    marginPercent: { value: 18, estimate: true },
    hoursPerWeek: { value: 35 },
    whoRunsItWhenAway: { value: "  my brother  " },
    otherHelpers: { value: "my wife does the books" },
    equipmentOrStockProblems: { value: "The table saw needs a new motor" },
    employees: { value: 1 },
    benefitsUsed: { value: ["Reserve compensation, applied in May", ""] }
  }, over);
}

test("prefill shows what Intake already knows, so nothing is asked twice", () => {
  const values = form.prefill(sampleProfile(), "b-1");
  assert.strictEqual(values.monthlyRevenueBefore.value, 32000);
  assert.strictEqual(values.regularCount.value, 12);
  assert.deepStrictEqual(values.debts.value, [{ type: "supplier", amount: 7500, overdue: true, deadline: "2026-11-30" }]);
  assert.strictEqual(values.cashOnHand.value, 18000);
  // b-2 has almost nothing yet
  assert.strictEqual(form.prefill(sampleProfile(), "b-2").cashOnHand.value, null);
});

test("prefill marks numbers that were estimates", () => {
  const p = sampleProfile();
  Paths.mark(p, "businesses[0].numbers.monthlyRevenueBefore", "estimated");
  assert.strictEqual(form.prefill(p, "b-1").monthlyRevenueBefore.estimated, true);
});

test("a full form saves into the right business and passes the schema check", () => {
  const p = form.apply(sampleProfile(), "b-2", fullAnswers());
  const b = p.businesses[1];
  assert.strictEqual(b.numbers.monthlyRevenueNow, 14000);
  assert.deepStrictEqual(b.numbers.debts, [{ type: "Wood supplier", amount: 7500, overdue: true, deadline: "2026-11-30" }]);
  assert.deepStrictEqual(b.customers.sources, ["referrals", "groups"]);
  assert.strictEqual(b.pricing.method, "per_job");
  assert.strictEqual(b.capacity.whoRunsItWhenAway, "my brother");
  assert.deepStrictEqual(b.benefitsUsed, ["Reserve compensation, applied in May"]);
  assert.strictEqual(b.capacity.otherHelpers, "my wife does the books");
  assert.strictEqual(b.capacity.equipmentOrStockProblems, "The table saw needs a new motor");
  assert.deepStrictEqual(b.diagnosis, { unknowns: [] });
  assert.deepStrictEqual(validator.validateProfile(p, schema).errors, []);
});

test("estimates are marked estimated; other answers clear old marks", () => {
  const start = sampleProfile();
  Paths.mark(start, "businesses[1].numbers.cashOnHand", "missing");
  const p = form.apply(start, "b-2", fullAnswers());
  assert.strictEqual(Paths.markOf(p, "businesses[1].numbers.fixedMonthlyCosts"), "estimated");
  assert.strictEqual(Paths.markOf(p, "businesses[1].pricing.marginPercent"), "estimated");
  assert.strictEqual(Paths.markOf(p, "businesses[1].numbers.cashOnHand"), null);
});

test("skipped questions are marked missing and listed as unknowns", () => {
  const p = form.apply(sampleProfile(), "b-2", fullAnswers({ cashOnHand: { value: "" }, sources: { value: [] }, debts: { value: [] } }));
  assert.deepStrictEqual(p.businesses[1].diagnosis.unknowns, ["cashOnHand", "debts", "sources"]);
  assert.strictEqual(Paths.markOf(p, "businesses[1].numbers.cashOnHand"), "missing");
  assert.strictEqual(p.businesses[1].numbers.cashOnHand, undefined);
});

test("an empty box with only blank lines counts as not answered", () => {
  const p = form.apply(sampleProfile(), "b-2", fullAnswers({ benefitsUsed: { value: ["", "  "] } }));
  assert.ok(p.businesses[1].diagnosis.unknowns.includes("benefitsUsed"));
  assert.strictEqual(p.businesses[1].benefitsUsed, undefined);
});

test("'no debts' is an answer, not a skip", () => {
  const p = form.apply(sampleProfile(), "b-2", fullAnswers({ debts: { value: [], noDebts: true } }));
  assert.deepStrictEqual(p.businesses[1].numbers.debts, []);
  assert.ok(!p.businesses[1].diagnosis.unknowns.includes("debts"));
});

test("sending the form again clears old findings so they are worked out afresh", () => {
  const p = form.apply(sampleProfile(), "b-1", fullAnswers());
  assert.strictEqual(p.businesses[0].diagnosis.completedAt, undefined);
  assert.strictEqual(p.businesses[0].diagnosis.topProblems, undefined);
  assert.strictEqual(form.awaitingFindings(p.businesses[0]), true);
  assert.strictEqual(form.awaitingFindings(sampleProfile().businesses[0]), false);
});

test("wrong numbers are caught before saving", () => {
  const errors = form.check(fullAnswers({
    cashOnHand: { value: "a lot" },
    marginPercent: { value: 140 },
    debts: { value: [{ type: "Bank", amount: "some" }] }
  }));
  assert.deepStrictEqual(errors, { cashOnHand: "errNumber", marginPercent: "errPercent", "debts.0": "errNumber" });
  assert.deepStrictEqual(form.check(fullAnswers()), {});
});

test("the typed words are collected for the shared safety check", () => {
  const text = form.typedText(fullAnswers({ whoRunsItWhenAway: { value: "nobody, I might lose my house" } }));
  assert.match(text, /lose my house/);
  assert.match(text, /Wood supplier/);
  assert.match(text, /table saw/);
});

test("the form never changes the profile it was given", () => {
  const p = sampleProfile();
  const before = JSON.stringify(p);
  form.apply(p, "b-1", fullAnswers());
  assert.strictEqual(JSON.stringify(p), before);
});

test("the form asks only about the business, never about service or health", () => {
  const all = form.FIELDS.map((f) => f.id + " " + f.path).join(" ").toLowerCase();
  for (const word of ["combat", "medical", "health", "trauma", "unit", "experience"]) assert.ok(!all.includes(word), word);
});
