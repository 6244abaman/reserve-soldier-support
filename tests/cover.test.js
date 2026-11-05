// Tests for the Cover Person (app/js/cover.js), its link to the Router's
// helper mode, and the automatic end on return (CLAUDE.md rule 4).
const test = require("node:test");
const assert = require("node:assert");
const Cover = require("../app/js/cover.js");
const RD = require("../app/js/reserve-duty.js");
const Router = require("../app/js/router.js");
const schema = require("../app/js/schema.js");
const { validateProfile } = require("../app/js/validate.js");
const sampleProfile = require("./fixtures/sample-profile.js");

global.window = {};
require("../app/i18n/en.js");
const en = global.window.MOMENTUM_I18N.en;
const t = (k) => en[k];

function good(over) {
  return Object.assign({ name: "Dana", relationship: "sister", contact: "052-000 0000", sharedBusinessIds: ["b-1"],
    allowedTasks: ["answer_customers", "send_followups"], consent: true, agreed: true }, over);
}

function valid(p) {
  const r = validateProfile(p, schema);
  assert.ok(r.ok, JSON.stringify(r.errors));
}

test("setting up a Cover Person records consent, agreement, and the soldier's choices", () => {
  const r = Cover.setUp(sampleProfile(), good({ accessEndDate: "2026-12-31" }), "2026-11-05");
  assert.ok(r.ok);
  const c = r.profile.cover;
  assert.strictEqual(c.active, true);
  assert.strictEqual(c.coverAgreed, true);
  assert.strictEqual(c.soldierConsentDate, "2026-11-05");
  assert.strictEqual(c.agreedDate, "2026-11-05");
  assert.deepStrictEqual(c.sharedBusinessIds, ["b-1"]);
  assert.strictEqual(c.accessEndDate, "2026-12-31");
  valid(r.profile);
});

test("nothing is saved without a name, a business, a task, consent, and agreement", () => {
  const r = Cover.setUp(sampleProfile(), { name: " ", sharedBusinessIds: [], allowedTasks: [] }, "2026-11-05");
  assert.deepStrictEqual(r.errors, { name: "errName", businesses: "errBusinesses", tasks: "errTasks", consent: "errConsent", agreed: "errAgreed" });
  assert.strictEqual(Cover.setUp(sampleProfile(), good({ accessEndDate: "2026-01-01" }), "2026-11-05").errors.end, "errEnd");
});

test("only businesses that exist can be shared, and 'only monitor' means nothing else", () => {
  const r = Cover.setUp(sampleProfile(), good({ sharedBusinessIds: ["b-1", "b-999"], allowedTasks: ["monitor_only", "answer_customers"] }), "2026-11-05");
  assert.deepStrictEqual(r.profile.cover.sharedBusinessIds, ["b-1"]);
  assert.deepStrictEqual(r.profile.cover.allowedTasks, ["monitor_only"]);
});

test("the Cover Person is active only during the call-up, and the Router uses helper mode", () => {
  const set = Cover.setUp(sampleProfile(), good(), "2026-11-05").profile;
  assert.strictEqual(Cover.state(set, "2026-11-05"), "ready");
  assert.strictEqual(Router.route(set, { speaker: "cover", today: "2026-11-05" }).agent, "no_access");
  const away = RD.startCallUp(set, { start: "2026-11-05" }, "2026-11-05").profile;
  assert.strictEqual(Cover.state(away, "2026-11-06"), "active");
  const r = Router.route(away, { speaker: "cover", today: "2026-11-06" });
  assert.strictEqual(r.mode, "cover_helper");
  assert.strictEqual(Router.route(away, { speaker: "cover", today: "2026-11-06", request: { agent: "pricing" } }).agent, "not_for_cover");
});

test("access ends when the soldier ends it, and after the return date", () => {
  const away = RD.startCallUp(Cover.setUp(sampleProfile(), good(), "2026-11-05").profile, { start: "2026-11-05" }, "2026-11-05").profile;
  const ended = Cover.endAccess(away, "2026-11-10");
  assert.strictEqual(Cover.state(ended, "2026-11-10"), "none");
  assert.strictEqual(Router.route(ended, { speaker: "cover", today: "2026-11-10" }).agent, "no_access");
  const back = RD.markReturn(away, "2026-11-20");
  assert.strictEqual(Router.route(back, { speaker: "cover", today: "2026-11-21" }).agent, "no_access");
  assert.strictEqual(Cover.state(back, "2026-11-21"), "ended");
});

test("the handover brief refuses bank details, passwords, and ID numbers", () => {
  const p = Cover.setUp(sampleProfile(), good(), "2026-11-05").profile;
  for (const bad of ["The password is 1234", "חשבון בנק 12-345", "סיסמה לאתר: abc", "IBAN IL62 0108 0000 0009 9999 999",
    "Card 4580 1234 5678 9012", "מספר תעודת זהות 012345678"]) {
    assert.strictEqual(Cover.saveBrief(p, bad).error, "errPrivate", bad);
  }
  const ok = Cover.saveBrief(p, "Key customers: Levi (orders every Sunday). Supplier: Wood & Co, 03-555 1234.");
  assert.ok(ok.ok);
  valid(ok.profile);
  assert.strictEqual(Cover.saveBrief(p, "x".repeat(Cover.BRIEF_MAX + 1)).error, "errLong");
});

test("the message to send has the businesses, tasks, limits, and brief, and no private details", () => {
  let p = Cover.setUp(sampleProfile(), good({ accessEndDate: "2026-12-31" }), "2026-11-05").profile;
  p = Cover.saveBrief(p, "Levi orders every Sunday.").profile;
  const text = Cover.shareText(p, t);
  assert.match(text, /Hi Dana/);
  assert.match(text, /Noam Carpentry/);
  assert.match(text, /Answer customers, Send follow-up messages/);
  assert.match(text, /hiring wait for me/);
  assert.match(text, /Until: 2026-12-31/);
  assert.match(text, /Levi orders every Sunday/);
  assert.doesNotMatch(text, /050-123|Be'er Sheva|married/);
});

test("every Cover Person text exists in both languages", () => {
  require("../app/i18n/he.js");
  const he = global.window.MOMENTUM_I18N.he;
  for (const k of Object.keys(en).filter((k) => k.startsWith("cover.") || k.startsWith("rd."))) assert.ok(he[k], k);
  for (const task of Cover.TASKS) assert.ok(en["cover.task." + task] && he["cover.task." + task], task);
});
