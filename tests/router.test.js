// Tests for the Router (app/js/router.js), one group per rule in agents/router.md.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { route, sectorFile, FILES } = require("../app/js/router.js");
const sampleProfile = require("./fixtures/sample-profile.js");

// The sample has b-1 (diagnosed, with a plan) and b-2 (nothing yet).
function profile(edit) {
  const p = sampleProfile();
  if (edit) edit(p);
  return p;
}

const TODAY = "2026-11-04";

test("escalation comes first: Level 1 and 2 go to a human mentor, whatever else is asked", () => {
  const r1 = route(profile(), { message: "אני לא רוצה לחיות", request: { agent: "pricing", businessId: "b-1" } });
  assert.strictEqual(r1.agent, "mentor_handoff");
  assert.strictEqual(r1.escalation.level, 1);
  const r2 = route(profile(), { message: "I got a lawyer's letter" });
  assert.strictEqual(r2.agent, "mentor_handoff");
  assert.strictEqual(r2.say.key, "router.handoff2");
});

test("Level 3 is noted, and routing continues", () => {
  const r = route(profile(), { message: "I'm exhausted", request: { agent: "time_capacity", businessId: "b-1" } });
  assert.strictEqual(r.agent, "time_capacity");
  assert.strictEqual(r.escalation.level, 3);
});

test("rule 1: no profile or unfinished intake goes to Intake", () => {
  assert.strictEqual(route(null).agent, "intake");
  assert.strictEqual(route(profile((p) => { p.meta.intakeComplete = false; })).agent, "intake");
  assert.strictEqual(route(profile((p) => { p.businesses = []; })).agent, "intake");
});

test("rule 2: a business without a diagnosis goes to the Diagnostic, in order", () => {
  const r = route(profile((p) => { delete p.businesses[0].diagnosis; }));
  assert.strictEqual(r.agent, "diagnostic");
  assert.strictEqual(r.businessId, "b-1");
  assert.strictEqual(r.file, "agents/diagnostic.md");
  // b-1 is diagnosed, b-2 is not
  assert.strictEqual(route(profile()).businessId, "b-2");
});

test("rule 3: a diagnosis but no plan goes to Recovery Planning", () => {
  const r = route(profile((p) => {
    delete p.businesses[0].plan;
    p.businesses[1].diagnosis = { completedAt: "2026-11-01T09:00:00Z", topProblems: [] };
  }));
  assert.strictEqual(r.agent, "recovery_plan");
  assert.strictEqual(r.businessId, "b-1");
});

test("rule 4: every business has a plan -> Accountability", () => {
  const r = route(profile((p) => {
    p.businesses[1].diagnosis = { completedAt: "2026-11-01T09:00:00Z" };
    p.businesses[1].plan = { priorities: [{ goal: "Find two weekend jobs" }] };
  }));
  assert.strictEqual(r.agent, "accountability");
  assert.strictEqual(r.file, "agents/accountability.md");
});

test("rule 5: a specific request beats the default flow, and the default comes back afterwards", () => {
  const p = profile();
  const asked = route(p, { request: { agent: "pricing", businessId: "b-1" } });
  assert.strictEqual(asked.agent, "pricing");
  assert.strictEqual(asked.file, "modules/pricing.md");
  assert.strictEqual(asked.say.key, "router.module.pricing");
  // The next turn, with no request, returns to where the soldier left off.
  assert.strictEqual(route(p).agent, "diagnostic");
  assert.strictEqual(route(p).businessId, "b-2");
});

test("rule 6: with several businesses and none chosen, ask which one; never guess", () => {
  const r = route(profile(), { request: { agent: "cash_flow_debt" } });
  assert.strictEqual(r.agent, "ask_business");
  assert.strictEqual(r.pending, "cash_flow_debt");
  assert.deepStrictEqual(r.choices.map((c) => c.id), ["b-1", "b-2"]);
});

