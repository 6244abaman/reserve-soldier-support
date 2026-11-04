// Tests for the storage layer (app/js/storage.js).
// A small fake stands in for the browser's localStorage.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createProfileStore, normalizePhone } = require("../app/js/storage.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function fakeLocalStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v))
  };
}

function makeStore(extra) {
  const backend = fakeLocalStorage();
  let tick = 0;
  const now = () => `2026-11-0${++tick}T09:00:00.000Z`;
  const store = createProfileStore(Object.assign({ backend, schema, validator, now }, extra));
  return { store, backend };
}

test("save, then load, gives back the same profile", () => {
  const { store } = makeStore();
  const saved = store.save(sampleProfile());
  assert.strictEqual(saved.ok, true);
  const loaded = store.load("050-123 4567");
  assert.strictEqual(loaded.ok, true);
  assert.deepStrictEqual(loaded.profile, saved.profile);
  assert.strictEqual(loaded.profile.businesses.length, 2);
});

test("the same phone written different ways finds the same profile", () => {
  const { store } = makeStore();
  store.save(sampleProfile());
  for (const phone of ["0501234567", "050-1234567", "+972 50 123 4567", "972501234567"]) {
    assert.strictEqual(store.load(phone).profile.person.firstName, "Noam", phone);
  }
});

test("save fills in createdAt once and updates updatedAt every time", () => {
  const { store } = makeStore();
  const p = sampleProfile();
  delete p.meta.createdAt;
  const first = store.save(p).profile;
  const second = store.save(first).profile;
  assert.strictEqual(first.meta.createdAt, "2026-11-01T09:00:00.000Z");
  assert.strictEqual(second.meta.createdAt, "2026-11-01T09:00:00.000Z");
  assert.strictEqual(second.meta.updatedAt, "2026-11-02T09:00:00.000Z");
});

test("an invalid profile is not saved, and the old one stays untouched", () => {
  const { store } = makeStore();
  store.save(sampleProfile());
  const bad = sampleProfile();
  bad.person.firstName = "Changed";
  bad.person.idNumber = "123456789";
  const result = store.save(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "person.idNumber"));
  assert.strictEqual(store.load("0501234567").profile.person.firstName, "Noam");
});

test("save does not change the object it was given", () => {
  const { store } = makeStore();
  const p = sampleProfile();
  const before = JSON.stringify(p);
  store.save(p);
  assert.strictEqual(JSON.stringify(p), before);
});

test("a profile without a full phone number cannot be saved", () => {
  const { store } = makeStore();
  const p = sampleProfile();
  p.person.phone = "050";
  const result = store.save(p);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors[0].path, "person.phone");
});

test("loading a phone with nothing saved returns no profile, without an error", () => {
  const { store } = makeStore();
  assert.deepStrictEqual(store.load("0529999999"), { ok: true, profile: null, errors: [] });
});

test("two soldiers with different phones are kept separate", () => {
  const { store } = makeStore();
  store.save(sampleProfile());
  const other = sampleProfile();
  other.person.phone = "0529999999";
  other.person.firstName = "Dana";
  store.save(other);
  assert.strictEqual(store.load("0501234567").profile.person.firstName, "Noam");
  assert.strictEqual(store.load("0529999999").profile.person.firstName, "Dana");
});

test("damaged saved data is reported and left in place, never deleted", () => {
  const { store, backend } = makeStore();
  backend.setItem("momentum.profile.0501234567", "{not json");
  const result = store.load("0501234567");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(backend.getItem("momentum.profile.0501234567"), "{not json");
});

test("saved data that no longer passes the check is still returned, not lost", () => {
  const { store, backend } = makeStore();
  const old = sampleProfile();
  old.person.oldField = "kept";
  backend.setItem("momentum.profile.0501234567", JSON.stringify(old));
  const result = store.load("0501234567");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.profile.person.oldField, "kept");
});

test("a full or blocked device gives a clear error instead of crashing", () => {
  const backend = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  const { store } = makeStore({ backend });
  const result = store.save(sampleProfile());
  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0].message, /could not be saved on this device/);
});

test("phone numbers are cleaned up the same way every time", () => {
  assert.strictEqual(normalizePhone("050-123 4567"), "0501234567");
  assert.strictEqual(normalizePhone("+972-50-123-4567"), "0501234567");
  assert.strictEqual(normalizePhone("12"), null);
  assert.strictEqual(normalizePhone(undefined), null);
});

test("app/js/schema.js matches schema/recovery-profile.json (run npm run build:schema if this fails)", () => {
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "recovery-profile.json"), "utf8"));
  assert.deepStrictEqual(schema, original);
});
