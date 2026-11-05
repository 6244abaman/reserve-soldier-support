// Tests for the module chat helpers (app/js/module-chat.js).
const test = require("node:test");
const assert = require("node:assert");
const Chat = require("../app/js/module-chat.js");

test("a plain reply becomes paragraphs; lines without a blank line between them join", () => {
  assert.deepStrictEqual(Chat.parseReply("First line\nstill first.\n\nSecond."), [
    { type: "p", text: "First line still first." },
    { type: "p", text: "Second." }
  ]);
});

test("bullet and numbered lists become lists, and markup is removed", () => {
  const blocks = Chat.parseReply("## Your numbers\n- **Floor:** 900 ₪ (stated)\n- Target: 1,150 ₪ (estimated)\n\n1. Quote the next job\n2) Ask for a deposit");
  assert.deepStrictEqual(blocks, [
    { type: "p", text: "Your numbers" },
    { type: "ul", items: ["Floor: 900 ₪ (stated)", "Target: 1,150 ₪ (estimated)"] },
    { type: "ol", items: ["Quote the next job", "Ask for a deposit"] }
  ]);
});

test("Hebrew text passes through unchanged", () => {
  assert.deepStrictEqual(Chat.parseReply("שלום.\n- מחיר רצפה: 900 ₪"), [
    { type: "p", text: "שלום." },
    { type: "ul", items: ["מחיר רצפה: 900 ₪"] }
  ]);
});

test("empty or missing replies give no blocks", () => {
  assert.deepStrictEqual(Chat.parseReply(""), []);
  assert.deepStrictEqual(Chat.parseReply(null), []);
});

test("a long conversation is trimmed to the proxy's limit and still starts with the soldier", () => {
  const list = [];
  for (let i = 0; i < 45; i++) list.push({ role: i % 2 ? "assistant" : "user", content: "m" + i });
  const sent = Chat.forSending(list);
  assert.ok(sent.length <= Chat.MAX_MESSAGES);
  assert.strictEqual(sent[0].role, "user");
  assert.strictEqual(sent[sent.length - 1].content, "m44");
});

test("messages over the proxy's size limit are caught before sending", () => {
  assert.strictEqual(Chat.tooLong("x".repeat(Chat.MAX_CHARS)), false);
  assert.strictEqual(Chat.tooLong("x".repeat(Chat.MAX_CHARS + 1)), true);
});

test("the chat's limits match the proxy's", () => {
  const { LIMITS } = require("../proxy/limits.js");
  assert.strictEqual(Chat.MAX_MESSAGES, LIMITS.maxMessages);
  assert.strictEqual(Chat.MAX_CHARS, LIMITS.maxMessageChars);
});
