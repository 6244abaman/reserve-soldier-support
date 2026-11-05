// Cover Person screens (the logic is in cover.js):
//   setupForm     who covers, which businesses they see, what they may do,
//                 until when, and both agreements
//   briefScreen   the handover brief, then send it (WhatsApp or copy); the
//                 soldier sends it, never the app
//   summaryBox    the Cover Person on Home: who, what, edit, send, end access
// Money, debts, prices, discounts, and hiring always stay with the soldier.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Cover = root.MomentumCover;
  var Esc = root.MomentumEscalation;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDate(iso, lang) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "long" });
  }

  function screen(mount, children) {
    mount.textContent = "";
    mount.appendChild(el("div", { class: "message cover" }, children));
    window.scrollTo(0, 0);
    var h = mount.querySelector("h1");
    if (h) h.focus();
  }

  function field(id, labelKey, input, t, hintKey) {
    return el("div", { class: "d-field" },
      el("label", { class: "d-label", for: id, text: t(labelKey) }),
      hintKey ? el("p", { class: "q-hint", text: t(hintKey) }) : null,
      input);
  }

  function check(id, checked, text) {
    var box = el("input", { type: "checkbox", id: id });
    box.checked = Boolean(checked);
    return { box: box, node: el("label", { class: "estimate cover-check", for: id }, box, el("span", { text: text })) };
  }

  // ctx: { mount, t, lang(), profile, onSave(profile), onBack }
  function setupForm(ctx) {
    var t = ctx.t;
    var p = ctx.profile;
    var c = p.cover && p.cover.active ? p.cover : {};
    var list = p.businesses || [];
    var errs = {};

    function err(key) { errs[key] = el("p", { class: "q-error", role: "alert" }); return errs[key]; }

    var name = el("input", { type: "text", id: "cv-name", autocomplete: "off", value: c.name || "" });
    var rel = el("input", { type: "text", id: "cv-rel", autocomplete: "off", value: c.relationship || "", placeholder: t("cover.relExample") });
    var contact = el("input", { type: "tel", id: "cv-contact", dir: "ltr", autocomplete: "off", value: c.contact || "" });
    var shared = c.sharedBusinessIds || (list.length === 1 ? [list[0].id] : []);
    var bizChecks = list.map(function (b, i) {
      return check("cv-biz-" + i, shared.indexOf(b.id) !== -1, b.name || fill(t("businessN"), { n: i + 1 }));
    });
    var tasks = c.allowedTasks || [];
    var taskChecks = Cover.TASKS.map(function (x) { return check("cv-task-" + x, tasks.indexOf(x) !== -1, t("cover.task." + x)); });
    // "Only monitor" and the other two cannot be chosen together.
    taskChecks.forEach(function (tc, i) {
      tc.box.addEventListener("change", function () {
        if (!tc.box.checked) return;
        taskChecks.forEach(function (other, j) {
          if (j !== i && (Cover.TASKS[i] === "monitor_only" || Cover.TASKS[j] === "monitor_only")) other.box.checked = false;
        });
      });
    });
    // Suggest the planned end of the call-up, but never a date that has passed.
    var callUpEnd = p.service && p.service.callUpEnd && p.service.callUpEnd >= today() ? p.service.callUpEnd : "";
    var end = el("input", { type: "date", id: "cv-end", value: c.accessEndDate || callUpEnd || "" });
    var consent = check("cv-consent", c.soldierConsentDate, t("cover.consent"));
    var agreed = check("cv-agreed", c.coverAgreed, t("cover.agreed"));

    screen(ctx.mount, [
      el("h1", { tabindex: "-1", text: t("cover.title") }),
      el("p", { class: "lead", text: t("cover.lead") }),
      el("form", { class: "diagnostic", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        Object.keys(errs).forEach(function (k) { errs[k].textContent = ""; });
        var input = {
          name: name.value, relationship: rel.value, contact: contact.value,
          sharedBusinessIds: list.filter(function (b, i) { return bizChecks[i].box.checked; }).map(function (b) { return b.id; }),
          allowedTasks: Cover.TASKS.filter(function (x, i) { return taskChecks[i].box.checked; }),
          accessEndDate: end.value, consent: consent.box.checked, agreed: agreed.box.checked
        };
        var check3 = Esc.checkMessage([input.name, input.relationship].join("\n"), { from: "soldier" });
        if (check3.level === 1 || check3.level === 2) {
          ctx.mount.textContent = "";
          ctx.mount.appendChild(root.MomentumHandoffUI.build(check3.level, t, function () { setupForm(ctx); }));
          return;
        }
        var r = Cover.setUp(ctx.profile, input, today());
        if (!r.ok) {
          Object.keys(r.errors).forEach(function (k) { if (errs[k]) errs[k].textContent = t("cover." + r.errors[k]); });
          var first = ctx.mount.querySelector(".q-error:not(:empty)");
          if (first && first.scrollIntoView) first.scrollIntoView({ block: "center" });
          return;
        }
        ctx.onSave(r.profile);
      } },
        field("cv-name", "cover.name", name, t), err("name"),
        field("cv-rel", "cover.rel", rel, t),
        field("cv-contact", "cover.contact", contact, t, "cover.contactHint"),
        el("fieldset", { class: "d-section" },
          el("legend", { text: t("cover.businesses") }),
          bizChecks.map(function (x) { return x.node; }), err("businesses")),
        el("fieldset", { class: "d-section" },
          el("legend", { text: t("cover.tasks") }),
          taskChecks.map(function (x) { return x.node; }), err("tasks"),
          el("p", { class: "soft-note", text: t("cover.limits") })),
        field("cv-end", "cover.end", end, t, "cover.endHint"), err("end"),
        el("fieldset", { class: "d-section" },
          el("legend", { text: t("cover.agreements") }),
          consent.node, err("consent"),
          agreed.node, err("agreed"),
          el("p", { class: "soft-note", text: t("cover.privacy") })),
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", text: t("cover.save") }),
          el("button", { type: "button", class: "btn-quiet", text: t("nav.home"), onclick: ctx.onBack })))
    ]);
  }

  // ctx: { mount, t, lang(), profile, onSave(profile), onBack }
  function briefScreen(ctx) {
    var t = ctx.t;
    var c = ctx.profile.cover || {};
    var box = el("textarea", { id: "cv-brief", rows: "12" });
    box.value = c.handoverBrief || t("cover.briefTemplate");
    var err = el("p", { class: "q-error", role: "alert" });
    var sent = el("div", { class: "cover-send", hidden: !c.handoverBrief });

    function fillSend(profile) {
      var text = Cover.shareText(profile, t, function (d) { return formatDate(d, ctx.lang()); });
      sent.textContent = "";
      sent.appendChild(el("h2", { text: fill(t("cover.sendTitle"), { name: c.name || "" }) }));
      sent.appendChild(el("p", { class: "soft-note", text: t("cover.sendLead") }));
      var copy = navigator.clipboard ? el("button", { type: "button", class: "btn-quiet", text: t("cover.copy") }) : null;
      if (copy) copy.addEventListener("click", function () {
        navigator.clipboard.writeText(text).then(function () { copy.textContent = t("cover.copied"); }, function () { /* blocked */ });
      });
      sent.appendChild(el("div", { class: "actions" },
        el("a", { class: "btn-primary btn-link", href: "https://wa.me/?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" },
          fill(t("cover.whatsapp"), { name: c.name || "" })),
        copy));
    }
    if (c.handoverBrief) fillSend(ctx.profile);

    screen(ctx.mount, [
      el("h1", { tabindex: "-1", text: fill(t("cover.briefTitle"), { name: c.name || "" }) }),
      el("p", { class: "lead", text: t("cover.briefLead") }),
      el("form", { class: "diagnostic", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        err.textContent = "";
        var check3 = Esc.checkMessage(box.value, { from: "soldier" });
        if (check3.level === 1 || check3.level === 2) {
          ctx.mount.textContent = "";
          ctx.mount.appendChild(root.MomentumHandoffUI.build(check3.level, t, function () { briefScreen(ctx); }));
          return;
        }
        var r = Cover.saveBrief(ctx.profile, box.value);
        if (!r.ok) { err.textContent = t("cover." + r.error); return; }
        var p = check3.level === 3 ? Esc.flagProfile(r.profile, Object.assign({ from: "soldier" }, check3)) : r.profile;
        var saved = ctx.onSave(p);
        if (!saved) { err.textContent = t("saveError"); return; }
        ctx.profile = saved;
        err.textContent = "";
        fillSend(saved);
        sent.hidden = false;
        sent.scrollIntoView && sent.scrollIntoView({ block: "start", behavior: "smooth" });
      } },
        el("label", { class: "d-label", for: "cv-brief", text: t("cover.briefLabel") }),
        el("p", { class: "q-hint", text: t("cover.briefHint") }),
        box, err,
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", text: t("cover.briefSave") }))),
      sent,
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn-quiet", text: t("nav.home"), onclick: ctx.onBack }))
    ]);
  }

  // ctx: { t, lang(), profile, onEdit(), onBrief(), onEnd() } -> element or null
  function summaryBox(ctx) {
    var t = ctx.t;
    var p = ctx.profile;
    var state = Cover.state(p, today());
    if (state !== "ready" && state !== "active") return null;
    var c = p.cover;
    var names = (p.businesses || []).filter(function (b) { return c.sharedBusinessIds.indexOf(b.id) !== -1; })
      .map(function (b) { return b.name || b.id; }).join(", ");
    var armed = false;
    var endBtn = el("button", { type: "button", class: "chip", text: fill(t("cover.end.button"), { name: c.name }) });
    endBtn.addEventListener("click", function () {
      if (!armed) { armed = true; endBtn.textContent = t("cover.end.confirm"); endBtn.classList.add("is-armed"); return; }
      ctx.onEnd();
    });
    return el("section", { class: "cover-box", "aria-labelledby": "cover-box-title" },
      el("h2", { id: "cover-box-title", text: fill(t(state === "active" ? "cover.box.active" : "cover.box.ready"), { name: c.name }) }),
      el("p", { class: "soft-note", text: fill(t("cover.box.what"), {
        businesses: names,
        tasks: c.allowedTasks.map(function (x) { return t("cover.task." + x); }).join(", ")
      }) }),
      c.accessEndDate ? el("p", { class: "soft-note", text: fill(t("cover.box.until"), { date: formatDate(c.accessEndDate, ctx.lang()) }) })
        : el("p", { class: "soft-note", text: t("cover.box.untilReturn") }),
      el("div", { class: "module-buttons" },
        el("button", { type: "button", class: "chip", text: t(c.handoverBrief ? "cover.box.brief" : "cover.box.writeBrief"), onclick: ctx.onBrief }),
        el("button", { type: "button", class: "chip", text: t("cover.box.edit"), onclick: ctx.onEdit }),
        endBtn));
  }

  root.MomentumCoverUI = { setupForm: setupForm, briefScreen: briefScreen, summaryBox: summaryBox };
})(this);
