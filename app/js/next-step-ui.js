// The screen between steps: asks the Router what comes next and offers it
// (the Diagnostic form and findings, the Recovery Plan, or the weekly
// check-in), plus the seven topics, with one or two suggested from the answers.
// During a call-up, and right after the return, Home shows the reserve duty
// card instead of the next step (reserve-duty-ui.js). The "Testing" box shows how the Router decided, which is
// back-office detail, so it appears only while testing mode is on.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Router = root.MomentumRouter;
  var RD = root.MomentumReserveDuty;
  var RDUI = root.MomentumReserveDutyUI;

  // options: { mount, profile, t, lang(), request, testing, onBack, onOpenDiagnostic(businessId), onOpen(step, businessId),
  //            onOpenTopic(topic, businessId), onCallUp(), onReturn(), onReturnChoice(choice, businessId), onLightMessage(on),
  //            cover: { onEdit(), onBrief(), onEnd() } }
  function show(options) {
    var t = options.t;
    var profile = options.profile;
    var r = Router.route(profile, { request: options.request || null });
    var mount = options.mount;

    // A topic with its business known opens the topic conversation straight away.
    if (options.request && Router.MODULES.indexOf(r.agent) !== -1 && r.businessId) {
      options.onOpenTopic(r.agent, r.businessId);
      return;
    }

    function again(request) {
      show(Object.assign({}, options, { request: request }));
    }

    var business = r.businessId ? profile.businesses.filter(function (b) { return b.id === r.businessId; })[0] : null;
    var formSent = r.agent === "diagnostic" && root.MomentumDiagnosticForm.awaitingFindings(business);
    var title = formSent ? fill(t("next.formDone"), r.say.vars) : fill(t(r.say.key), r.say.vars);
    // Home: the page with the soldier's next step. A specific topic shows its own title instead.
    var parts = [
      options.request ? null : el("p", { class: "eyebrow", text: t("next.eyebrow") }),
      el("h1", { tabindex: "-1", text: title })
    ];

    // Reserve duty: the plan is frozen while away; on return, a soft welcome back.
    var started = profile.meta && profile.meta.intakeComplete;
    var dutyMode = !options.request && started && (RD.onDuty(profile) || RD.awaitingReturn(profile));
    if (dutyMode) {
      parts = [el("p", { class: "eyebrow", text: t("next.eyebrow") })].concat(RD.onDuty(profile)
        ? RDUI.awayCard({ t: t, lang: options.lang, profile: profile, onReturn: options.onReturn,
            onCheckin: function () { options.onOpen("checkin", null); }, onLightMessage: options.onLightMessage, cover: options.cover })
        : RDUI.returnCard({ t: t, profile: profile, onChoice: options.onReturnChoice }));
    }

    // The three main steps: Diagnostic (form, then findings), Recovery Plan, weekly check-in.
    function button(primary, key, onclick) {
      return el("button", { type: "button", class: primary ? "btn-primary" : "btn-quiet", text: t(key), onclick: onclick });
    }
    if (!dutyMode && r.agent === "diagnostic") {
      parts.push(el("p", { class: "lead", text: t(formSent ? "next.formDoneLead" : "next.diagnosticLead") }));
      parts.push(el("div", { class: "actions" },
        formSent ? button(true, "next.findings", function () { options.onOpen("findings", r.businessId); }) : null,
        button(!formSent, formSent ? "next.editForm" : "next.start", function () { options.onOpenDiagnostic(r.businessId); })));
    }
    if (!dutyMode && r.agent === "recovery_plan") {
      parts.push(el("p", { class: "lead", text: t("next.planLead") }));
      parts.push(el("div", { class: "actions" }, button(true, "next.planStart", function () { options.onOpen("plan", r.businessId); })));
    }
    if (!dutyMode && r.agent === "accountability") {
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

    if (options.testing && !dutyMode && r.agent !== "ask_business") {
      var url = (root.MOMENTUM_CONFIG && root.MOMENTUM_CONFIG.proxyUrl) || "";
      var built = ["diagnostic", "recovery_plan", "accountability"].indexOf(r.agent) !== -1;
      var name = r.businessId ? (profile.businesses.filter(function (b) { return b.id === r.businessId; })[0] || {}).name : null;
      parts.push(el("section", { class: "testing-box", "aria-label": t("test.title") },
        el("p", { class: "testing-title", text: t("test.title") }),
        el("p", { text: built ? (url ? fill(t("test.proxy"), { url: url }) : t("test.noProxy")) : fill(t("test.notBuilt"), { n: 8 }) }),
        el("dl", null,
          row(t("test.agent"), r.file),
          name != null ? row(t("test.business"), name || r.businessId) : null,
          r.sectorFile ? row(t("test.sector"), r.sectorFile) : null),
        null));
    }

    parts.push(el("div", { class: "actions" },
      options.request ? el("button", { type: "button", class: r.agent === "ask_business" ? "btn-quiet" : "btn-primary", text: t("nav.home"),
        onclick: function () { again(null); } }) : null,
      el("button", { type: "button", class: "btn-quiet", text: t("next.back"), onclick: options.onBack })));

    // Topics: suggested ones first (from the answers), then all seven.
    if (!options.request && profile.meta && profile.meta.intakeComplete) {
      var suggested = Router.suggestTopics(profile);
      var several = (profile.businesses || []).length > 1;
      parts.push(el("section", { class: "topics", "aria-labelledby": "topics-title" },
        el("h2", { id: "topics-title", text: t("next.topics") }),
        el("p", { class: "soft-note", text: t("next.topicsLead") }),
        suggested.length ? el("ul", { class: "suggestions" }, suggested.map(function (sg) {
          var b = (profile.businesses || []).filter(function (x) { return x.id === sg.businessId; })[0] || {};
          return el("li", null, el("button", { type: "button", class: "suggestion",
            onclick: function () { options.onOpenTopic(sg.agent, sg.businessId); } },
            el("span", { class: "suggestion-tag", text: t("next.suggested") }),
            el("strong", { text: t("mod." + sg.agent) + (several && b.name ? " · " + b.name : "") }),
            el("span", { class: "suggestion-why", text: t(sg.reason) })));
        })) : null,
        el("div", { class: "module-buttons" }, Router.MODULES.map(function (m) {
          return el("button", { type: "button", class: "chip", onclick: function () { again({ agent: m }); } }, t("mod." + m));
        }))));
    }

    // "Called up for reserve duty?" (not shown while away or right after the return)
    if (!options.request && started && !dutyMode) {
      parts.push(RDUI.callUpEntry({ t: t, lang: options.lang, profile: profile, onCallUp: options.onCallUp, cover: options.cover,
        onPrepare: function () { again({ agent: "time_capacity" }); } }));
    }

    if (!options.request) parts.push(el("p", { class: "soft-note", text: t("next.homeHint") }));

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
