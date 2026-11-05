// The parts of a module chat that do not touch the screen, so they can be tested in Node:
//   parseReply(text)    turns Claude's plain-text reply into paragraphs and lists
//   forSending(list)    keeps the conversation inside the proxy's limits
//   tooLong(text)       a message the proxy would refuse as too long
// Works in the browser (window.MomentumModuleChat) and in Node tests (require).
(function (root) {
  "use strict";

  // The same limits as proxy/limits.js.
  var MAX_MESSAGES = 40;
  var MAX_CHARS = 4000;

  // Removes markup Claude may still add (bold, headings), so the text reads cleanly.
  function clean(line) {
    return line.replace(/^#{1,6}\s+/, "").replace(/\*\*|__/g, "").replace(/`/g, "").trim();
  }

  // Returns blocks: { type: "p", text } or { type: "ul" | "ol", items: [text] }.
  function parseReply(text) {
    var blocks = [];
    var current = null;
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var line = raw.trim();
      if (!line) { current = null; return; }
      var bullet = /^[-*•]\s+(.*)$/.exec(line);
      var number = /^\d+[.)]\s+(.*)$/.exec(line);
      var type = bullet ? "ul" : number ? "ol" : "p";
      var body = clean(bullet ? bullet[1] : number ? number[1] : line);
      if (!body) return;
      if (type === "p") {
        if (current && current.type === "p") current.text += " " + body;
        else { current = { type: "p", text: body }; blocks.push(current); }
        return;
      }
      if (!current || current.type !== type) { current = { type: type, items: [] }; blocks.push(current); }
      current.items.push(body);
    });
    return blocks;
  }

  // The newest messages that fit, always starting with the soldier.
  function forSending(messages) {
    var list = messages.slice(-MAX_MESSAGES);
    while (list.length && list[0].role !== "user") list.shift();
    return list;
  }

  function tooLong(text) { return String(text || "").length > MAX_CHARS; }

  var api = { parseReply: parseReply, forSending: forSending, tooLong: tooLong, MAX_CHARS: MAX_CHARS, MAX_MESSAGES: MAX_MESSAGES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumModuleChat = api;
})(this);
