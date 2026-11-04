// Tests for the profile checker (app/js/validate.js).
const test = require("node:test");
const assert = require("node:assert");
const { validateProfile } = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function errorsFor(profile) {
  return validateProfile(profile, schema).errors.map((e) => e.path + " " + e.message);
}

function minimalProfile() {
  return { meta: {}, person: { phone: "0501234567" }, service: {}, businesses: [] };
}

test("a full, correct profile with two businesses passes", () => {
  assert.deepStrictEqual(errorsFor(sampleProfile()), []);
});

test("a brand-new, almost empty profile passes", () => {
  assert.deepStrictEqual(errorsFor(minimalProfile()), []);
});

test("missing required sections are reported", () => {
  const errors = errorsFor({ meta: {}, person: {} });
  assert.ok(errors.includes("service is required"));
  assert.ok(errors.includes("businesses is required"));
});

test("a business needs an id, a name, and a known sector", () => {
  const p = minimalProfile();
  p.businesses.push({ name: "Cafe", sector: "restaurants" });
  const errors = errorsFor(p);
  assert.ok(errors.includes("businesses[0].id is required"));
  assert.ok(errors.some((e) => e.startsWith("businesses[0].sector must be one of")));
});

test("privacy: fields that are not in the schema are rejected", () => {
  const p = sampleProfile();
  p.person.idNumber = "123456789";
  p.businesses[0].bankAccount = "12-345-678901";
  p.service.combatDetails = "anything";
  const errors = errorsFor(p);
  assert.ok(errors.includes("person.idNumber is not allowed here (not in the schema)"));
  assert.ok(errors.includes("businesses[0].bankAccount is not allowed here (not in the schema)"));
  assert.ok(errors.includes("service.combatDetails is not allowed here (not in the schema)"));
});

test("limits: at most three problems, priorities, channels, and weekly actions", () => {
  const p = sampleProfile();
  const b = p.businesses[0];
  b.diagnosis.topProblems = Array(4).fill({ problem: "x" });
  b.plan.priorities = Array(4).fill({ goal: "x" });
  b.marketing.channels = ["a", "b", "c", "d"];
  p.checkIns[0].nextActions = ["a", "b", "c", "d"];
  const errors = errorsFor(p);
  assert.ok(errors.includes("businesses[0].diagnosis.topProblems can have at most 3 items (has 4)"));
  assert.ok(errors.includes("businesses[0].plan.priorities can have at most 3 items (has 4)"));
  assert.ok(errors.includes("businesses[0].marketing.channels can have at most 3 items (has 4)"));
  assert.ok(errors.includes("checkIns[0].nextActions can have at most 3 items (has 4)"));
});

test("dates must be real dates in the right format", () => {
  const p = sampleProfile();
  p.service.callUpStart = "01/03/2026";
  p.service.callUpEnd = "2026-02-30";
  p.meta.updatedAt = "yesterday";
  const errors = errorsFor(p);
  assert.ok(errors.includes("service.callUpStart must be a date like 2026-11-04"));
  assert.ok(errors.includes("service.callUpEnd must be a date like 2026-11-04"));
  assert.ok(errors.includes("meta.updatedAt must be a date and time like 2026-11-04T09:30:00Z"));
});

test("numbers must be numbers, not text", () => {
  const p = sampleProfile();
  p.businesses[0].numbers.cashOnHand = "18000";
  assert.ok(errorsFor(p).includes("businesses[0].numbers.cashOnHand must be a number (got string)"));
});

test("choices must come from the allowed list", () => {
  const p = sampleProfile();
  p.service.status = "away";
  p.cover.allowedTasks = ["sign_contracts"];
  const errors = errorsFor(p);
  assert.ok(errors.some((e) => e.startsWith("service.status must be one of")));
  assert.ok(errors.some((e) => e.startsWith("cover.allowedTasks[0] must be one of")));
});

test("the marketing content calendar is checked too", () => {
  const p = sampleProfile();
  const entry = p.businesses[0].marketing.contentCalendar[0];
  entry.approval = "auto_posted";
  entry.postedBy = "agent";
  const errors = errorsFor(p);
  assert.ok(errors.some((e) => e.startsWith("businesses[0].marketing.contentCalendar[0].approval must be one of")));
  assert.ok(errors.some((e) => e.startsWith("businesses[0].marketing.contentCalendar[0].postedBy must be one of")));
});

test("the checker refuses schema rules it does not understand", () => {
  const strange = { type: "object", properties: { a: { type: "string", minLength: 2 } } };
  assert.throws(() => validateProfile({ a: "x" }, strange), /does not understand the schema rule "minLength"/);
});
