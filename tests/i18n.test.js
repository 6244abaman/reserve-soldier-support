// Every screen text must exist in both Hebrew and English.
const test = require("node:test");
const assert = require("node:assert");

global.window = {};
require("../app/i18n/he.js");
require("../app/i18n/en.js");
const { he, en } = global.window.MOMENTUM_I18N;
const flow = require("../app/js/intake-flow.js");
const { MODULES } = require("../app/js/router.js");

test("Hebrew and English have exactly the same text keys", () => {
  assert.deepStrictEqual(Object.keys(he).filter((k) => !(k in en)), [], "missing in English");
  assert.deepStrictEqual(Object.keys(en).filter((k) => !(k in he)), [], "missing in Hebrew");
});

test("every Intake question, choice, and summary label has text", () => {
  for (const q of flow.QUESTIONS) {
    assert.ok(he[`q.${q.id}.label`], `q.${q.id}.label`);
    for (const opt of q.options || []) assert.ok(he[`opt.${q.id}.${opt}`], `opt.${q.id}.${opt}`);
    if (!["another", "bizDebtAmount", "bizDebtOverdue"].includes(q.id)) assert.ok(he[`lbl.${q.id}`], `lbl.${q.id}`);
  }
});

test("every module has a name and a Router sentence", () => {
  for (const m of MODULES) {
    assert.ok(he[`mod.${m}`] && en[`mod.${m}`], `mod.${m}`);
    assert.ok(he[`router.module.${m}`] && en[`router.module.${m}`], `router.module.${m}`);
  }
});
