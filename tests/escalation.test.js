// Tests for the shared escalation check (app/js/escalation.js).
// Example messages are invented for testing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { checkMessage, flagProfile } = require("../app/js/escalation.js");
const phrases = require("../app/js/escalation-phrases.js");
const validator = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function expectEach(level, category, messages) {
  for (const text of messages) {
    const result = checkMessage(text);
    assert.strictEqual(result.level, level, `expected Level ${level} for: ${text}`);
    assert.strictEqual(result.category, category, `expected ${category} for: ${text}`);
  }
}

// ---------- Level 1: stop now and hand off immediately ----------

test("Level 1: self-harm and hopelessness, in Hebrew", () => {
  expectEach(1, "self_harm", [
    "אני חושב להתאבד",
    "לפעמים אני חושבת על התאבדות",
    "אני לא רוצה לחיות יותר",
    "עדיף לכולם בלעדיי",
    "אני מרגיש חסר תקווה לגמרי",
    "בא לי לגמור עם הכל",
    "אני לא מרגישה בטוחה בבית",
    "אֲנִי רוֹצֶה לָמוּת"
  ]);
});

test("Level 1: self-harm and hopelessness, in English", () => {
  expectEach(1, "self_harm", [
    "Sometimes I think about killing myself",
    "I feel suicidal",
    "I don't want to live anymore",
    "I dont want to live anymore",
    "I don’t want to live like this",
    "Everyone would be better off without me",
    "It all feels hopeless",
    "I've been having self-harm thoughts",
    "I don't feel safe"
  ]);
});

test("Level 1: harming someone else", () => {
  expectEach(1, "harm_to_others", [
    "אני אהרוג אותו אם הוא לא ישלם",
    "בא לי לפגוע בו",
    "I'm going to hurt someone",
    "I swear I'll kill him"
  ]);
});

test("Level 1: abuse or violence", () => {
  expectEach(1, "violence_or_abuse", [
    "בעלי מרביץ לי",
    "יש אלימות בבית",
    "הספק איים לפגוע בי",
    "My partner hits me",
    "There is violence at home",
    "He threatened to kill me"
  ]);
});

test("Level 1: medical emergency", () => {
  expectEach(1, "medical_emergency", [
    "יש לי כאבים בחזה",
    "לא מצליח לנשום",
    "לקחתי כדורים",
    "I have chest pains right now",
    "I took too many pills",
    "My worker passed out"
  ]);
});

// ---------- Level 2: stop the task and hand off the same day ----------

test("Level 2: legal action, enforcement, seizure", () => {
  expectEach(2, "legal_action", [
    "קיבלתי מכתב מעורך דין",
    "הספק הגיש נגדי תביעה",
    "יש לי תיק בהוצאה לפועל",
    "הם רוצים לעקל לי את החשבון",
    "יש לי דיון בבית המשפט",
    "We got a lawyer's letter",
    "They're taking me to court",
    "The bailiff came this morning",
    "The bank wants to repossess the equipment"
  ]);
});

test("Level 2: risk of losing home, vehicle, or tools", () => {
  expectEach(2, "losing_home_or_assets", [
    "אני עלול לאבד את הבית",
    "יקחו לי את הרכב",
    "I might lose my house",
    "They will take my tools"
  ]);
});

test("Level 2: workplace incidents and threats", () => {
  expectEach(2, "workplace_incident", ["העובד שלי נפגע בעבודה", "יש תלונה נגדי על הטרדה", "There was an accident at work"]);
  expectEach(2, "threats", ["הלקוח מאיים עליי", "A creditor keeps threatening me"]);
});

test("Level 2: fraud", () => {
  expectEach(2, "fraud", ["עקצו אותי בכמה אלפים", "I think I was scammed", "My bookkeeper was embezzling"]);
});

// ---------- Level 3: flag a mentor, continue carefully ----------

test("Level 3: exhaustion and burnout", () => {
  expectEach(3, "exhaustion", [
    "אני פשוט מותש",
    "אין לי כוח לכלום",
    "לא מצליחה לישון בלילות",
    "I'm completely burned out",
    "I feel overwhelmed",
    "I can't sleep"
  ]);
});

test("Level 3: hiding income, bending facts, avoiding duties to workers", () => {
  expectEach(3, "integrity", [
    "אפשר לשלם לעובד בשחור?",
    "איך אני יכול להסתיר הכנסות כדי לקבל מענק",
    "אפשר בלי חשבונית?",
    "Can I pay my workers in cash off the books?",
    "Should I just not declare that income?"
  ]);
});

// ---------- Ordinary business talk must NOT set off an alarm ----------

