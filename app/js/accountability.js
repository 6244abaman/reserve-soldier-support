// The weekly tracker behind the Accountability agent (agents/accountability.md).
// Keeps action statuses (done, in progress, blocked, dropped, with a note) for
// plan actions and topic actions, picks at most THREE actions for the week
// across ALL businesses and topics (CLAUDE.md
// rule 7), records check-ins, and notices when the same action has been
// blocked two weeks in a row, which flags a mentor (escalation Level 3).
//
// The check-in conversation itself needs Claude and comes in Phase 6b.
// Reserve duty pauses come in Phase 7.
//
// Works in the browser (window.MomentumAccountability) and in Node tests (require).
(function (root) {
  "use strict";

  var isNode = typeof module === "object" && module.exports;
  var Paths = isNode ? require("./profile-paths.js") : root.MomentumPaths;
  var Esc = isNode ? require("./escalation.js") : root.MomentumEscalation;

  var WEEKLY_LIMIT = 3;
  var STATUSES = ["not_started", "in_progress", "done", "blocked", "dropped"];
  var BLOCKED_TWICE_LABEL = "The same action was blocked two weeks in a row";

  // Every action still open, in every business's plan and topic work.
  // Each item: { businessId, businessName, source: "plan" | "topic",
  //              priority (plan) or topic (topicWork index), index, action, dueDate, status }
  function openActions(profile) {
    var out = [];
    function add(b, a, ref) {
      var status = a.status || "not_started";
      if (status === "done" || status === "dropped") return;
      out.push(Object.assign({ businessId: b.id, businessName: b.name || "" }, ref,
        { action: a.action || "", dueDate: a.dueDate || null, status: status }));
    }
    (profile.businesses || []).forEach(function (b) {
      ((b.plan && b.plan.priorities) || []).forEach(function (pr, pi) {
        (pr.actions || []).forEach(function (a, ai) { add(b, a, { source: "plan", priority: pi, index: ai }); });
      });
      (b.topicWork || []).forEach(function (tw, ti) {
        (tw.actions || []).forEach(function (a, ai) { add(b, a, { source: "topic", topic: ti, topicName: tw.topic, index: ai }); });
      });
    });
    return out;
  }

  // The actions for this week: at most three in total, across all businesses.
  // Earliest due date first; actions without a date come last; ties keep plan order.
  function weeklyActions(profile) {
    var list = openActions(profile).map(function (a, i) { return { a: a, i: i }; });
    list.sort(function (x, y) {
      var dx = x.a.dueDate || "9999-12-31";
      var dy = y.a.dueDate || "9999-12-31";
      return dx < dy ? -1 : dx > dy ? 1 : x.i - y.i;
    });
    return list.slice(0, WEEKLY_LIMIT).map(function (x) { return x.a; });
  }

  // ref: { businessId, source, priority or topic, index } (source defaults to "plan").
  // Returns a new profile.
  function setStatus(profile, ref, status, note) {
    if (STATUSES.indexOf(status) === -1) throw new Error("Unknown status: " + status);
    var p = Paths.copy(profile);
    var b = (p.businesses || []).filter(function (x) { return x.id === ref.businessId; })[0];
    var holder = !b ? null
      : ref.source === "topic" ? (b.topicWork || [])[ref.topic]
      : b.plan && b.plan.priorities && b.plan.priorities[ref.priority];
    var action = holder && holder.actions && holder.actions[ref.index];
    if (!action) throw new Error("No such action");
    action.status = status;
    if (note != null && String(note).trim()) action.note = String(note).trim();
    return p;
  }

  // checkIn: { date, answeredBy, done: [], blockers: [], nextActions: [], result }
  // Returns { ok, profile } or { ok: false, error } when there are more than three next actions.
  function recordCheckIn(profile, checkIn) {
    var next = checkIn.nextActions || [];
    if (next.length > WEEKLY_LIMIT) {
      return { ok: false, error: "At most " + WEEKLY_LIMIT + " actions for the coming week, across all businesses." };
    }
    var p = Paths.copy(profile);
    var entry = { date: checkIn.date, answeredBy: checkIn.answeredBy === "cover" ? "cover" : "soldier",
      done: checkIn.done || [], blockers: checkIn.blockers || [], nextActions: next };
    if (checkIn.result) entry.result = checkIn.result;
    p.checkIns = (p.checkIns || []).concat([entry]);
    return { ok: true, profile: p };
  }

  // Actions named as blockers in both of the last two check-ins.
  function blockedTwice(profile) {
    var list = profile.checkIns || [];
    if (list.length < 2) return [];
    var last = list[list.length - 1].blockers || [];
    var before = (list[list.length - 2].blockers || []).map(normal);
    return last.filter(function (b) { return before.indexOf(normal(b)) !== -1; });
  }

  function normal(text) { return String(text).trim().toLowerCase().replace(/\s+/g, " "); }

  // If an action was blocked two weeks in a row, flag the mentor (Level 3)
  // using the shared flag, so a more serious flag is never replaced.
  function flagIfBlockedTwice(profile, now) {
    if (blockedTwice(profile).length === 0) return Paths.copy(profile);
    return Esc.flagProfile(profile, { level: 3, label: BLOCKED_TWICE_LABEL, from: "soldier" }, now);
  }

  var api = {
    WEEKLY_LIMIT: WEEKLY_LIMIT, STATUSES: STATUSES,
    openActions: openActions, weeklyActions: weeklyActions, setStatus: setStatus,
    recordCheckIn: recordCheckIn, blockedTwice: blockedTwice, flagIfBlockedTwice: flagIfBlockedTwice
  };
  if (isNode) module.exports = api;
  else root.MomentumAccountability = api;
})(this);
