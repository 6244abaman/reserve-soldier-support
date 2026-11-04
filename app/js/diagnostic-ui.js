// Draws the Business Diagnostic form (agents/diagnostic.md): one screen,
// short sections, prefilled from what Intake knows, every question skippable.
// The words typed go through the shared escalation check before anything is
// saved. The questions and how they are saved live in diagnostic-form.js.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Form = root.MomentumDiagnosticForm;
  var Esc = root.MomentumEscalation;

  // options: { mount, profile, businessId, t, lang, store, onSaved(profile), onBack, answers? }
  function show(options) {
    var t = options.t;
    var mount = options.mount;
    var profile = options.profile;
    var business = profile.businesses.filter(function (b) { return b.id === options.businessId; })[0];
    var values = options.answers || Form.prefill(profile, options.businessId);
    var inputs = {};   // fieldId -> function returning { value, estimate } from the screen
    var errorSlots = {};

    function numberField(f) {
      var v = values[f.id] || {};
      var id = "d-" + f.id;
      var input = el("input", { id: id, type: "text", inputmode: "decimal", dir: "ltr", autocomplete: "off",
        "aria-describedby": id + "-error" });
      input.value = v.value == null ? "" : String(v.value);
      var box = f.estimate ? el("input", { type: "checkbox", id: id + "-estimate" }) : null;
      if (box) box.checked = Boolean(v.estimated || v.estimate);
      inputs[f.id] = function () { return { value: input.value.trim(), estimate: box ? box.checked : false }; };
      var wrapped = f.money ? el("div", { class: "money" }, el("span", { class: "money-sign", "aria-hidden": "true", text: t("shekel") }), input)
        : f.percent ? el("div", { class: "money percent" }, input, el("span", { class: "percent-sign", "aria-hidden": "true", text: "%" }))
        : input;
      return [el("label", { class: "d-label", for: id, text: t("d." + f.id) }), hint(f), wrapped,
        box ? el("label", { class: "estimate", for: id + "-estimate" }, box, el("span", { text: t("estimate") })) : null];
    }

    function textField(f, long) {
      var v = values[f.id] || {};
      var id = "d-" + f.id;
      var input = long ? el("textarea", { id: id, rows: "3" }) : el("input", { id: id, type: "text", autocomplete: "off" });
      input.value = v.value == null ? "" : Array.isArray(v.value) ? v.value.join("\n") : String(v.value);
      inputs[f.id] = function () {
        var text = input.value;
        return { value: f.type === "lines" ? text.split("\n") : text.trim() };
      };
      return [el("label", { class: "d-label", for: id, text: t("d." + f.id) }), hint(f), input];
    }

    function choiceField(f, multi) {
      var v = values[f.id] || {};
      var picked = multi ? (v.value || []).slice() : v.value || null;
      var id = "d-" + f.id;
      var buttons = f.options.map(function (opt) {
        var on = multi ? picked.indexOf(opt) !== -1 : picked === opt;
        var btn = el("button", { type: "button", class: "chip", "aria-pressed": String(on) }, t("d." + f.id + "." + opt));
        btn.addEventListener("click", function () {
          if (multi) {
            var i = picked.indexOf(opt);
            if (i === -1) picked.push(opt); else picked.splice(i, 1);
          } else {
            picked = picked === opt ? null : opt;   // tap again to clear
          }
          buttons.forEach(function (b, j) {
            var o = f.options[j];
            b.setAttribute("aria-pressed", String(multi ? picked.indexOf(o) !== -1 : picked === o));
          });
        });
        return btn;
      });
      inputs[f.id] = function () { return { value: multi ? picked.slice() : picked }; };
      return [el("p", { class: "d-label", id: id + "-label", text: t("d." + f.id) }), hint(f),
        el("div", { class: "module-buttons", role: "group", "aria-labelledby": id + "-label" }, buttons)];
    }

    function debtsField(f) {
      var v = values[f.id] || {};
      var rows = (v.value || []).map(function (d) { return Object.assign({}, d); });
      var list = el("div", { class: "debt-list" });
      var none = el("input", { type: "checkbox", id: "d-noDebts" });
      none.checked = Boolean(v.noDebts || (Array.isArray(v.value) && v.value.length === 0));

      function draw() {
        list.textContent = "";
        rows.forEach(function (d, i) {
          var type = el("input", { type: "text", "aria-label": t("d.debts.type"), placeholder: t("d.debts.type") });
          type.value = d.type === "total" ? t("d.debts.total") : d.type || "";
          type.dataset.original = d.type || "";
          var amount = el("input", { type: "text", inputmode: "decimal", dir: "ltr", "aria-label": t("d.debts.amount") });
          amount.value = d.amount == null ? "" : String(d.amount);
          var overdue = el("input", { type: "checkbox", id: "d-debt-overdue-" + i });
          overdue.checked = Boolean(d.overdue);
          var deadline = el("input", { type: "date", "aria-label": t("d.debts.deadline") });
          deadline.value = d.deadline || "";
          var err = el("p", { class: "q-error", role: "alert" });
          errorSlots["debts." + i] = err;
          d.read = function () {
            // Keep the word "total" from Intake unless the soldier changed it.
            var typed = type.value.trim();
            return { type: typed === t("d.debts.total") ? type.dataset.original : typed,
              amount: amount.value.trim(), overdue: overdue.checked, deadline: deadline.value };
          };
          list.appendChild(el("div", { class: "debt-row" },
            el("label", { class: "d-small" }, el("span", { text: t("d.debts.type") }), type),
            el("div", { class: "d-small" }, el("span", { text: t("d.debts.amount") }),
              el("div", { class: "money" }, el("span", { class: "money-sign", "aria-hidden": "true", text: t("shekel") }), amount)),
            el("label", { class: "d-small" }, el("span", { text: t("d.debts.deadline") }), deadline),
            el("label", { class: "estimate", for: "d-debt-overdue-" + i }, overdue, el("span", { text: t("d.debts.overdue") })),
            err,
            el("button", { type: "button", class: "btn-quiet small", onclick: function () {
              rows.forEach(function (row) { Object.assign(row, row.read()); });   // keep edits in other rows
              rows.splice(i, 1);
              draw();
            } }, t("d.debts.remove"))));
        });
      }
      draw();

      inputs[f.id] = function () {
        var value = rows.map(function (d) { return d.read(); });
        return { value: value, noDebts: none.checked && value.length === 0 };
      };
      return [
        el("label", { class: "estimate", for: "d-noDebts" }, none, el("span", { text: t("d.debts.none") })),
        list,
        el("button", { type: "button", class: "chip", onclick: function () {
          rows.forEach(function (d) { Object.assign(d, d.read()); });
          rows.push({ type: "", amount: "", overdue: false });
          none.checked = false;
          draw();
        } }, "+ " + t("d.debts.add"))
      ];
    }

    function hint(f) {
      var key = "d." + f.id + ".hint";
      return t(key) === key ? null : el("p", { class: "q-hint", text: t(key) });
    }

    function field(f) {
      var parts = f.type === "number" ? numberField(f)
        : f.type === "text" ? textField(f, false)
        : f.type === "longtext" ? textField(f, true)
        : f.type === "lines" ? textField(f, true)
        : f.type === "choice" ? choiceField(f, false)
        : f.type === "multi" ? choiceField(f, true)
        : debtsField(f);
      var err = el("p", { class: "q-error", id: "d-" + f.id + "-error", role: "alert" });
      errorSlots[f.id] = err;
      return el("div", { class: "d-field" }, parts, err);
    }

    function collect() {
      var answers = {};
      Object.keys(inputs).forEach(function (id) { answers[id] = inputs[id](); });
      return answers;
    }

    var sections = Form.SECTIONS.map(function (s) {
      return el("fieldset", { class: "d-section" },
        el("legend", { text: t("diag.s." + s) }),
        Form.FIELDS.filter(function (f) { return f.section === s; }).map(field));
    });

    var formEl = el("form", { class: "diagnostic", novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var answers = collect();
      Object.keys(errorSlots).forEach(function (k) { errorSlots[k].textContent = ""; });
      var errors = Form.check(answers);
      var keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach(function (k) { if (errorSlots[k]) errorSlots[k].textContent = t(errors[k]); });
        var first = errorSlots[keys[0]];
        if (first) first.parentNode.scrollIntoView({ block: "center" });
        return;
      }

      // Shared safety check on everything typed. Level 1 and 2: nothing is
      // saved except the flag, and the handoff screen is shown.
      var check = Esc.checkMessage(Form.typedText(answers), { from: "soldier" });
      var current = profile;
      if (check.level) {
        current = Esc.flagProfile(current, check);
        options.store.save(current);
      }
      if (check.level === 1 || check.level === 2) {
        mount.textContent = "";
        mount.appendChild(root.MomentumHandoffUI.build(check.level, t, function () {
          show(Object.assign({}, options, { profile: current, answers: answers }));
        }));
        window.scrollTo(0, 0);
        mount.querySelector("h1").focus();
        return;
      }

      var result = options.store.save(Form.apply(current, options.businessId, answers));
      if (!result.ok) {
        saveError.textContent = t("saveError");
        if (root.console) console.warn("Diagnostic not saved", result.errors);
        return;
      }
      options.onSaved(result.profile);
    } });

    var saveError = el("p", { class: "q-error", role: "alert" });
    formEl.appendChild(el("div", { class: "d-sections" }, sections));
    formEl.appendChild(saveError);
    formEl.appendChild(el("div", { class: "actions" },
      el("button", { type: "submit", class: "btn-primary", text: t("d.save") }),
      el("button", { type: "button", class: "btn-quiet", text: t("nav.backNoSave"), onclick: options.onBack })));

    mount.textContent = "";
    mount.appendChild(el("div", { class: "message" },
      el("h1", { tabindex: "-1", text: fill(t("diag.title"), { business: business.name || fill(t("businessN"), { n: 1 }) }) }),
      el("p", { class: "lead", text: t("diag.lead") }),
      formEl));
    window.scrollTo(0, 0);
    mount.querySelector("h1").focus();
  }

  root.MomentumDiagnosticUI = { show: show };
})(this);
