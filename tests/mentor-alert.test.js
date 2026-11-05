// Tests for mentor alerts (Phase 9): the proxy route that emails the mentor
// through Resend (proxy/alerts.js) and the app side (app/js/mentor-alert.js).
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../proxy/server.js");
const Alerts = require("../proxy/alerts.js");
const MA = require("../app/js/mentor-alert.js");
const Esc = require("../app/js/escalation.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function fakeSender(ok) {
  const sent = [];
  return { sent, send: async (m) => { sent.push(m); return { ok: ok !== false, status: ok === false ? 500 : 200 }; } };
}

async function withServer(options, fn) {
  const server = createServer(Object.assign({ alertsReady: () => true }, options));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try { await fn(base); } finally { server.close(); }
}

function alert(base, body) {
  return fetch(base + "/api/alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const L1 = { level: 1, reason: "Level 1: Self-harm (2026-11-05, from soldier)", firstName: "Noam", phone: "050-123 4567", profileId: "p-001", language: "he" };

test("a Level 1 alert is emailed with the name and phone, and never the soldier's words", async () => {
  const s = fakeSender();
  await withServer({ sendEmail: s.send }, async (base) => {
    const res = await alert(base, L1);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { sent: true });
  });
  assert.strictEqual(s.sent.length, 1);
  assert.match(s.sent[0].subject, /Level 1 \(urgent\): Noam/);
  assert.match(s.sent[0].text, /Reach out now/);
  assert.match(s.sent[0].text, /Phone: 050-123 4567/);
});

test("the same alert is sent once a day; a failed send can be tried again", async () => {
  const failing = fakeSender(false);
  const memory = Alerts.createAlertMemory();
  await withServer({ sendEmail: failing.send, alertMemory: memory }, async (base) => {
    assert.strictEqual((await alert(base, L1)).status, 502);
  });
  const s = fakeSender();
  await withServer({ sendEmail: s.send, alertMemory: memory }, async (base) => {
    await alert(base, L1);
    const again = await (await alert(base, L1)).json();
    assert.strictEqual(again.repeat, true);
  });
  assert.strictEqual(s.sent.length, 1);
});

test("at Level 2 or 3 the phone needs the soldier's agreement", async () => {
  const s = fakeSender();
  await withServer({ sendEmail: s.send }, async (base) => {
    const noConsent = await alert(base, Object.assign({}, L1, { level: 2, reason: "Level 2: Legal action (2026-11-05, from soldier)" }));
    assert.strictEqual(noConsent.status, 400);
    const ok = await alert(base, { level: 2, reason: "Level 2: Legal action (2026-11-05, from soldier)", firstName: "Noam" });
    assert.strictEqual(ok.status, 200);
  });
  assert.match(s.sent[0].text, /Phone: not shared/);
});

test("bad alerts are refused, and without Resend set up the proxy says so", async () => {
  const s = fakeSender();
  await withServer({ sendEmail: s.send }, async (base) => {
    assert.strictEqual((await alert(base, { level: 4, reason: "x" })).status, 400);
    assert.strictEqual((await alert(base, { level: 1, reason: "" })).status, 400);
    assert.strictEqual((await alert(base, Object.assign({}, L1, { phone: "call me <script>" }))).status, 400);
  });
  await withServer({ sendEmail: s.send, alertsReady: () => false }, async (base) => {
    assert.strictEqual((await alert(base, L1)).status, 503);
    const health = await (await fetch(base + "/health")).json();
    assert.strictEqual(health.alerts, false);
  });
  assert.strictEqual(s.sent.length, 0);
});

test("too many alerts from one address are slowed down", async () => {
  const { createRateLimiter } = require("../proxy/limits.js");
  const s = fakeSender();
  await withServer({ sendEmail: s.send, alertRateLimiter: createRateLimiter({ limit: 2 }) }, async (base) => {
    await alert(base, L1);
    await alert(base, Object.assign({}, L1, { reason: "Level 1: other (2026-11-05, from soldier)" }));
    assert.strictEqual((await alert(base, Object.assign({}, L1, { reason: "Level 1: third" }))).status, 429);
  });
});

test("Resend is called with the key, the mentor's address, and the message", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.MENTOR_EMAIL = "mentor@example.org";
  delete process.env.ALERT_FROM;
  const calls = [];
  const send = Alerts.resendSender(async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; });
  await send({ subject: "S", text: "T" });
  assert.strictEqual(Alerts.ready(), true);
  assert.strictEqual(calls[0].url, "https://api.resend.com/emails");
  assert.strictEqual(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { from: "Momentum <onboarding@resend.dev>", to: ["mentor@example.org"], subject: "S", text: "T" });
  delete process.env.RESEND_API_KEY;
  delete process.env.MENTOR_EMAIL;
  assert.strictEqual(Alerts.ready(), false);
});

test("app side: a new flag is pending until it is sent; phone only at Level 1 or with agreement", () => {
  const flagged2 = Esc.flagProfile(sampleProfile(), { level: 2, label: "Legal action", from: "soldier" });
  assert.ok(MA.pending(flagged2));
  const p2 = MA.payload(flagged2);
  assert.strictEqual(p2.level, 2);
  assert.strictEqual(p2.phone, undefined);
  assert.strictEqual(p2.firstName, "Noam");
  const approved = JSON.parse(JSON.stringify(flagged2));
  approved.flags.mentorContactApproved = true;
  assert.strictEqual(MA.payload(approved).phone, "050-123 4567");
  const sent = MA.markSent(flagged2, flagged2.flags.escalationReason, "2026-11-05T10:00:00Z");
  assert.strictEqual(MA.pending(sent), false);
  const flagged1 = Esc.flagProfile(sent, { level: 1, label: "Self-harm", from: "soldier" });
  assert.ok(MA.pending(flagged1), "a more serious flag is sent too");
  assert.strictEqual(MA.payload(flagged1).phone, "050-123 4567");
  assert.strictEqual(MA.pending(sampleProfile()), false);
});

test("app side: every alert the app builds passes the proxy's checks", () => {
  for (const level of [1, 2, 3]) {
    const p = Esc.flagProfile(sampleProfile(), { level, label: "Something", from: "soldier" });
    assert.strictEqual(Alerts.problemWithAlert(MA.payload(p)), null, "level " + level);
  }
});
