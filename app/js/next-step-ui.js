// The screen between steps: asks the Router what comes next and offers it
// (the Diagnostic form and findings, the Recovery Plan, or the weekly
// check-in), plus the specific topics (the modules), which open a chat and
// then come back here. The "Testing" box shows how the Router decided, which
// is back-office detail, so it appears only while testing mode is on.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Router = root.MomentumRouter;

  // options: { mount, profile, t, request, testing, onBack, onOpenDiagnostic(businessId),
  //            onOpen(step, businessId), onOpenModule(agent, businessId) }
  function show(options) {
    var t = options.t;
    var profile = options.profile;
    var r = Router.route(profile, { request: options.request || null });
    var mount = options.mount;

    // A topic was chosen and the business is known: open its chat.
    if (Router.MODULES.indexOf(r.agent) !== -1) return options.onOpenModule(r.agent, r.businessId);

    function again(request) {
      show(Object.assign({}, options, { request: request }));
    }

    var business = r.businessId ? profile.businesses.filter(function (b) { return b.id === r.businessId; })[0] : null;
    var formSent = r.agent === "diagnostic" && root.MomentumDiagnosticForm.awaitingFindings(business);
    var title = formSent ? fill(t("next.formDone"), r.say.vars) : fill(t(r.say.key), r.say.vars);
    var parts = [el("h1", { tabindex: "-1", text: title })];

    // The three main steps: Diagnostic (form, then findings), Recovery Plan, weekly check-in.
    function button(primary, key, onclick) {
      return el("button", { type: "button", class: primary ? "btn-primary" : "btn-quiet", text: t(key), onclick: onclick });
    }
    if (r.agent === "diagnostic") {
      parts.push(el("p", { class: "lead", text: t(formSent ? "next.formDoneLead" : "next.diagnosticLead") }));
      parts.push(el("div", { class: "actions" },
        formSent ? button(true, "next.findings", function () { options.onOpen("findings", r.businessId); }) : null,
        button(!formSent, formSent ? "next.editForm" : "next.start", function () { options.onOpenDiagnostic(r.businessId); })));
    }
    if (r.agent === "recovery_plan") {
      parts.push(el("p", { class: "lead", text: t("next.planLead") }));
      parts.push(el("div", { class: "actions" }, button(true, "next.planStart", function () { options.onOpen("plan", r.businessId); })));
    }
    if (r.agent === "accountability") {
      parts.push(el("p", { class: "lead", text: t("next.checkinLead") }));
      parts.push(el("div", { class: "actions" }, button(true, "next.checkinStart", function () { options.onOpen("checkin", null); })));
    }

    if (r.agent === "ask_business") {
      parts.push(el("div", { class: "choices" }, r.choices.map(function (c, i) {
        return el("button", { type: "button", class: "choice",
          onclick: function () { again({ agent: r.pending, businessId: c.id }); } },
          c.name || fill(t("businessN"), { n: i + 1 }));
      })));
    }

    // A specific question always beats the default flow (CLAUDE.md, Flow).
    if (r.agent === "diagnostic" || r.agent === "recovery_plan" || r.agent === "accountability") {
      parts.push(el("section", { class: "topics", "aria-labelledby": "topics-title" },
        el("h2", { id: "topics-title", text: t("next.topicsTitle") }),
        el("p", { class: "soft-note", text: t("next.topicsLead") }),
        el("div", { class: "module-buttons" }, Router.MODULES.map(function (m) {
          return el("button", { type: "button", class: "chip", onclick: function () { again({ agent: m }); } }, t("mod." + m));
        }))));
    }

    if (options.testing && r.agent !== "ask_business") {
      var url = (root.MOMENTUM_CONFIG && root.MOMENTUM_CONFIG.proxyUrl) || "";
      var built = ["diagnostic", "recovery_plan", "accountability"].concat(Router.MODULES).indexOf(r.agent) !== -1;
      var name = r.businessId ? (profile.businesses.filter(function (b) { return b.id === r.businessId; })[0] || {}).name : null;
      parts.push(el("section", { class: "testing-box", "aria-label": t("test.title") },
        el("p", { class: "testing-title", text: t("test.title") }),
        el("p", { text: built ? (url ? fill(t("test.proxy"), { url: url }) : t("test.noProxy")) : fill(t("test.notBuilt"), { n: 8 }) }),
        el("dl", null,
          row(t("test.agent"), r.file),
          name != null ? row(t("test.business"), name || r.businessId) : null,
          r.sectorFile ? row(t("test.sector"), r.sectorFile) : null)));
    }

    parts.push(el("div", { class: "actions" },
      options.request ? el("button", { type: "button", class: r.agent === "ask_business" ? "btn-quiet" : "btn-primary", text: t("next.default"),
        onclick: function () { again(null); } }) : null,
      el("button", { type: "button", class: "btn-quiet", text: t("next.back"), onclick: options.onBack })));

    mount.textContent = "";
    mount.appendChild(el("div", { class: "message next-step" }, parts));
    window.scrollTo(0, 0);
    mount.querySelector("h1").focus();
  }

  function row(label, value) {
    return el("div", { class: "testing-row" }, el("dt", { text: label }), el("dd", { dir: "ltr", text: value }));
  }

  root.MomentumNextStepUI = { show: show };
})(this);
