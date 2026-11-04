// The Router: decides who handles the soldier's next step (agents/router.md).
// It never gives advice. It returns which agent or module to load, which
// business is in focus, which sector file to load with it, and one short
// sentence for the soldier (as a text key; the wording lives in app/i18n).
//
// Rules, in the order agents/router.md gives them:
//   Escalation first: the shared check runs before anything else.
//   1. No profile, or intake not finished -> Intake
//   2. A business with no diagnosis       -> Diagnostic for that business
//   3. A diagnosis but no plan            -> Recovery Planning
//   4. Every business has a plan          -> Accountability
//   5. A specific request (a module button) beats the default flow. The
//      default flow is worked out from the profile each time, so after a
//      module the soldier is back exactly where they left off.
//   6. More than one business and none chosen -> ask which one first
//   7. Load the sector file of the business in focus, or sectors/other.md
//   8. A Cover Person during a call-up is routed in helper mode, only within
//      what the soldier approved; money and staff decisions stay with the soldier.
//
// Spotting a specific question inside free text (not a button) needs Claude
// and is added with the proxy in Phase 9.
//
// Works in the browser (window.MomentumRouter) and in Node tests (require).
(function (root) {
  "use strict";

  var Esc = typeof module === "object" && module.exports ? require("./escalation.js") : root.MomentumEscalation;

  var FILES = {
    intake: "agents/intake.md",
    diagnostic: "agents/diagnostic.md",
    recovery_plan: "agents/recovery-plan.md",
    accountability: "agents/accountability.md",
    pricing: "modules/pricing.md",
    cash_flow_debt: "modules/cash-flow-debt.md",
    customer_acquisition: "modules/customer-acquisition.md",
    customer_followup: "modules/customer-followup.md",
    benefits_grants: "modules/benefits-grants.md",
    staff: "modules/staff.md",
    time_capacity: "modules/time-capacity.md"
  };

  var MODULES = ["pricing", "cash_flow_debt", "customer_acquisition", "customer_followup", "benefits_grants", "staff", "time_capacity"];

  // What a Cover Person may open, by the tasks the soldier allowed.
  // Pricing, cash and debt, staff, and benefits are decisions for the soldier.
  var COVER_MODULES = { customer_followup: ["answer_customers", "send_followups"] };

  var SECTORS = ["food_hospitality", "retail_ecommerce", "trades_construction", "professional_services",
    "tech_creative", "health_personal_care", "transport_logistics", "other"];

  function sectorFile(sector) {
    return "sectors/" + (SECTORS.indexOf(sector) === -1 ? "other" : sector).replace(/_/g, "-") + ".md";
  }

  function businesses(profile) { return (profile && profile.businesses) || []; }

  function find(profile, id) {
    return businesses(profile).filter(function (b) { return b.id === id; })[0] || null;
  }

  function hasDiagnosis(b) { return Boolean(b.diagnosis && b.diagnosis.completedAt); }
  function hasPlan(b) { return Boolean(b.plan && b.plan.priorities && b.plan.priorities.length); }

  function result(agent, business, sayKey, extra) {
    var out = {
      agent: agent,
      file: FILES[agent] || null,
      businessId: business ? business.id : null,
      sectorFile: business ? sectorFile(business.sector) : null,
      say: { key: sayKey, vars: { business: business ? business.name || "" : "" } }
    };
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  function coverAccess(profile, today) {
    var c = profile.cover || {};
    var onDuty = profile.service && profile.service.status === "called_up";
    var notExpired = !c.accessEndDate || today <= c.accessEndDate;
    return Boolean(c.active && c.coverAgreed && onDuty && notExpired);
  }

  // The default flow (rules 1 to 4), for the soldier or within the businesses a Cover Person may see.
  function defaultFlow(profile, allowed) {
    var list = businesses(profile).filter(function (b) { return !allowed || allowed.indexOf(b.id) !== -1; });
    for (var i = 0; i < list.length; i++) {
      if (!hasDiagnosis(list[i])) return result("diagnostic", list[i], "router.diagnostic");
    }
    for (var j = 0; j < list.length; j++) {
      if (!hasPlan(list[j])) return result("recovery_plan", list[j], "router.recovery_plan");
    }
    return result("accountability", null, "router.accountability");
  }

  // input: { message, request: { agent, businessId }, speaker: "soldier" | "cover", today: "YYYY-MM-DD" }
  function route(profile, input) {
    var opts = input || {};
    var speaker = opts.speaker === "cover" ? "cover" : "soldier";
    var today = opts.today || new Date().toISOString().slice(0, 10);
    var request = opts.request || null;
    var note = null;

    // Escalation overrides everything. Level 1 and 2 go to a human mentor,
    // never to the Cover Person.
    if (opts.message) {
      var check = Esc.checkMessage(opts.message, { from: speaker });
      if (check.level === 1 || check.level === 2) {
        return result("mentor_handoff", null, "router.handoff" + check.level, { escalation: check });
      }
      if (check.level === 3) note = check;
    }

    function withNote(r) { if (note) r.escalation = note; return r; }

    // Rule 1
    if (!profile || !profile.meta || !profile.meta.intakeComplete || businesses(profile).length === 0) {
      return withNote(result("intake", null, "router.intake"));
    }

    // Rule 8: Cover Person in helper mode
    var allowedIds = null;
    if (speaker === "cover") {
      if (!coverAccess(profile, today)) return withNote(result("no_access", null, "router.coverNoAccess"));
      allowedIds = (profile.cover.sharedBusinessIds || []).filter(function (id) { return find(profile, id); });
      if (allowedIds.length === 0) return withNote(result("no_access", null, "router.coverNoAccess"));
    }

    // Rule 5: a specific request beats the default flow
    if (request && MODULES.indexOf(request.agent) !== -1) {
      if (speaker === "cover") {
        var needs = COVER_MODULES[request.agent];
        var tasks = profile.cover.allowedTasks || [];
        var permitted = needs && needs.some(function (task) { return tasks.indexOf(task) !== -1; });
        if (!permitted) return withNote(result("not_for_cover", null, "router.notForCover"));
      }

      var pool = businesses(profile).filter(function (b) { return !allowedIds || allowedIds.indexOf(b.id) !== -1; });
      var chosen = request.businessId ? find(profile, request.businessId) : pool.length === 1 ? pool[0] : null;
      if (chosen && allowedIds && allowedIds.indexOf(chosen.id) === -1) chosen = null;

      // Rule 6: more than one business -> ask, never guess
      if (!chosen) {
        return withNote(result("ask_business", null, "router.askBusiness", {
          pending: request.agent,
          choices: pool.map(function (b) { return { id: b.id, name: b.name || "" }; })
        }));
      }
      return withNote(result(request.agent, chosen, "router.module." + request.agent,
        speaker === "cover" ? { mode: "cover_helper" } : null));
    }

    // Rules 2 to 4, with rule 7 (sector file) filled in by result()
    var flow = defaultFlow(profile, allowedIds);
    if (speaker === "cover") flow.mode = "cover_helper";
    return withNote(flow);
  }

  var api = { route: route, sectorFile: sectorFile, FILES: FILES, MODULES: MODULES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumRouter = api;
})(this);
