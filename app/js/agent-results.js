// Saves the structured answers from Claude (findings, plan, check-in) into the
// Recovery Profile, after the soldier confirms them. Claude's answer shape
// cannot carry "at most three", so the limits are enforced here
// (CLAUDE.md rule 7), and anything malformed is dropped rather than saved.
//
// Works in the browser (window.MomentumAgentResults) and in Node tests (require).
(function (root) {
  "use strict";

  var isNode = typeof module === "object" && module.exports;
  var Paths = isNode ? require("./profile-paths.js") : root.MomentumPaths;
  var Esc = isNode ? require("./escalation.js") : root.MomentumEscalation;
  var Acc = isNode ? require("./accountability.js") : root.MomentumAccountability;

  var LIMIT = 3;
  var MAX_ACTIONS_PER_PRIORITY = 4;
  var CONFIDENCE = ["low", "medium", "high"];

  function text(v) { return typeof v === "string" ? v.trim() : ""; }
  function list(v) { return Array.isArray(v) ? v : []; }

  function validDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(v));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
  }

  function businessIndex(profile, businessId) {
    var bs = profile.businesses || [];
    for (var i = 0; i < bs.length; i++) if (bs[i].id === businessId) return i;
    throw new Error("No business with id " + businessId);
  }

  // "none" -> 0, "1".."3" -> 1..3
  function escalationLevel(result) {
    var n = Number(result && result.escalation);
    return n >= 1 && n <= 3 ? n : 0;
  }

  // When Claude's answer says a mentor is needed, set the shared flag (never
  // lowering a more serious one). The reason is Claude's short neutral line.
  function flagFromResult(profile, result, now) {
    var level = escalationLevel(result);
    if (!level) return Paths.copy(profile);
    var label = text(result.escalationReason) || "Flagged by the agent";
    return Esc.flagProfile(profile, { level: level, label: label, from: "soldier" }, now);
  }

  function cleanProblems(problems) {
    return list(problems).filter(function (p) { return p && text(p.problem); }).slice(0, LIMIT).map(function (p) {
      return {
        problem: text(p.problem),
        evidence: text(p.evidence),
        confidence: CONFIDENCE.indexOf(p.confidence) !== -1 ? p.confidence : "low",
        urgent: p.urgent === true
      };
    });
  }

  function applyFindings(profile, businessId, result, nowIso) {
    var p = Paths.copy(profile);
    var b = p.businesses[businessIndex(p, businessId)];
    b.diagnosis = {
      completedAt: nowIso,
      topProblems: cleanProblems(result.topProblems),
      unknowns: list(result.unknowns).map(text).filter(Boolean)
    };
    return p;
  }

  function cleanPriorities(priorities) {
    return list(priorities).filter(function (pr) { return pr && text(pr.goal); }).slice(0, LIMIT).map(function (pr) {
      var actions = list(pr.actions).filter(function (a) { return a && text(a.action); })
        .slice(0, MAX_ACTIONS_PER_PRIORITY).map(function (a) {
          var out = { action: text(a.action), status: "not_started" };
          var due = validDate(a.dueDate);
          if (due) out.dueDate = due;
          return out;
        });
      var out = { goal: text(pr.goal), actions: actions };
      if (text(pr.successMeasure)) out.successMeasure = text(pr.successMeasure);
      return out;
    });
  }

  function applyPlan(profile, businessId, result) {
    var p = Paths.copy(profile);
    var b = p.businesses[businessIndex(p, businessId)];
    b.plan = {
      summary: text(result.summary),
      priorities: cleanPriorities(result.priorities),
      openQuestions: list(result.openQuestions).map(text).filter(Boolean)
    };
    return p;
  }

  // reports: [{ ref: { businessId, priority, index }, action, status, note }]
  // Returns { ok, profile } (see Accountability.recordCheckIn).
  function applyCheckIn(profile, reports, result, today) {
    var p = Paths.copy(profile);
    list(reports).forEach(function (r) {
      if (r.status && Acc.STATUSES.indexOf(r.status) !== -1) p = Acc.setStatus(p, r.ref, r.status, r.note);
    });
    var known = (p.businesses || []).map(function (b) { return b.id; });
    var next = list(result.nextActions).filter(function (a) {
      return a && text(a.action) && known.indexOf(a.businessId) !== -1;
    }).slice(0, LIMIT).map(function (a) {
      var due = validDate(a.dueDate);
      return text(a.action) + (due ? " (" + due + ")" : "");
    });
    var recorded = Acc.recordCheckIn(p, {
      date: today,
      answeredBy: "soldier",
      done: list(reports).filter(function (r) { return r.status === "done"; }).map(function (r) { return r.action; }),
      blockers: list(reports).filter(function (r) { return r.status === "blocked"; }).map(function (r) { return r.action; }),
      nextActions: next,
      result: text(result.summary)
    });
    if (!recorded.ok) return recorded;
    return { ok: true, profile: Acc.flagIfBlockedTwice(recorded.profile) };
  }

  var TOPICS = ["pricing", "cash_flow_debt", "customer_acquisition", "customer_followup", "benefits_grants", "staff", "time_capacity"];

  // Adds what a topic conversation produced to the business: summary and at
  // most three actions, which then appear in the weekly check-in.
  function applyTopic(profile, businessId, topic, result, today) {
    if (TOPICS.indexOf(topic) === -1) throw new Error("Unknown topic: " + topic);
    var p = Paths.copy(profile);
    var b = p.businesses[businessIndex(p, businessId)];
    var actions = list(result.actions).filter(function (a) { return a && text(a.action); }).slice(0, LIMIT).map(function (a) {
      var out = { action: text(a.action), status: "not_started" };
      var due = validDate(a.dueDate);
      if (due) out.dueDate = due;
      return out;
    });
    b.topicWork = (b.topicWork || []).concat([{ topic: topic, date: today, summary: text(result.summary), actions: actions }]);
    return p;
  }

  var api = {
    applyTopic: applyTopic,
    escalationLevel: escalationLevel, flagFromResult: flagFromResult,
    applyFindings: applyFindings, applyPlan: applyPlan, applyCheckIn: applyCheckIn
  };
  if (isNode) module.exports = api;
  else root.MomentumAgentResults = api;
})(this);
