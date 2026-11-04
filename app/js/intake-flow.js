// The Intake questions and how each answer is written into the Recovery Profile.
// Follows agents/intake.md: one question at a time, every question skippable
// (except the phone number, which is how the profile is saved), person and
// service once, then each business, asking "another business?" until no.
//
// Intake never asks about service experiences, combat, or anything medical:
// only the general role, reserve days, and call-up status.
//
// Numbers can be marked as estimates, and skipped questions are marked missing,
// in meta.unconfirmedFields as "path:estimated" or "path:missing" (CLAUDE.md rule 6).
//
// The question wording lives in app/i18n (q.<id>.label, q.<id>.hint); this file
// holds only the order, the answer type, and where the answer is saved.
//
// Works in the browser (window.MomentumIntakeFlow) and in Node tests (require).
(function (root) {
  "use strict";

  var SECTORS = [
    "trades_construction", "food_hospitality", "retail_ecommerce", "professional_services",
    "tech_creative", "health_personal_care", "transport_logistics", "other"
  ];

  // step: 1 About you, 2 Reserve service, 3 Your businesses, 4 Goals.
  // A "#" in a path is replaced by the business number (0, 1, 2...).
  var QUESTIONS = [
    { id: "firstName", step: 1, type: "text", path: "person.firstName", autocomplete: "given-name" },
    { id: "phone", step: 1, type: "phone", path: "person.phone", required: true },
    { id: "city", step: 1, type: "text", path: "person.city", autocomplete: "address-level2" },
    { id: "family", step: 1, type: "choice", path: "person.familySituation",
      options: ["single", "partner", "partner_children", "single_parent"] },

    { id: "role", step: 2, type: "text", path: "service.roleGeneral" },
    { id: "reserveDays", step: 2, type: "number", path: "service.reserveDaysLastTwoYears", estimate: true },
    { id: "status", step: 2, type: "choice", path: "service.status",
      options: ["home", "called_up", "expecting_call_up"] },
    { id: "callUpDates", step: 2, type: "dates", paths: ["service.callUpStart", "service.callUpEnd"],
      when: function (p) { return p.service && (p.service.status === "called_up" || p.service.status === "expecting_call_up"); } },

    { id: "bizName", step: 3, business: true, type: "text", path: "businesses[#].name" },
    { id: "bizDescription", step: 3, business: true, type: "longtext", path: "businesses[#].description" },
    { id: "bizSector", step: 3, business: true, type: "choice", path: "businesses[#].sector", options: SECTORS },
    { id: "bizYears", step: 3, business: true, type: "number", path: "businesses[#].yearsOperating", estimate: true },
    { id: "bizEmployees", step: 3, business: true, type: "number", path: "businesses[#].employees", estimate: true },
    { id: "bizRevenueBefore", step: 3, business: true, type: "number", money: true, estimate: true,
      path: "businesses[#].numbers.monthlyRevenueBefore" },
    { id: "bizRevenueNow", step: 3, business: true, type: "number", money: true, estimate: true,
      path: "businesses[#].numbers.monthlyRevenueNow" },
    { id: "bizFixedCosts", step: 3, business: true, type: "number", money: true, estimate: true,
      path: "businesses[#].numbers.fixedMonthlyCosts" },
    { id: "bizHasDebt", step: 3, business: true, type: "choice", options: ["no", "yes"], path: "businesses[#].numbers.debts" },
    { id: "bizDebtAmount", step: 3, business: true, type: "number", money: true, estimate: true,
      path: "businesses[#].numbers.debts[0].amount", when: hasDebt },
    { id: "bizDebtOverdue", step: 3, business: true, type: "choice", options: ["yes", "no"],
      path: "businesses[#].numbers.debts[0].overdue", when: hasDebt },
    { id: "bizCustomers", step: 3, business: true, type: "number", estimate: true, path: "businesses[#].customers.regularCount" },
    { id: "bizPain", step: 3, business: true, type: "longtext", path: "businesses[#].biggestPain" },
    { id: "another", step: 3, business: true, type: "choice", options: ["yes", "no"] },

    { id: "goal", step: 4, type: "longtext", path: "goals.threeMonthOutcome" }
  ];

  var BY_ID = {};
  QUESTIONS.forEach(function (q) { BY_ID[q.id] = q; });

  function hasDebt(profile, biz) {
    var b = profile.businesses && profile.businesses[biz];
    return Boolean(b && b.numbers && b.numbers.debts && b.numbers.debts.length > 0);
  }

  var Paths = typeof module === "object" && module.exports ? require("./profile-paths.js") : root.MomentumPaths;
  var copy = Paths.copy, getPath = Paths.getPath, setPath = Paths.setPath, deletePath = Paths.deletePath;
  var pathFor = Paths.pathFor, mark = Paths.mark, markOf = Paths.markOf, parseNumber = Paths.parseNumber;

  // ---------- the order of questions ----------

  function newProfile(language, makeId) {
    var id = makeId ? makeId() : "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return {
      meta: { profileId: id, language: language === "en" ? "en" : "he", intakeComplete: false, unconfirmedFields: [] },
      person: {},
      service: {},
      businesses: []
    };
  }

  // The full list of screens for this profile, in order, ending with the summary.
  // Each item is { id, biz } (biz is the business number, or null).
  function sequence(profile) {
    var list = [];
    var count = Math.max(1, (profile.businesses || []).length);
    QUESTIONS.forEach(function (q) {
      if (q.business || q.step === 4) return;
      if (!q.when || q.when(profile)) list.push({ id: q.id, biz: null });
    });
    for (var b = 0; b < count; b++) {
      QUESTIONS.forEach(function (q) {
        if (!q.business) return;
        if (!q.when || q.when(profile, b)) list.push({ id: q.id, biz: b });
      });
    }
    list.push({ id: "goal", biz: null });
    list.push({ id: "summary", biz: null });
    return list;
  }

  function indexOf(profile, pos) {
    var list = sequence(profile);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === pos.id && list[i].biz === pos.biz) return i;
    }
    return -1;
  }

  function first() { return { id: QUESTIONS[0].id, biz: null }; }

  function next(profile, pos) {
    var list = sequence(profile);
    var i = indexOf(profile, pos);
    return i === -1 ? list[0] : list[Math.min(i + 1, list.length - 1)];
  }

  function previous(profile, pos) {
    var list = sequence(profile);
    var i = indexOf(profile, pos);
    return i <= 0 ? null : list[i - 1];
  }

  // ---------- writing an answer ----------

  function ensureBusiness(profile, biz) {
    profile.businesses = profile.businesses || [];
    while (profile.businesses.length <= biz) {
      var n = profile.businesses.length;
      profile.businesses.push({ id: "b-" + (n + 1), name: "", sector: "other" });
      mark(profile, "businesses[" + n + "].sector", "missing");
    }
  }

  // answer is { skip: true } or { value, estimate }.
  // Returns a new profile; the one passed in is not changed.
  function applyAnswer(profile, pos, answer) {
    var p = copy(profile);
    var q = BY_ID[pos.id];
    if (!q) return p;
    if (q.business) ensureBusiness(p, pos.biz);

    if (q.id === "another") {
      // "Yes" adds the next business. "No" never deletes businesses already entered.
      if (!answer.skip && answer.value === "yes") ensureBusiness(p, pos.biz + 1);
      return p;
    }

    if (q.type === "dates") {
      q.paths.forEach(function (path, i) {
        var v = answer.skip ? null : (answer.value || [])[i];
        if (v) { setPath(p, path, v); mark(p, path, null); }
        else { deletePath(p, path); mark(p, path, "missing"); }
      });
      return p;
    }

    var path = pathFor(q.path, pos.biz);

    if (q.id === "bizHasDebt") {
      if (answer.skip) { deletePath(p, path); mark(p, path, "missing"); }
      else if (answer.value === "no") { setPath(p, path, []); mark(p, path, null); }
      else {
        var debts = getPath(p, path);
        setPath(p, path, debts && debts.length ? debts : [{ type: "total" }]);
        mark(p, path, null);
      }
      return p;
    }

    if (answer.skip) {
      if (q.id === "bizName") setPath(p, path, "");        // name is required by the schema
      else if (q.id === "bizSector") setPath(p, path, "other");
      else deletePath(p, path);
      mark(p, path, "missing");
      return p;
    }

    var value = answer.value;
    if (q.id === "bizDebtOverdue") value = value === "yes";
    setPath(p, path, value);
    mark(p, path, q.estimate && answer.estimate ? "estimated" : null);
    return p;
  }

  function completeIntake(profile) {
    var p = copy(profile);
    p.meta.intakeComplete = true;
    return p;
  }

  var api = {
    QUESTIONS: QUESTIONS, SECTORS: SECTORS, question: function (id) { return BY_ID[id]; },
    newProfile: newProfile, sequence: sequence, first: first, next: next, previous: previous,
    applyAnswer: applyAnswer, completeIntake: completeIntake,
    getPath: getPath, pathFor: pathFor, markOf: markOf, parseNumber: parseNumber
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumIntakeFlow = api;
})(this);
