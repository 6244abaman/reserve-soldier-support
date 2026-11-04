// Tests for saving Claude's answers (app/js/agent-results.js).
const test = require("node:test");
const assert = require("node:assert");
const R = require("../app/js/agent-results.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

const NOW = "2026-11-04T10:00:00.000Z";
const valid = (p) => assert.deepStrictEqual(validator.validateProfile(p, schema).errors, []);

test("findings are saved with at most three problems and a completion time", () => {
  const result = {
    summary: "Cash is tight.",
    topProblems: [
      { problem: "Cash runs out in 2 months", evidence: "18,000 in hand, 9,000 fixed costs", confidence: "high", urgent: true },
      { problem: "Few new jobs", evidence: "No jobs booked for December", confidence: "medium", urgent: false },
      { problem: "Old prices", evidence: "Prices unchanged since 2024", confidence: "sure", urgent: "yes" },
      { problem: "A fourth problem", evidence: "", confidence: "low", urgent: false },
      { problem: "" }
    ],
    unknowns: ["Real hours per job", " "],
    escalation: "none", escalationReason: ""
  };
  const p = R.applyFindings(sampleProfile(), "b-2", result, NOW);
  const d = p.businesses[1].diagnosis;
  assert.strictEqual(d.completedAt, NOW);
  assert.strictEqual(d.topProblems.length, 3);
  assert.strictEqual(d.topProblems[2].confidence, "low");   // unknown value made safe
  assert.strictEqual(d.topProblems[2].urgent, false);       // only true counts
  assert.deepStrictEqual(d.unknowns, ["Real hours per job"]);
  valid(p);
});

test("a plan keeps at most three priorities, four actions each, and only real dates", () => {
  const priorities = Array.from({ length: 5 }, (_, i) => ({
    goal: "Goal " + (i + 1),
    actions: Array.from({ length: 6 }, (_, j) => ({ action: "Step " + j, dueDate: j === 1 ? "2026-02-30" : "2026-11-1" + j })),
    successMeasure: "A number by a date"
  }));
  const p = R.applyPlan(sampleProfile(), "b-2", { summary: "Cash first.", priorities, openQuestions: ["Ask the accountant about VAT"] });
  const plan = p.businesses[1].plan;
  assert.strictEqual(plan.priorities.length, 3);
  assert.strictEqual(plan.priorities[0].actions.length, 4);
  assert.strictEqual(plan.priorities[0].actions[0].status, "not_started");
  assert.strictEqual(plan.priorities[0].actions[0].dueDate, "2026-11-10");
  assert.strictEqual(plan.priorities[0].actions[1].dueDate, undefined);   // 30 February dropped
  assert.deepStrictEqual(plan.openQuestions, ["Ask the accountant about VAT"]);
  valid(p);
});

test("a check-in updates statuses, records at most three next actions, and checks blocked-twice", () => {
  const reports = [
    { ref: { businessId: "b-1", priority: 0, index: 0 }, action: "Send reminder to Levi", status: "blocked", note: "No answer" }
  ];
  const result = {
    summary: "One thing got stuck. Next week, a smaller step.",
    nextActions: [
      { businessId: "b-1", action: "Call Levi instead of texting", dueDate: "2026-11-08" },
      { businessId: "b-1", action: "Update Google profile", dueDate: "not a date" },
      { businessId: "b-9", action: "Business that does not exist", dueDate: "2026-11-08" },
      { businessId: "b-2", action: "Post in the local group", dueDate: "2026-11-09" },
      { businessId: "b-2", action: "A fourth action", dueDate: "2026-11-10" }
    ],
    planNeedsReview: false, escalation: "none", escalationReason: ""
  };
  let out = R.applyCheckIn(sampleProfile(), reports, result, "2026-11-04");
  assert.strictEqual(out.ok, true);
  let p = out.profile;
  assert.strictEqual(p.businesses[0].plan.priorities[0].actions[0].status, "blocked");
  const last = p.checkIns[p.checkIns.length - 1];
  assert.deepStrictEqual(last.nextActions, ["Call Levi instead of texting (2026-11-08)", "Update Google profile", "Post in the local group (2026-11-09)"]);
  assert.deepStrictEqual(last.blockers, ["Send reminder to Levi"]);
  valid(p);
  // The same action blocked again the next week flags the mentor.
  out = R.applyCheckIn(p, reports, result, "2026-11-11");
  assert.match(out.profile.flags.escalationReason, /^Level 3: The same action was blocked two weeks in a row/);
});

test("when Claude's answer says a mentor is needed, the shared flag is set", () => {
  const level2 = { escalation: "2", escalationReason: "Cannot cover basic costs within 90 days" };
  const p = R.flagFromResult(sampleProfile(), level2, () => NOW);
  assert.match(p.flags.escalationReason, /^Level 2: Cannot cover basic costs within 90 days/);
  assert.strictEqual(R.escalationLevel({ escalation: "none" }), 0);
  assert.strictEqual(R.escalationLevel({ escalation: "7" }), 0);
  assert.deepStrictEqual(R.flagFromResult(sampleProfile(), { escalation: "none" }), sampleProfile());
});

test("saving answers never changes the profile it was given", () => {
  const p = sampleProfile();
  const before = JSON.stringify(p);
  R.applyFindings(p, "b-1", { topProblems: [], unknowns: [] }, NOW);
  R.applyPlan(p, "b-1", { priorities: [] });
  R.applyCheckIn(p, [], { nextActions: [] }, "2026-11-04");
  assert.strictEqual(JSON.stringify(p), before);
});