test("ordinary business messages give Level 0", () => {
  const ordinary = [
    "אני לא בטוח לגבי המחיר",
    "אני לא מרגיש בטוח עם ההצעה הזאת",
    "העסק עבד בלעדיי בזמן המילואים",
    "הנחה גדולה יכולה לפגוע בהכנסות",
    "יש לי עבודת פינוי פסולת מחר",
    "הלקוח רוצה ארון בשחור מט",
    "מה שמטריד אותי זה התזרים",
    "אני רוצה לפתוח קורס אונליין",
    "הספק מאיים להעלות מחירים",
    "I'm not sure about the price",
    "We have a lot of dead stock",
    "I'm dying to get back to work",
    "It hit me that my prices are too low",
    "We need to seize the opportunity before the holidays",
    "I made a courtesy call to an old customer",
    "This new skill will help",
    "The deadline for the quote is Sunday",
    "We're bleeding money on delivery fees",
    ""
  ];
  for (const text of ordinary) {
    assert.strictEqual(checkMessage(text).level, 0, `false alarm for: ${text}`);
  }
});

// ---------- How results behave ----------

test("when a message has several warnings, the most serious level wins", () => {
  const result = checkMessage("I'm exhausted, there is a court date next week, and honestly I want to die");
  assert.strictEqual(result.level, 1);
  assert.strictEqual(result.action, "stop_and_hand_off_now");
  assert.deepStrictEqual(result.categories, ["self_harm", "legal_action", "exhaustion"]);
});

test("each level comes with a plain action name", () => {
  assert.strictEqual(checkMessage("hello").action, "none");
  assert.strictEqual(checkMessage("קיבלתי מכתב התראה").action, "stop_task_and_hand_off_today");
  assert.strictEqual(checkMessage("I'm exhausted").action, "flag_mentor_and_continue_carefully");
});

test("Cover Person messages are checked the same way", () => {
  const result = checkMessage("The customer is threatening me", { from: "cover" });
  assert.strictEqual(result.level, 2);
  assert.strictEqual(result.from, "cover");
});

test("the result never contains the soldier's words", () => {
  const text = "I took pills and I am at the shop on Herzl street";
  const result = checkMessage(text);
  assert.ok(!JSON.stringify(result).includes("Herzl"));
});

// ---------- Flagging the mentor in the profile ----------

test("flagging saves level and kind of trigger, never the message", () => {
  const now = () => "2026-11-04T10:00:00Z";
  const result = checkMessage("אני חושב להתאבד", { from: "soldier" });
  const flagged = flagProfile(sampleProfile(), result, now);
  assert.strictEqual(flagged.flags.mentorEscalation, true);
  assert.strictEqual(flagged.flags.escalationReason,
    "Level 1: Self-harm, not wanting to live, or feeling hopeless or unsafe (2026-11-04, from soldier)");
  assert.ok(!flagged.flags.escalationReason.includes("להתאבד"));
  assert.deepStrictEqual(validator.validateProfile(flagged, schema).errors, []);
});

test("a less serious flag never replaces a more serious one", () => {
  const now = () => "2026-11-04T10:00:00Z";
  const one = flagProfile(sampleProfile(), checkMessage("I want to die"), now);
  const after = flagProfile(one, checkMessage("I'm exhausted"), now);
  assert.match(after.flags.escalationReason, /^Level 1/);
  const three = flagProfile(sampleProfile(), checkMessage("I'm exhausted"), now);
  const raised = flagProfile(three, checkMessage("I got a lawyer's letter"), now);
  assert.match(raised.flags.escalationReason, /^Level 2/);
});

test("flagging does not change the profile it was given, and Level 0 changes nothing", () => {
  const p = sampleProfile();
  const before = JSON.stringify(p);
  flagProfile(p, checkMessage("I want to die"));
  assert.strictEqual(JSON.stringify(p), before);
  assert.strictEqual(JSON.stringify(flagProfile(p, checkMessage("hello"))), before);
});

// ---------- The phrase list itself ----------

test("the phrase list is sensible: levels 1 to 3, no duplicates, nothing too short", () => {
  const seen = new Set();
  for (const cat of phrases.categories) {
    assert.ok([1, 2, 3].includes(cat.level), cat.category);
    for (const phrase of [...cat.he, ...cat.en]) {
      assert.ok(phrase.replace("*", "").length >= 3, `too short: ${phrase}`);
      assert.ok(!seen.has(phrase), `listed twice: ${phrase}`);
      seen.add(phrase);
    }
  }
});

test("app/js/escalation-phrases.js matches reference/escalation-phrases.json (run npm run build:data if this fails)", () => {
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "reference", "escalation-phrases.json"), "utf8"));
  assert.deepStrictEqual(phrases, original);
});