test("rule 6: with one business, no need to ask", () => {
  const r = route(profile((p) => { p.businesses = [p.businesses[0]]; }), { request: { agent: "staff" } });
  assert.strictEqual(r.agent, "staff");
  assert.strictEqual(r.businessId, "b-1");
});

test("rule 7: the sector file of the business in focus is loaded, or other.md", () => {
  assert.strictEqual(route(profile(), { request: { agent: "pricing", businessId: "b-1" } }).sectorFile, "sectors/trades-construction.md");
  assert.strictEqual(route(profile()).sectorFile, "sectors/other.md");
  assert.strictEqual(sectorFile("health_personal_care"), "sectors/health-personal-care.md");
  assert.strictEqual(sectorFile(undefined), "sectors/other.md");
});

function coverProfile(cover) {
  return profile((p) => {
    p.service.status = "called_up";
    p.cover = Object.assign({
      active: true, coverAgreed: true, allowedTasks: ["send_followups"],
      sharedBusinessIds: ["b-1"], accessEndDate: "2026-12-31"
    }, cover);
  });
}

test("rule 8: a Cover Person is routed in helper mode, only to shared businesses", () => {
  const r = route(coverProfile(), { speaker: "cover", today: TODAY });
  assert.strictEqual(r.mode, "cover_helper");
  assert.strictEqual(r.agent, "accountability"); // b-1 already has a plan; b-2 is not shared
  const f = route(coverProfile(), { speaker: "cover", today: TODAY, request: { agent: "customer_followup" } });
  assert.strictEqual(f.agent, "customer_followup");
  assert.strictEqual(f.businessId, "b-1");
});

test("rule 8: money, pricing, staff, and benefits stay with the soldier", () => {
  for (const agent of ["pricing", "cash_flow_debt", "staff", "benefits_grants"]) {
    assert.strictEqual(route(coverProfile(), { speaker: "cover", today: TODAY, request: { agent } }).agent, "not_for_cover", agent);
  }
  const monitorOnly = coverProfile({ allowedTasks: ["monitor_only"] });
  assert.strictEqual(route(monitorOnly, { speaker: "cover", today: TODAY, request: { agent: "customer_followup" } }).agent, "not_for_cover");
});

test("rule 8: no access without consent, after the end date, or when the soldier is home", () => {
  assert.strictEqual(route(coverProfile({ coverAgreed: false }), { speaker: "cover", today: TODAY }).agent, "no_access");
  assert.strictEqual(route(coverProfile({ accessEndDate: "2026-11-01" }), { speaker: "cover", today: TODAY }).agent, "no_access");
  const home = coverProfile();
  home.service.status = "home";
  assert.strictEqual(route(home, { speaker: "cover", today: TODAY }).agent, "no_access");
});

test("rule 8: a Cover Person cannot reach a business the soldier did not share", () => {
  const r = route(coverProfile(), { speaker: "cover", today: TODAY, request: { agent: "customer_followup", businessId: "b-2" } });
  assert.strictEqual(r.agent, "ask_business");
  assert.deepStrictEqual(r.choices.map((c) => c.id), ["b-1"]);
});

test("rule 8: a Cover Person's crisis goes to the mentor, never stays with the cover", () => {
  const r = route(coverProfile(), { speaker: "cover", today: TODAY, message: "The customer is threatening me" });
  assert.strictEqual(r.agent, "mentor_handoff");
  assert.strictEqual(r.escalation.from, "cover");
});

test("every prompt file the Router can load exists", () => {
  for (const file of Object.values(FILES)) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), file);
  }
  for (const s of ["food_hospitality", "retail_ecommerce", "trades_construction", "professional_services",
    "tech_creative", "health_personal_care", "transport_logistics", "other"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", sectorFile(s))), s);
  }
});

test("the Router never changes the profile", () => {
  const p = profile();
  const before = JSON.stringify(p);
  route(p, { message: "I'm exhausted", request: { agent: "pricing" } });
  assert.strictEqual(JSON.stringify(p), before);
});
