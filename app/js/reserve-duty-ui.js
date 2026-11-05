// Reserve duty screens (the logic is in reserve-duty.js):
//   callUpForm   "I've been called up": dates, and the optional light message
//   awayCard     Home during a call-up: the plan is frozen, nothing is late
//   returnCard   Home right after the return: pick up, new plan, or fresh look
//   callUpEntry  the small "Called up for reserve duty?" section on Home
// Never asks about service experiences (CLAUDE.md rule 5).
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var RD = root.MomentumReserveDuty;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDate(iso, lang) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "long" });
  }

  function lightMessageBox(t, checked, onchange) {
    var box = el("input", { type: "checkbox", id: "rd-light" });
    box.checked = Boolean(checked);
    if (onchange) box.addEventListener("change", function () { onchange(box.checked); });
    return { box: box, node: el("label", { class: "estimate rd-light", for: "rd-light" }, box,
      el("span", null, el("strong", { text: t("rd.light") }), " ", t("rd.lightHint"))) };
  }

  // ctx: { mount, t, lang(), profile, onSave(profile), onBack }
  function callUpForm(ctx) {
    var t = ctx.t;
    var s = ctx.profile.service || {};
    var planned = s.status === "expecting_call_up";
    var start = el("input", { type: "date", id: "rd-start", value: (planned && s.callUpStart) || today() });
    var end = el("input", { type: "date", id: "rd-end", value: (planned && s.callUpEnd) || "" });
    var light = lightMessageBox(t, ctx.profile.flags && ctx.profile.flags.lightMessageOptIn);
    var err = el("p", { class: "q-error", role: "alert" });

    ctx.mount.textContent = "";
    ctx.mount.appendChild(el("div", { class: "message reserve-duty" },
      el("h1", { tabindex: "-1", text: t("rd.formTitle") }),
      el("p", { class: "lead", text: t("rd.formLead") }),
      el("form", { class: "diagnostic", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var r = RD.startCallUp(ctx.profile, { start: start.value, end: end.value, lightMessage: light.box.checked }, today());
        if (!r.ok) { err.textContent = t("rd." + r.error); return; }
        ctx.onSave(r.profile);
      } },
        el("div", { class: "dates" },
          el("label", { class: "date-field" }, el("span", { text: t("rd.start") }), start),
          el("label", { class: "date-field" }, el("span", { text: t("rd.end") }), end)),
        el("p", { class: "soft-note", text: t("rd.endHint") }),
        light.node,
        err,
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", text: t("rd.confirm") }),
          el("button", { type: "button", class: "btn-quiet", text: t("nav.home"), onclick: ctx.onBack })))));
    window.scrollTo(0, 0);
    ctx.mount.querySelector("h1").focus();
  }

  function hasOpenPlan(profile) {
    return (profile.businesses || []).some(function (b) { return b.plan && b.plan.priorities && b.plan.priorities.length; });
  }

  // ctx: { t, lang(), profile, onReturn(), onCheckin(), onLightMessage(on) }
  function awayCard(ctx) {
    var t = ctx.t;
    var p = ctx.profile;
    var end = p.service && p.service.callUpEnd;
    var passed = RD.endPassed(p, today());
    return [
      el("h1", { tabindex: "-1", text: t("rd.awayTitle") }),
      el("p", { class: "lead", text: t("rd.awayLead") }),
      end && !passed ? el("p", { class: "soft-note", text: fill(t("rd.awayUntil"), { date: formatDate(end, ctx.lang()) }) }) : null,
      passed ? el("p", { class: "soft-note", text: t("rd.awayPassed") }) : null,
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn-primary", text: t("rd.back"), onclick: ctx.onReturn }),
        hasOpenPlan(p) ? el("button", { type: "button", class: "btn-quiet", text: t("rd.lightCheckin"), onclick: ctx.onCheckin }) : null),
      lightMessageBox(t, p.flags && p.flags.lightMessageOptIn, ctx.onLightMessage).node
    ];
  }

  // ctx: { t, profile, onChoice(choice, businessId) }
  function returnCard(ctx) {
    var t = ctx.t;
    var p = ctx.profile;
    var away = RD.absenceDays(p);
    var long = RD.longAbsence(p);
    var withPlan = (p.businesses || []).filter(function (b) { return b.plan && b.plan.priorities && b.plan.priorities.length; });
    var list = el("div", { class: "choices" });

    function pickBusiness(choice) {
      if (withPlan.length === 1) return ctx.onChoice(choice, withPlan[0].id);
      list.textContent = "";
      list.appendChild(el("p", { class: "d-label", text: t("router.askBusiness") }));
      withPlan.forEach(function (b, i) {
        list.appendChild(el("button", { type: "button", class: "choice", onclick: function () { ctx.onChoice(choice, b.id); } },
          b.name || fill(t("businessN"), { n: i + 1 })));
      });
      var first = list.querySelector("button");
      if (first) first.focus();
    }

    function option(choice, recommended) {
      return el("button", { type: "button", class: "choice rd-choice", onclick: function () {
        if (choice === "pick_up") ctx.onChoice("pick_up", null); else pickBusiness(choice);
      } },
        recommended ? el("span", { class: "suggestion-tag", text: t("next.suggested") }) : null,
        el("strong", { text: t("rd.choice." + choice) }),
        el("span", { class: "suggestion-why", text: t("rd.choice." + choice + ".why") }));
    }

    if (!withPlan.length) {
      list.appendChild(el("button", { type: "button", class: "btn-primary", text: t("rd.continue"), onclick: function () { ctx.onChoice("pick_up", null); } }));
    } else if (long) {
      list.appendChild(option("fresh_look", true));
      list.appendChild(option("pick_up"));
      list.appendChild(option("new_plan"));
    } else {
      list.appendChild(option("pick_up"));
      list.appendChild(option("new_plan"));
      list.appendChild(option("fresh_look"));
    }

    return [
      el("h1", { tabindex: "-1", text: t("rd.returnTitle") }),
      el("p", { class: "lead", text: t(withPlan.length ? "rd.returnLead" : "rd.returnLeadNoPlan") }),
      long && withPlan.length ? el("p", { class: "soft-note", text: fill(t("rd.returnLong"), { days: away }) }) : null,
      withPlan.length && away > 0 ? el("p", { class: "soft-note", text: t("rd.returnDates") }) : null,
      list
    ];
  }

  // ctx: { t, onCallUp(), onPrepare() }
  function callUpEntry(ctx) {
    var t = ctx.t;
    var expecting = RD.expecting(ctx.profile);
    return el("section", { class: "topics rd-entry", "aria-labelledby": "rd-entry-title" },
      el("h2", { id: "rd-entry-title", text: t(expecting ? "rd.entryTitleSoon" : "rd.entryTitle") }),
      el("p", { class: "soft-note", text: t("rd.entryLead") }),
      el("div", { class: "module-buttons" },
        el("button", { type: "button", class: "chip", text: t("rd.entryStart"), onclick: ctx.onCallUp }),
        el("button", { type: "button", class: "chip", text: t("rd.entryPrepare"), onclick: ctx.onPrepare })));
  }

  root.MomentumReserveDutyUI = { callUpForm: callUpForm, awayCard: awayCard, returnCard: returnCard, callUpEntry: callUpEntry };
})(this);
