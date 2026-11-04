// Tests for the weekly tracker (app/js/accountability.js).
const test = require("node:test");
const assert = require("node:assert");
const acc = require("../app/js/accountability.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

// Two businesses with plans: 5 open actions in total.
function withPlans() {
  const p = sampleProfile();
  p.businesses[0].plan.priorities = [
    { goal: "Collect money owed", actions: [
      { action: "Send reminder to Levi", dueDate: "2026-11-10", status: "not_started" },
      { action: "Call the bank", dueDate: "2026-11-20", status: "done" }
    ] },
    { goal: "Refill the pipeline", actions: [
      { action: "Message 5 past customers", dueDate: "2026-11-12", status: "in_progress" },
      { action: "Update Google profile" }
    ] }
  ];
  p.businesses[1].diagnosis = { completedAt: "2026-11-01T09:00:00Z", topProblems: [] };
  p.businesses[1].plan = { priorities: [{ goal: "Two weekend jobs", actions: [
    { action: "Post in the local group", dueDate: "2026-11-08", status: "blocked", note: "No photos yet" },
    { action: "Price list for repairs", dueDate: "2026-11-15", status: "dropped" }
  ] }] };
  return p;
}

test("open actions skip what is done or dropped", () => {
  const open = acc.openActions(withPlans()).map((a) => a.action);
  assert.deepStrictEqual(open, ["Send reminder to Levi", "Message 5 past customers", "Update Google profile", "Post in the local group"]);
});

test("at most three actions a week in total, across all businesses, earliest first", () => {
  const week = acc.weeklyActions(withPlans());
  assert.strictEqual(week.length, 3);
  assert.deepStrictEqual(week.map((a) => a.action), ["Post in the local group", "Send reminder to Levi", "Message 5 past customers"]);
  assert.deepStrictEqual(week.map((a) => a.businessId), ["b-2", "b-1", "b-1"]);
});

test("status changes are saved with a note, and stay valid", () => {
  const p = acc.setStatus(withPlans(), { businessId: "b-1", priority: 0, index: 0 }, "blocked", " Levi isn't answering ");
  const a = p.businesses[0].plan.priorities[0].actions[0];
  assert.strictEqual(a.status, "blocked");
  assert.strictEqual(a.note, "Levi isn't answering");
  assert.deepStrictEqual(validator.validateProfile(p, schema).errors, []);
  assert.throws(() => acc.setStatus(p, { businessId: "b-1", priority: 0, index: 0 }, "late"), /Unknown status/);
  assert.throws(() => acc.setStatus(p, { businessId: "b-1", priority: 5, index: 0 }, "done"), /No such action/);
});

test("a check-in is recorded; more than three next actions is refused", () => {
  const ok = acc.recordCheckIn(withPlans(), { date: "2026-11-09", done: ["Called 3 customers"], blockers: [], nextActions: ["a", "b", "c"] });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.profile.checkIns.length, 2);
  assert.strictEqual(ok.profile.checkIns[1].answeredBy, "soldier");
  assert.deepStrictEqual(validator.validateProfile(ok.profile, schema).errors, []);
  const tooMany = acc.recordCheckIn(withPlans(), { date: "2026-11-09", nextActions: ["a", "b", "c", "d"] });
  assert.strictEqual(tooMany.ok, false);
});

test("the same action blocked two weeks in a row flags a mentor at Level 3", () => {
  let p = withPlans();
  p = acc.recordCheckIn(p, { date: "2026-11-02", blockers: ["Post in the local group"], nextActions: [] }).profile;
  p = acc.recordCheckIn(p, { date: "2026-11-09", blockers: ["post in the  local group", "Something new"], nextActions: [] }).profile;
  assert.deepStrictEqual(acc.blockedTwice(p), ["post in the  local group"]);
  const flagged = acc.flagIfBlockedTwice(p, () => "2026-11-09T10:00:00Z");
  assert.strictEqual(flagged.flags.mentorEscalation, true);
  assert.match(flagged.flags.escalationReason, /^Level 3: The same action was blocked two weeks in a row/);
});

test("blocked once, or different blockers, does not flag", () => {
  let p = withPlans();
  p = acc.recordCheckIn(p, { date: "2026-11-02", blockers: ["A"], nextActions: [] }).profile;
  p = acc.recordCheckIn(p, { date: "2026-11-09", blockers: ["B"], nextActions: [] }).profile;
  assert.deepStrictEqual(acc.blockedTwice(p), []);
  assert.strictEqual(acc.flagIfBlockedTwice(p).flags.mentorEscalation, false);
});

test("a Level 3 'blocked twice' flag never replaces a more serious flag", () => {
  let p = withPlans();
  p.flags = { mentorEscalation: true, escalationReason: "Level 1: Self-harm (2026-11-01, from soldier)" };
  p = acc.recordCheckIn(p, { date: "2026-11-02", blockers: ["A"], nextActions: [] }).profile;
  p = acc.recordCheckIn(p, { date: "2026-11-09", blockers: ["A"], nextActions: [] }).profile;
  assert.match(acc.flagIfBlockedTwice(p).flags.escalationReason, /^Level 1/);
});

test("the tracker never changes the profile it was given", () => {
  const p = withPlans();
  const before = JSON.stringify(p);
  acc.setStatus(p, { businessId: "b-1", priority: 0, index: 0 }, "done");
  acc.recordCheckIn(p, { date: "2026-11-09", nextActions: [] });
  acc.flagIfBlockedTwice(p);
  assert.strictEqual(JSON.stringify(p), before);
});

test("topic actions join the weekly list, still at most three in total", () => {
  const p = withPlans();
  p.businesses[0].topicWork = [{ topic: "pricing", date: "2026-11-04", summary: "New prices",
    actions: [{ action: "Quote the next three jobs at the new price", dueDate: "2026-11-05", status: "not_started" }] }];
  const week = acc.weeklyActions(p);
  assert.strictEqual(week.length, 3);
  assert.strictEqual(week[0].action, "Quote the next three jobs at the new price");
  assert.strictEqual(week[0].source, "topic");
  const done = acc.setStatus(p, { businessId: "b-1", source: "topic", topic: 0, index: 0 }, "done");
  assert.strictEqual(done.businesses[0].topicWork[0].actions[0].status, "done");
  assert.deepStrictEqual(validator.validateProfile(done, schema).errors, []);
});
