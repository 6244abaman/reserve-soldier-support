// Tests for reserve duty mode (app/js/reserve-duty.js) and its effect on the
// weekly check-in (CLAUDE.md rule 5).
const test = require("node:test");
const assert = require("node:assert");
const RD = require("../app/js/reserve-duty.js");
const Acc = require("../app/js/accountability.js");
const schema = require("../app/js/schema.js");
const { validateProfile } = require("../app/js/validate.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function valid(p) {
  const r = validateProfile(p, schema);
  assert.ok(r.ok, JSON.stringify(r.errors));
}

function withActions(p) {
  p.businesses[0].plan.priorities.push({ goal: "More quotes", actions: [
    { action: "Quote three jobs", dueDate: "2026-11-12", status: "not_started" },
    { action: "Ask for a deposit", dueDate: "2026-11-08", status: "done" }
  ] });
  return p;
}

test("marking a call-up freezes the plan: status, dates, nudges paused", () => {
  const before = sampleProfile();
  const r = RD.startCallUp(before, { start: "2026-11-05", end: "2026-12-10", lightMessage: true }, "2026-11-05");
  assert.ok(r.ok);
  assert.strictEqual(r.profile.service.status, "called_up");
  assert.strictEqual(r.profile.service.callUpStart, "2026-11-05");
  assert.strictEqual(r.profile.service.callUpEnd, "2026-12-10");
  assert.strictEqual(r.profile.flags.nudgesPaused, true);
  assert.strictEqual(r.profile.flags.lightMessageOptIn, true);
  assert.ok(RD.onDuty(r.profile));
  assert.strictEqual(before.service.status, "home", "the original profile is not changed");
  valid(r.profile);
});

test("an unknown end date is fine; an end before the start is not", () => {
  const ok = RD.startCallUp(sampleProfile(), { start: "2026-11-05" }, "2026-11-05");
  assert.ok(ok.ok);
  assert.strictEqual(ok.profile.service.callUpEnd, undefined, "the old end date is cleared");
  assert.deepStrictEqual(RD.startCallUp(sampleProfile(), { start: "2026-11-05", end: "2026-11-01" }, "2026-11-05"),
    { ok: false, error: "errEnd" });
  assert.strictEqual(RD.startCallUp(sampleProfile(), { start: "soon" }, "2026-11-05").error, "errStart");
});

test("the light message is off unless the soldier switches it on, and resets each call-up", () => {
  const p = sampleProfile();
  p.flags = { lightMessageSentAt: "2026-05-01T10:00:00Z" };
  const r = RD.startCallUp(p, { start: "2026-11-05" }, "2026-11-05").profile;
  assert.strictEqual(r.flags.lightMessageOptIn, false);
  assert.strictEqual(r.flags.lightMessageSentAt, undefined);
  assert.strictEqual(RD.setLightMessage(r, true).flags.lightMessageOptIn, true);
});

test("during a call-up the weekly check-in holds only the one most important action", () => {
  const home = withActions(sampleProfile());
  assert.ok(Acc.weeklyActions(home).length > 1);
  const away = RD.startCallUp(home, { start: "2026-11-05" }, "2026-11-05").profile;
  const week = Acc.weeklyActions(away);
  assert.strictEqual(week.length, 1);
  assert.strictEqual(week[0].action, "Send reminder to Levi", "earliest due date first");
});

test("returning: nudges restart, silence is not counted, and the app asks how to carry on", () => {
  const away = RD.startCallUp(sampleProfile(), { start: "2026-11-05", end: "2026-12-31" }, "2026-11-05").profile;
  away.flags.missedCheckIns = 4;
  const back = RD.markReturn(away, "2026-12-01");
  assert.strictEqual(back.service.status, "home");
  assert.strictEqual(back.service.callUpEnd, "2026-12-01", "the real return date, not the planned one");
  assert.strictEqual(back.flags.nudgesPaused, false);
  assert.strictEqual(back.flags.missedCheckIns, 0);
  assert.ok(RD.awaitingReturn(back));
  valid(back);
});

test("returning ends the Cover Person's access automatically", () => {
  const p = sampleProfile();
  p.cover = Object.assign({}, p.cover, { active: true, coverAgreed: true, accessEndDate: "2027-01-31" });
  const away = RD.startCallUp(p, { start: "2026-11-05" }, "2026-11-05").profile;
  assert.strictEqual(RD.markReturn(away, "2026-11-20").cover.accessEndDate, "2026-11-20");
});

test("21 days or more counts as a long absence", () => {
  const away = RD.startCallUp(sampleProfile(), { start: "2026-11-01" }, "2026-11-01").profile;
  assert.strictEqual(RD.longAbsence(RD.markReturn(away, "2026-11-21")), false);
  const long = RD.markReturn(away, "2026-11-22");
  assert.strictEqual(RD.absenceDays(long), 21);
  assert.strictEqual(RD.longAbsence(long), true);
});

test("picking up moves open actions later by the days away; nothing counts as late", () => {
  const away = RD.startCallUp(withActions(sampleProfile()), { start: "2026-11-05" }, "2026-11-05").profile;
  const back = RD.markReturn(away, "2026-11-25");          // 20 days away
  const p = RD.pickUp(back);
  const acts = p.businesses[0].plan.priorities.flatMap((pr) => pr.actions);
  assert.strictEqual(acts.find((a) => a.action === "Send reminder to Levi").dueDate, "2026-11-30");
  assert.strictEqual(acts.find((a) => a.action === "Quote three jobs").dueDate, "2026-12-02");
  assert.strictEqual(acts.find((a) => a.action === "Ask for a deposit").dueDate, "2026-11-08", "done actions stay as they were");
  assert.strictEqual(RD.awaitingReturn(p), false);
  valid(p);
});

test("a new plan or a fresh look only clears the question; the plan is replaced later, when confirmed", () => {
  const back = RD.markReturn(RD.startCallUp(sampleProfile(), { start: "2026-11-05" }, "2026-11-05").profile, "2026-11-30");
  const p = RD.finishReturn(back);
  assert.strictEqual(RD.awaitingReturn(p), false);
  assert.deepStrictEqual(p.businesses[0].plan, back.businesses[0].plan);
});

test("the planned end date passing does not end the call-up by itself", () => {
  const away = RD.startCallUp(sampleProfile(), { start: "2026-11-05", end: "2026-11-20" }, "2026-11-05").profile;
  assert.strictEqual(RD.endPassed(away, "2026-11-20"), false);
  assert.strictEqual(RD.endPassed(away, "2026-11-21"), true);
  assert.ok(RD.onDuty(away));
});
