// The Business Diagnostic form (agents/diagnostic.md): all questions for one
// business at once, in short sections, prefilled from what Intake already
// knows so nothing is asked twice. Every question is skippable; skipped
// answers are marked missing and listed in diagnosis.unknowns.
//
// This file holds the questions and how answers are saved. Working out the
// findings (the top three problems) needs Claude and comes in Phase 6b.
//
// Works in the browser (window.MomentumDiagnosticForm) and in Node tests (require).
(function (root) {
  "use strict";

  var Paths = typeof module === "object" && module.exports ? require("./profile-paths.js") : root.MomentumPaths;

  var SECTIONS = ["cash", "debts", "customers", "pricing", "capacity", "benefits"];

  var SOURCES = ["referrals", "returning", "social", "google", "groups", "marketplace", "walk_in", "ads", "other"];
  var METHODS = ["per_job", "hourly", "per_item", "package", "other"];

  // Paths are relative to the business: "numbers.cashOnHand" -> businesses[i].numbers.cashOnHand
  var FIELDS = [
    { id: "monthlyRevenueBefore", section: "cash", type: "number", money: true, estimate: true, path: "numbers.monthlyRevenueBefore" },
    { id: "monthlyRevenueNow", section: "cash", type: "number", money: true, estimate: true, path: "numbers.monthlyRevenueNow" },
    { id: "fixedMonthlyCosts", section: "cash", type: "number", money: true, estimate: true, path: "numbers.fixedMonthlyCosts" },
    { id: "cashOnHand", section: "cash", type: "number", money: true, estimate: true, path: "numbers.cashOnHand" },
    { id: "monthsOfCashLeft", section: "cash", type: "number", estimate: true, path: "numbers.monthsOfCashLeft" },
    { id: "debts", section: "debts", type: "debts", path: "numbers.debts" },
    { id: "regularCount", section: "customers", type: "number", estimate: true, path: "customers.regularCount" },
    { id: "lostDuringService", section: "customers", type: "number", estimate: true, path: "customers.lostDuringService" },
    { id: "sources", section: "customers", type: "multi", options: SOURCES, path: "customers.sources" },
    { id: "method", section: "pricing", type: "choice", options: METHODS, path: "pricing.method" },
    { id: "marginPercent", section: "pricing", type: "number", percent: true, estimate: true, path: "pricing.marginPercent" },
    { id: "hoursPerWeek", section: "capacity", type: "number", estimate: true, path: "capacity.hoursPerWeek" },
    { id: "whoRunsItWhenAway", section: "capacity", type: "text", path: "capacity.whoRunsItWhenAway" },
    { id: "employees", section: "capacity", type: "number", estimate: true, path: "employees" },
    { id: "otherHelpers", section: "capacity", type: "text", path: "capacity.otherHelpers" },
    { id: "equipmentOrStockProblems", section: "capacity", type: "longtext", path: "capacity.equipmentOrStockProblems" },
    { id: "benefitsUsed", section: "benefits", type: "lines", path: "benefitsUsed" }
  ];

  function indexOf(profile, businessId) {
    var list = profile.businesses || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === businessId) return i;
    return -1;
  }

  function fullPath(biz, field) { return "businesses[" + biz + "]." + field.path; }

  // What to show in the form now: { id: { value, estimated } }.
  function prefill(profile, businessId) {
    var biz = indexOf(profile, businessId);
    var out = {};
    FIELDS.forEach(function (f) {
      var path = fullPath(biz, f);
      var value = Paths.getPath(profile, path);
      out[f.id] = { value: value === undefined ? null : Paths.copy(value === undefined ? null : value), estimated: Paths.markOf(profile, path) === "estimated" };
    });
    return out;
  }

  // Checks typed answers. Returns { fieldId: "errNumber" | "errPercent" } for problems.
  function check(answers) {
    var errors = {};
    FIELDS.forEach(function (f) {
      var a = answers[f.id];
      if (f.type !== "number" || !a || a.value == null || a.value === "") return;
      var n = typeof a.value === "number" ? a.value : Paths.parseNumber(a.value);
      if (n === null) errors[f.id] = "errNumber";
      else if (f.percent && n > 100) errors[f.id] = "errPercent";
    });
    (answers.debts && answers.debts.value || []).forEach(function (d, i) {
      if (d.amount != null && d.amount !== "" && typeof d.amount !== "number" && Paths.parseNumber(d.amount) === null) {
        errors["debts." + i] = "errNumber";
      }
    });
    return errors;
  }

  function isEmpty(f, a) {
    if (!a || a.value == null || a.value === "") return true;
    if (f.type === "multi" && a.value.length === 0) return true;
    if (f.type === "lines" && !a.value.some(function (s) { return String(s).trim(); })) return true;
    return false;
  }

  function cleanDebt(d) {
    var out = {};
    if (d.type) out.type = String(d.type).trim();
    var amount = typeof d.amount === "number" ? d.amount : Paths.parseNumber(d.amount);
    if (amount !== null && amount !== undefined) out.amount = amount;
    out.overdue = Boolean(d.overdue);
    if (d.deadline) out.deadline = d.deadline;
    return out;
  }

  // answers: { fieldId: { value, estimate } }. For debts, value is a list of
  // { type, amount, overdue, deadline } and noDebts: true means "no debts".
  // Returns a new profile with the answers saved and diagnosis.unknowns listing
  // what was skipped. Findings are cleared, so they are worked out afresh.
  function apply(profile, businessId, answers) {
    var p = Paths.copy(profile);
    var biz = indexOf(p, businessId);
    if (biz === -1) throw new Error("No business with id " + businessId);
    var unknowns = [];

    FIELDS.forEach(function (f) {
      var path = fullPath(biz, f);
      var a = answers[f.id];

      if (f.type === "debts") {
        var rows = ((a && a.value) || []).map(cleanDebt).filter(function (d) { return d.type || d.amount != null; });
        if (rows.length) { Paths.setPath(p, path, rows); Paths.mark(p, path, null); }
        else if (a && a.noDebts) { Paths.setPath(p, path, []); Paths.mark(p, path, null); }
        else { Paths.deletePath(p, path); Paths.mark(p, path, "missing"); unknowns.push(f.id); }
        return;
      }

      if (isEmpty(f, a)) {
        Paths.deletePath(p, path);
        Paths.mark(p, path, "missing");
        unknowns.push(f.id);
        return;
      }

      var value = a.value;
      if (f.type === "number" && typeof value !== "number") value = Paths.parseNumber(value);
      if (f.type === "text" || f.type === "longtext") value = String(value).trim();
      if (f.type === "lines") value = value.map(function (s) { return String(s).trim(); }).filter(Boolean);
      Paths.setPath(p, path, value);
      Paths.mark(p, path, f.estimate && a.estimate ? "estimated" : null);
    });

    p.businesses[biz].diagnosis = { unknowns: unknowns };
    return p;
  }

  // All the words the soldier typed, so the shared escalation check can read them.
  function typedText(answers) {
    var parts = [];
    FIELDS.forEach(function (f) {
      var a = answers[f.id];
      if (!a || a.value == null) return;
      if (f.type === "text" || f.type === "longtext") parts.push(a.value);
      if (f.type === "lines") parts.push(a.value.join("\n"));
      if (f.type === "debts") a.value.forEach(function (d) { if (d.type) parts.push(d.type); });
    });
    return parts.join("\n");
  }

  // The form was sent but Claude has not worked out the findings yet.
  function awaitingFindings(business) {
    return Boolean(business && business.diagnosis && !business.diagnosis.completedAt);
  }

  var api = {
    SECTIONS: SECTIONS, FIELDS: FIELDS, SOURCES: SOURCES, METHODS: METHODS,
    prefill: prefill, check: check, apply: apply, typedText: typedText, awaitingFindings: awaitingFindings
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumDiagnosticForm = api;
})(this);
