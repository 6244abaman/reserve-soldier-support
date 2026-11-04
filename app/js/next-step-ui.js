// The screen after Intake: asks the Router what comes next and shows it.
// The Diagnostic, Recovery Planning, and Accountability screens arrive in
// Phase 6 and the modules in Phase 8; until then this screen shows the
// Router's choice. The "Testing" box shows how the Router decided, which is
// back-office detail, so it appears only while testing mode is on.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Router = root.MomentumRouter;

  var BUILT_IN_PHASE = { diagnostic: 6, recovery_plan: 6, accountability: 6 };

  // options: { mount, profile, t, request, testing, onBack }
  function show(options) {
    var t = options.t;
    var profile = options.profile;
    var r = Router.route(profile, { request: options.request || null });
    var mount = options.mount;

    function again(request) {
      show(Object.assign({}, options, { request: request }));
    }

    var parts = [el("h1", { tabindex: "-1", text: fill(t(r.say.key), r.say.vars) })];

    if (r.agent === "ask_business") {
      parts.push(el("div", { class: "choices" }, r.choices.map(function (c, i) {
        return el("button", { type: "button", class: "choice",
          onclick: function () { again({ agent: r.pending, businessId: c.id }); } },
          c.name || fill(t("businessN"), { n: i + 1 }));
      })));
    }

    if (options.testing && r.agent !== "ask_business") {
      var phase = BUILT_IN_PHASE[r.agent] || 8;
      var name = r.businessId ? (profile.businesses.filter(function (b) { return b.id === r.businessId; })[0] || {}).name : null;
      parts.push(el("section", { class: "testing-box", "aria-label": t("test.title") },
        el("p", { class: "testing-title", text: t("test.title") }),
        el("p", { text: fill(t("test.notBuilt"), { n: phase }) }),
        el("dl", null,
          row(t("test.agent"), r.file),
          name != null ? row(t("test.business"), name || r.businessId) : null,
          r.sectorFile ? row(t("test.sector"), r.sectorFile) : null),
        el("p", { class: "testing-title", text: t("test.try") }),
        el("div", { class: "module-buttons" }, Router.MODULES.map(function (m) {
          return el("button", { type: "button", class: "chip", onclick: function () { again({ agent: m }); } }, t("mod." + m));
        }))));
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
