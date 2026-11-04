// Draws the Intake screens: one question at a time, the summary to check and
// correct, the "saved" screen, and the handoff screens when the shared
// escalation check finds something (CLAUDE.md rule 1).
//
// The order of questions and how answers are saved live in intake-flow.js.
// All wording lives in app/i18n.
(function (root) {
  "use strict";

  var Flow = root.MomentumIntakeFlow;
  var Esc = root.MomentumEscalation;
  var normalizePhone = root.MomentumStorage.normalizePhone;
  var POS_KEY = "momentum.intake";
  var TEXT_TYPES = ["text", "longtext"];
  // Questions that appear because of an answer just changed from the summary.
  var FOLLOW_UPS = ["callUpDates", "bizDebtAmount", "bizDebtOverdue"];

  var store, t, lang, chartTemplate, mount, onContinue;
  var state = { profile: null, pos: null, screen: "question", editing: false, note: null, error: null, handoff: 0 };

  var el = root.MomentumDom.el;
  var append = root.MomentumDom.append;
  var fill = root.MomentumDom.fill;

  // ---------- small helpers ----------

  function has(key) { return t(key) !== key; }

  function money(n) {
    return t("shekel") + new Intl.NumberFormat(lang() === "he" ? "he-IL" : "en-US").format(n);
  }

  function readPos() {
    try { return JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) { return null; }
  }

  function writePos() {
    var phone = state.profile.person && state.profile.person.phone;
    if (!phone) return;
    try { localStorage.setItem(POS_KEY, JSON.stringify({ phone: phone, id: state.pos.id, biz: state.pos.biz })); } catch (e) { /* fine */ }
  }

  // Saves once there is a phone number to save under.
  function persist() {
    state.profile.meta.language = lang();
    if (!normalizePhone(state.profile.person && state.profile.person.phone)) return;
    var result = store.save(state.profile);
    if (result.ok) { state.profile = result.profile; state.error = null; }
    else { state.error = "saveError"; if (root.console) console.warn("Profile not saved", result.errors); }
    writePos();
  }

  function businessName(biz) {
    var b = state.profile.businesses && state.profile.businesses[biz];
    return (b && b.name) || fill(t("businessN"), { n: biz + 1 });
  }

  // ---------- moving between screens ----------

  function go(pos) {
    state.pos = pos;
    state.screen = pos.id === "summary" ? "summary" : "question";
    writePos();
    render(true);
  }

  function advance() {
    var next = Flow.next(state.profile, state.pos);
    if (state.editing) {
      var followUp = FOLLOW_UPS.indexOf(next.id) !== -1 && next.biz === state.pos.biz;
      if (!followUp) { state.editing = false; next = { id: "summary", biz: null }; }
    }
    go(next);
  }

  function answer(ans) {
    state.profile = Flow.applyAnswer(state.profile, state.pos, ans);
    persist();
    advance();
  }

  // The shared escalation check runs on every typed answer before it is saved.
  // Level 1 and 2 answers are not saved at all; only the flag is.
  function passesEscalation(text) {
    var result = Esc.checkMessage(text, { from: "soldier" });
    if (!result.level) return true;
    state.profile = Esc.flagProfile(state.profile, result);
    persist();
    if (result.level === 3) { state.note = "l3note"; return true; }
    state.screen = "handoff";
    state.handoff = result.level;
    render(true);
    return false;
  }

  // A returning soldier with a saved profile on this phone picks up where they left off.
  function adoptExisting(phone) {
    var found = store.load(phone);
    if (!found.profile || found.profile.meta.profileId === state.profile.meta.profileId) return false;
    var p = found.profile;
    if (!p.person.firstName && state.profile.person.firstName) p.person.firstName = state.profile.person.firstName;
    state.profile = p;
    persist();
    if (p.meta.intakeComplete) { state.screen = "done"; render(true); return true; }
    return false;
  }

  // ---------- screens ----------

  function progress() {
    var step = state.screen === "summary" ? 5 : Flow.question(state.pos.id).step;
    var label = step === 5
      ? t("almostDone")
      : fill(t("stepOf"), { n: step }) + " · " + t("step" + step) +
        (state.pos.biz != null ? " · " + businessName(state.pos.biz) : "");
    var segs = [1, 2, 3, 4].map(function (s) {
      return el("span", { class: "seg" + (s < step ? " is-done" : s === step ? " is-current" : "") });
    });
    return el("section", { class: "progress", "aria-label": label },
      el("p", { class: "progress-label", text: label }),
      el("div", { class: "segments", "aria-hidden": "true" }, segs));
  }

  function introBlock() {
    var chart = chartTemplate.content.cloneNode(true).firstElementChild;
    chart.setAttribute("aria-label", t("chartLabel"));
    return el("section", { class: "intro" }, chart,
      el("h1", { text: t("heading") }),
      el("p", { text: t("intro") }),
      el("p", { class: "note", text: t("note") }));
  }

  function questionScreen() {
    var q = Flow.question(state.pos.id);
    var key = "q." + q.id;
    var inputId = "answer-" + q.id;
    var path = q.path ? Flow.pathFor(q.path, state.pos.biz) : null;
    var current = path ? Flow.getPath(state.profile, path) : null;
    var parts = [];

    var labelText = t(key + ".label");
    var label = q.type === "choice" || q.type === "dates"
      ? el("h2", { class: "q-label", id: inputId + "-label", tabindex: "-1", text: labelText })
      : el("label", { class: "q-label", for: inputId, text: labelText });
    var hint = has(key + ".hint") ? el("p", { class: "q-hint", id: inputId + "-hint", text: t(key + ".hint") }) : null;
    var error = el("p", { class: "q-error", id: inputId + "-error", role: "alert" });
    parts.push(label, hint);

    function showError(k) { error.textContent = t(k); }

    if (q.type === "choice") {
      var choices = el("div", { class: "choices", role: "group", "aria-labelledby": inputId + "-label" },
        q.options.map(function (opt) {
          var selected = q.id === "bizHasDebt"
            ? (opt === "no" ? Array.isArray(current) && current.length === 0 : Array.isArray(current) && current.length > 0)
            : q.id === "bizDebtOverdue" ? current === (opt === "yes") : current === opt;
          return el("button", { type: "button", class: "choice", "aria-pressed": String(Boolean(selected)),
            onclick: function () { answer({ value: opt }); } }, t("opt." + q.id + "." + opt));
        }));
      parts.push(choices);
    } else {
      var fields;
      if (q.type === "dates") {
        var start = Flow.getPath(state.profile, q.paths[0]) || "";
        var end = Flow.getPath(state.profile, q.paths[1]) || "";
        fields = el("div", { class: "dates" },
          el("label", { class: "date-field" }, el("span", { text: t(key + ".start") }),
            el("input", { type: "date", id: inputId + "-start", value: start })),
          el("label", { class: "date-field" }, el("span", { text: t(key + ".end") }),
            el("input", { type: "date", id: inputId + "-end", value: end })));
      } else if (q.type === "longtext") {
        fields = el("textarea", { id: inputId, rows: "4", "aria-describedby": hint ? inputId + "-hint" : null });
        fields.value = current || "";
      } else {
        var isNumber = q.type === "number";
        var input = el("input", {
          id: inputId,
          type: q.type === "phone" ? "tel" : "text",
          inputmode: isNumber ? "numeric" : q.type === "phone" ? "tel" : null,
          autocomplete: q.autocomplete || (q.type === "phone" ? "tel" : "off"),
          dir: isNumber || q.type === "phone" ? "ltr" : null,
          placeholder: has(key + ".placeholder") ? t(key + ".placeholder") : null,
          "aria-describedby": [hint ? inputId + "-hint" : "", inputId + "-error"].join(" ").trim()
        });
        input.value = current == null ? "" : String(current);
        fields = q.money ? el("div", { class: "money" }, el("span", { class: "money-sign", "aria-hidden": "true", text: t("shekel") }), input) : input;
      }
      parts.push(fields);

      var estimateBox = null;
      if (q.estimate) {
        estimateBox = el("input", { type: "checkbox", id: inputId + "-estimate" });
        estimateBox.checked = Flow.markOf(state.profile, path) === "estimated";
        parts.push(el("label", { class: "estimate", for: inputId + "-estimate" }, estimateBox, el("span", { text: t("estimate") })));
      }
      parts.push(error);

      var form = el("form", { class: "question", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        if (q.type === "dates") {
          var s = document.getElementById(inputId + "-start").value;
          var en = document.getElementById(inputId + "-end").value;
          return answer(s || en ? { value: [s, en] } : { skip: true });
        }
        var raw = document.getElementById(inputId).value.trim();
        if (q.type === "phone") {
          if (!normalizePhone(raw)) return showError("errPhone");
          state.profile = Flow.applyAnswer(state.profile, state.pos, { value: raw });
          if (adoptExisting(raw)) return;
          persist();
          return advance();
        }
        if (!raw) return answer({ skip: true });
        if (q.type === "number") {
          var n = Flow.parseNumber(raw);
          if (n === null) return showError("errNumber");
          return answer({ value: n, estimate: estimateBox && estimateBox.checked });
        }
        if (TEXT_TYPES.indexOf(q.type) !== -1 && !passesEscalation(raw)) return;
        answer({ value: raw });
      } });
      parts.forEach(function (p) { append(form, p); });
      append(form, actions(q, true));
      return form;
    }

    var box = el("div", { class: "question" });
    parts.forEach(function (p) { append(box, p); });
    append(box, actions(q, false));
    return box;
  }

  function actions(q, withContinue) {
    return el("div", { class: "actions" },
      withContinue ? el("button", { type: "submit", class: "btn-primary", text: t("continue") }) : null,
      q.required ? null : el("button", { type: "button", class: "btn-quiet", text: t("skip"),
        onclick: function () { answer({ skip: true }); } }));
  }

  function backLink() {
    var prev = state.editing ? { id: "summary", biz: null } : Flow.previous(state.profile, state.pos);
    if (!prev) return null;
    return el("button", { type: "button", class: "back", onclick: function () {
      if (state.editing) state.editing = false;
      go(prev);
    } }, el("span", { class: "back-arrow", "aria-hidden": "true", text: lang() === "he" ? "→" : "←" }), t("back"));
  }

  // ---------- summary ----------

  function displayValue(q, biz) {
    var p = state.profile;
    if (q.type === "dates") {
      var s = Flow.getPath(p, q.paths[0]);
      var e = Flow.getPath(p, q.paths[1]);
      return s || e ? [s || "…", e || "…"].join(" – ") : null;
    }
    var path = Flow.pathFor(q.path, biz);
    var v = Flow.getPath(p, path);
    if (q.id === "bizHasDebt") {
      if (!Array.isArray(v)) return null;
      if (v.length === 0) return t("opt.bizHasDebt.no");
      var d = v[0];
      var amount = typeof d.amount === "number" ? money(d.amount) : t("opt.bizHasDebt.yes");
      if (Flow.markOf(p, Flow.pathFor("businesses[#].numbers.debts[0].amount", biz)) === "estimated") amount += " (" + t("sum.estimated") + ")";
      return d.overdue ? amount + ", " + t("sum.overdue") : amount;
    }
    if (q.id === "bizSector" && Flow.markOf(p, path) === "missing") return null;
    if (v == null || v === "") return null;
    var text = q.type === "choice" ? t("opt." + q.id + "." + v) : q.money ? money(v) : String(v);
    if (Flow.markOf(p, path) === "estimated") text += " (" + t("sum.estimated") + ")";
    return text;
  }

  var SUMMARY_SKIP = ["bizDebtAmount", "bizDebtOverdue", "another"];

  function summaryRows(filter, biz) {
    return Flow.QUESTIONS.filter(function (q) {
      return filter(q) && SUMMARY_SKIP.indexOf(q.id) === -1 && (!q.when || q.when(state.profile, biz));
    }).map(function (q) {
      var value = displayValue(q, biz);
      // Phone numbers and dates read left to right even on Hebrew screens.
      var shown = value == null ? t("sum.notAnswered")
        : q.type === "phone" || q.type === "dates" ? el("span", { class: "ltr", dir: "ltr", text: value }) : value;
      return el("div", { class: "row" },
        el("dt", { text: t("lbl." + q.id) }),
        el("dd", { class: value == null ? "is-missing" : null }, shown),
        el("button", { type: "button", class: "row-edit", "aria-label": t("sum.edit") + ": " + t("lbl." + q.id),
          onclick: function () { state.editing = true; go({ id: q.id, biz: q.business ? biz : null }); } }, t("sum.edit")));
    });
  }

  function summarySection(title, rows) {
    return el("section", { class: "sum-section" }, el("h2", { text: title }), el("dl", null, rows));
  }

  function summaryScreen() {
    var sections = [
      summarySection(t("step1"), summaryRows(function (q) { return q.step === 1; })),
      summarySection(t("step2"), summaryRows(function (q) { return q.step === 2; }))
    ];
    (state.profile.businesses || []).forEach(function (b, i) {
      sections.push(summarySection(fill(t("businessN"), { n: i + 1 }) + (b.name ? " · " + b.name : ""),
        summaryRows(function (q) { return q.business; }, i)));
    });
    sections.push(summarySection(t("step4"), summaryRows(function (q) { return q.step === 4; })));

    return el("div", { class: "summary" },
      el("h1", { tabindex: "-1", text: t("sum.title") }),
      el("p", { class: "lead", text: t("sum.intro") }),
      sections,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn-primary", text: t("sum.confirm"),
        onclick: function () {
          state.profile = Flow.completeIntake(state.profile);
          persist();
          state.screen = "done";
          render(true);
        } })));
  }

  // ---------- done and handoff ----------

  function doneScreen() {
    var name = state.profile.person && state.profile.person.firstName;
    return el("div", { class: "message" },
      el("h1", { tabindex: "-1", text: name ? fill(t("done.title"), { name: name }) : t("done.titleNoName") }),
      el("p", { class: "lead", text: fill(t("done.body"), { business: businessName(0) }) }),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn-primary", text: t("done.continue"),
          onclick: function () { onContinue(state.profile); } }),
        el("button", { type: "button", class: "btn-quiet", text: t("done.review"),
          onclick: function () { go({ id: "summary", biz: null }); } })));
  }

  function handoffScreen() {
    var level = state.handoff;
    var k = "h" + level + ".";
    return el("div", { class: "message handoff level-" + level, role: "alert" },
      el("h1", { tabindex: "-1", text: t(k + "title") }),
      el("p", { class: "lead", text: t(k + "body") }),
      level === 1 ? el("p", { class: "contacts", text: t("h1.contacts") }) : null,
      el("p", { text: t(k + "mentor") }),
      el("div", { class: "actions" }, el("button", {
        type: "button",
        class: level === 1 ? "btn-quiet" : "btn-primary",
        text: t(level === 1 ? "h1.back" : "h2.continue"),
        onclick: function () { go(state.pos); }
      })));
  }

  // ---------- drawing ----------

  function render(moveFocus) {
    mount.textContent = "";
    var s = state.screen;
    if (s === "question" || s === "summary") append(mount, progress());
    if (s === "question") {
      append(mount, backLink());
      var isFirst = state.pos.id === Flow.first().id && !state.editing;
      if (isFirst) append(mount, introBlock());
      if (state.note) { append(mount, el("p", { class: "soft-note", role: "status", text: t(state.note) })); state.note = null; }
      append(mount, questionScreen());
      if (moveFocus && !isFirst) focusFirst();
    }
    if (s === "summary") append(mount, summaryScreen());
    if (s === "done") append(mount, doneScreen());
    if (s === "handoff") append(mount, handoffScreen());
    if (state.error) append(mount, el("p", { class: "q-error", role: "alert", text: t(state.error) }));
    if (moveFocus) {
      window.scrollTo(0, 0);
      if (s !== "question") { var h = mount.querySelector("h1"); if (h) h.focus(); }
    }
  }

  function focusFirst() {
    var target = mount.querySelector(".question input:not([type=checkbox]), .question textarea, .question h2");
    if (target) target.focus({ preventScroll: true });
  }

  // options: { mount, store, t, lang, chartTemplate, onContinue(profile) }
  function start(options) {
    mount = options.mount;
    store = options.store;
    t = options.t;
    lang = options.lang;
    chartTemplate = options.chartTemplate;
    onContinue = options.onContinue;

    var saved = readPos();
    var loaded = saved && saved.phone ? store.load(saved.phone) : null;
    if (loaded && loaded.profile) {
      state.profile = loaded.profile;
      if (state.profile.meta.intakeComplete) { state.pos = { id: "summary", biz: null }; state.screen = "done"; }
      else {
        state.pos = { id: saved.id, biz: saved.biz };
        state.screen = saved.id === "summary" ? "summary" : "question";
      }
    } else {
      state.profile = Flow.newProfile(lang());
      state.pos = Flow.first();
    }
    render(false);
  }

  // Shows the summary again (used by "Back to my answers" after Intake).
  function showSummary() { state.editing = false; go({ id: "summary", biz: null }); }

  root.MomentumIntakeUI = {
    start: start,
    render: function () { render(false); },
    showSummary: showSummary,
    profile: function () { return state.profile; }
  };
})(this);
