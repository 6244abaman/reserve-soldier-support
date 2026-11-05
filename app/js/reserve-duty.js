// Reserve duty mode (agents/accountability.md, "Reserve duty mode"; CLAUDE.md rule 5).
//   startCallUp     the soldier marks a call-up: the plan freezes and nudges pause
//   markReturn      the soldier is back: nudges restart, the Cover Person's access
//                   ends, and the app asks "pick up, new plan, or fresh look?"
//   pickUp          carry on: open actions move later by the days away, so
//                   nothing counts as late because of reserve duty
//   finishReturn    the soldier chose a new plan or a fresh look
//   longAbsence     21 days or more away (a product choice in the blueprint):
//                   the app suggests a fresh look at the numbers
// Every function returns a new profile and never changes the one it is given.
//
// Works in the browser (window.MomentumReserveDuty) and in Node tests (require).
(function (root) {
  "use strict";

  var isNode = typeof module === "object" && module.exports;
  var Paths = isNode ? require("./profile-paths.js") : root.MomentumPaths;

  var LONG_ABSENCE_DAYS = 21;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function isDate(s) { return typeof s === "string" && DATE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")); }

  function days(from, to) {
    return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
  }

  function addDays(date, n) {
    return new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  }

  function onDuty(profile) { return Boolean(profile && profile.service && profile.service.status === "called_up"); }
  function expecting(profile) { return Boolean(profile && profile.service && profile.service.status === "expecting_call_up"); }
  function awaitingReturn(profile) { return Boolean(profile && profile.flags && profile.flags.awaitingReturnChoice); }

  // The planned end date has passed but the soldier has not marked the return yet.
  function endPassed(profile, today) {
    var end = onDuty(profile) && profile.service.callUpEnd;
    return Boolean(end && today > end);
  }

  // Days away in the last call-up (0 when the dates are not known).
  function absenceDays(profile) {
    var s = (profile && profile.service) || {};
    return isDate(s.callUpStart) && isDate(s.callUpEnd) ? Math.max(0, days(s.callUpStart, s.callUpEnd)) : 0;
  }

  function longAbsence(profile) { return absenceDays(profile) >= LONG_ABSENCE_DAYS; }

  // input: { start, end (optional), lightMessage (true / false) }, today: "YYYY-MM-DD"
  // Returns { ok, profile } or { ok: false, error: "errStart" | "errEnd" }.
  function startCallUp(profile, input, today) {
    var start = input.start || today;
    var end = input.end || null;
    if (!isDate(start)) return { ok: false, error: "errStart" };
    if (end && (!isDate(end) || end < start)) return { ok: false, error: "errEnd" };
    var p = Paths.copy(profile);
    p.service = p.service || {};
    p.service.status = "called_up";
    p.service.callUpStart = start;
    if (end) p.service.callUpEnd = end; else delete p.service.callUpEnd;
    p.flags = p.flags || {};
    p.flags.nudgesPaused = true;
    p.flags.lightMessageOptIn = Boolean(input.lightMessage);
    delete p.flags.lightMessageSentAt;      // at most one light message per call-up
    delete p.flags.awaitingReturnChoice;
    return { ok: true, profile: p };
  }

  function setLightMessage(profile, on) {
    var p = Paths.copy(profile);
    p.flags = p.flags || {};
    p.flags.lightMessageOptIn = Boolean(on);
    return p;
  }

  // The soldier is back today. The return date is the real one, even if the
  // planned end was later. Silence during the call-up never counts.
  function markReturn(profile, today) {
    var p = Paths.copy(profile);
    p.service = p.service || {};
    p.service.status = "home";
    if (!isDate(p.service.callUpStart) || p.service.callUpStart > today) p.service.callUpStart = today;
    p.service.callUpEnd = today;
    p.flags = p.flags || {};
    p.flags.nudgesPaused = false;
    p.flags.missedCheckIns = 0;
    p.flags.awaitingReturnChoice = true;
    // CLAUDE.md rule 4: the Cover Person's access ends after the return date.
    if (p.cover && p.cover.active && (!p.cover.accessEndDate || p.cover.accessEndDate > today)) {
      p.cover.accessEndDate = today;
    }
    return p;
  }

  // Carry on with the same plan. Open actions due on or after the call-up
  // started move later by the days away.
  function pickUp(profile) {
    var p = finishReturn(profile);
    var start = p.service && p.service.callUpStart;
    var shift = absenceDays(p);
    if (!isDate(start) || shift <= 0) return p;
    function move(a) {
      if (!a || a.status === "done" || a.status === "dropped" || !isDate(a.dueDate) || a.dueDate < start) return;
      a.dueDate = addDays(a.dueDate, shift);
    }
    (p.businesses || []).forEach(function (b) {
      ((b.plan && b.plan.priorities) || []).forEach(function (pr) { (pr.actions || []).forEach(move); });
      (b.topicWork || []).forEach(function (tw) { (tw.actions || []).forEach(move); });
    });
    return p;
  }

  function finishReturn(profile) {
    var p = Paths.copy(profile);
    if (p.flags) delete p.flags.awaitingReturnChoice;
    return p;
  }

  var api = {
    LONG_ABSENCE_DAYS: LONG_ABSENCE_DAYS,
    onDuty: onDuty, expecting: expecting, awaitingReturn: awaitingReturn, endPassed: endPassed,
    absenceDays: absenceDays, longAbsence: longAbsence,
    startCallUp: startCallUp, setLightMessage: setLightMessage, markReturn: markReturn,
    pickUp: pickUp, finishReturn: finishReturn, addDays: addDays
  };
  if (isNode) module.exports = api;
  else root.MomentumReserveDuty = api;
})(this);
