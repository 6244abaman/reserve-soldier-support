// The screens where Claude's agents answer, through the proxy:
//   findings  (Diagnostic): what the answers show, up to three problems
//   plan      (Recovery Planning): up to three priorities with dated actions
//   checkin   (Accountability): weekly statuses in, next week's actions out
// Each works the same way: send, show the answer, and the soldier either
// confirms it (then it is saved) or says what is off (then it is revised).
// Nothing is saved until the soldier confirms. Every word the soldier types
// goes through the shared escalation check first.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Esc = root.MomentumEscalation;
  var R = root.MomentumAgentResults;
  var Acc = root.MomentumAccountability;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDate(iso, lang) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "long" });
  }

  function businessOf(profile, id) {
    return (profile.businesses || []).filter(function (b) { return b.id === id; })[0] || null;
  }

  // ---------- shared conversation loop ----------

  // spec: { agent, task, businessId, firstMessage, title, render(result), question,
  //         confirmKey, changeKey, apply(profile, result) -> { ok, profile } }
  // ctx:  { mount, t, lang, store, profile, onDone(profile), onBack }
  function converse(ctx, spec) {
    var t = ctx.t;
    var profile = ctx.profile;
    var messages = [{ role: "user", content: spec.firstMessage }];

    function screen(children) {
      ctx.mount.textContent = "";
      ctx.mount.appendChild(el("div", { class: "message agent-screen" }, children));
      window.scrollTo(0, 0);
      var h = ctx.mount.querySelector("h1");
      if (h) h.focus();
    }

    function save(p) {
      var r = ctx.store.save(p);
      if (r.ok) profile = r.profile;
      else if (root.console) console.warn("Not saved", r.errors);
      return r.ok;
    }

    function handoff(level, label, back) {
      profile = Esc.flagProfile(profile, { level: level, label: label || "Flagged", from: "soldier" });
      save(profile);
      ctx.mount.textContent = "";
      ctx.mount.appendChild(root.MomentumHandoffUI.build(level, t, back));
      window.scrollTo(0, 0);
      ctx.mount.querySelector("h1").focus();
    }

    function call() {
      screen([
        el("h1", { tabindex: "-1", text: spec.title }),
        el("div", { class: "thinking", role: "status" }, el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")), t("ai.loading"))
      ]);
      root.MomentumProxy.ask({
        agent: spec.agent, task: spec.task, profile: profile, businessId: spec.businessId,
        messages: messages, language: ctx.lang()
      }).then(function (out) {
        if (out.kind === "handoff") return handoff(out.level, out.label, ctx.onBack);
        if (out.kind === "refused") return problem("ai.refused", false);
        if (out.kind === "error") return problem("ai.err." + out.reason, out.reason !== "notConnected");
        if (out.escalation) { profile = Esc.flagProfile(profile, Object.assign({ from: "soldier" }, out.escalation)); save(profile); }
        review(out.result);
      });
    }

    function problem(key, canRetry) {
      screen([
        el("h1", { tabindex: "-1", text: spec.title }),
        el("p", { class: "lead", text: t(key) }),
        el("div", { class: "actions" },
          canRetry ? el("button", { type: "button", class: "btn-primary", text: t("ai.retry"), onclick: call }) : null,
          el("button", { type: "button", class: "btn-quiet", text: t("nav.home"), onclick: ctx.onBack }))
      ]);
    }

    function review(result) {
      var changeBox = el("textarea", { id: "ai-change", rows: "3" });
      var changeErr = el("p", { class: "q-error", role: "alert" });
      var changeForm = el("form", { class: "change-form", hidden: true, novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var text = changeBox.value.trim();
        if (!text) return;
        var check = Esc.checkMessage(text, { from: "soldier" });
        if (check.level === 1 || check.level === 2) return handoff(check.level, check.label, function () { review(result); });
        if (check.level === 3) { profile = Esc.flagProfile(profile, check); save(profile); }
        messages.push({ role: "assistant", content: JSON.stringify(result) });
        messages.push({ role: "user", content: text });
        call();
      } },
        el("label", { class: "d-label", for: "ai-change", text: t("ai.changeLabel") }),
        changeBox, changeErr,
        el("div", { class: "actions" }, el("button", { type: "submit", class: "btn-primary", text: t("ai.send") })));

      var level = R.escalationLevel(result);
      screen([
        el("h1", { tabindex: "-1", text: spec.title }),
        spec.render(result),
        el("p", { class: "ask", text: spec.question }),
        el("div", { class: "actions" },
          el("button", { type: "button", class: "btn-primary", text: t(spec.confirmKey), onclick: function () {
            var applied = spec.apply(profile, result);
            if (!applied.ok) { changeErr.textContent = t("ai.err.other"); return; }
            var p = R.flagFromResult(applied.profile, result);
            if (!save(p)) { changeErr.textContent = t("saveError"); return; }
            // The agent saw something a person should look at (Level 1 or 2).
            if (level === 1 || level === 2) return handoff(level, result.escalationReason, function () { ctx.onDone(profile); });
            ctx.onDone(profile);
          } }),
          el("button", { type: "button", class: "btn-quiet", text: t(spec.changeKey), onclick: function () {
            changeForm.hidden = false;
            changeBox.focus();
          } })),
        changeForm
      ]);
    }

    call();
  }

  // ---------- findings ----------

  function findings(ctx) {
    var t = ctx.t;
    var b = businessOf(ctx.profile, ctx.businessId);
    var name = b.name || fill(t("businessN"), { n: 1 });
    converse(ctx, {
      agent: "diagnostic", task: "findings", businessId: ctx.businessId,
      firstMessage: fill(t("ai.findings.ask"), { business: name }),
      title: fill(t("ai.findings.title"), { business: name }),
      question: t("ai.findings.question"),
      confirmKey: "ai.findings.confirm", changeKey: "ai.change",
      render: function (r) {
        var problems = (r.topProblems || []).slice(0, 3);
        return el("div", { class: "agent-answer" },
          el("p", { class: "lead", text: r.summary || "" }),
          problems.length ? el("h2", { text: t("ai.findings.problems") }) : null,
          el("ol", { class: "problems" }, problems.map(function (p) {
            return el("li", { class: "problem" },
              el("p", { class: "problem-title", text: p.problem }),
              p.evidence ? el("p", { class: "problem-evidence", text: p.evidence }) : null,
              el("div", { class: "tags" },
                p.urgent ? el("span", { class: "tag urgent", text: t("ai.findings.urgent") }) : null,
                el("span", { class: "tag", text: t("ai.conf." + (p.confidence || "low")) })));
          })),
          (r.unknowns || []).length ? el("section", { class: "unknowns" },
            el("h2", { text: t("ai.findings.unknowns") }),
            el("ul", null, r.unknowns.map(function (u) { return el("li", { text: u }); }))) : null);
      },
      apply: function (profile, r) {
        return { ok: true, profile: R.applyFindings(profile, ctx.businessId, r, new Date().toISOString()) };
      }
    });
  }

  // ---------- plan ----------

  function plan(ctx) {
    var t = ctx.t;
    var b = businessOf(ctx.profile, ctx.businessId);
    var name = b.name || fill(t("businessN"), { n: 1 });
    converse(ctx, {
      agent: "recovery_plan", task: "plan", businessId: ctx.businessId,
      firstMessage: fill(t("ai.plan.ask"), { business: name }),
      title: fill(t("ai.plan.title"), { business: name }),
      question: t("ai.plan.question"),
      confirmKey: "ai.plan.confirm", changeKey: "ai.changePlan",
      render: function (r) {
        return el("div", { class: "agent-answer" },
          el("p", { class: "lead", text: r.summary || "" }),
          el("ol", { class: "priorities" }, (r.priorities || []).slice(0, 3).map(function (pr) {
            return el("li", { class: "priority" },
              el("h2", { text: pr.goal }),
              el("ul", { class: "plan-actions" }, (pr.actions || []).slice(0, 4).map(function (a) {
                var due = formatDate(a.dueDate, ctx.lang());
                return el("li", null, el("span", { text: a.action }),
                  due ? el("span", { class: "due", text: fill(t("ai.plan.due"), { date: due }) }) : null);
              })),
              pr.successMeasure ? el("p", { class: "measure" }, el("strong", { text: t("ai.plan.measure") + " " }), pr.successMeasure) : null);
          })),
          (r.openQuestions || []).length ? el("section", { class: "unknowns" },
            el("h2", { text: t("ai.plan.questions") }),
            el("ul", null, r.openQuestions.map(function (q) { return el("li", { text: q }); }))) : null);
      },
      apply: function (profile, r) { return { ok: true, profile: R.applyPlan(profile, ctx.businessId, r) }; }
    });
  }

  // ---------- weekly check-in ----------

  var STATUS_CHOICES = ["done", "in_progress", "blocked", "dropped"];

  function checkin(ctx) {
    var t = ctx.t;
    var week = Acc.weeklyActions(ctx.profile);
    var rows = week.map(function (a, i) {
      var picked = null;
      var note = el("input", { type: "text", id: "ci-note-" + i, autocomplete: "off" });
      var buttons = STATUS_CHOICES.map(function (s) {
        var btn = el("button", { type: "button", class: "chip", "aria-pressed": "false" }, t("ai.status." + s));
        btn.addEventListener("click", function () {
          picked = picked === s ? null : s;
          buttons.forEach(function (x, j) { x.setAttribute("aria-pressed", String(STATUS_CHOICES[j] === picked)); });
        });
        return btn;
      });
      var due = formatDate(a.dueDate, ctx.lang());
      return {
        action: a,
        read: function () { return { ref: { businessId: a.businessId, priority: a.priority, index: a.index }, action: a.action, status: picked, note: note.value.trim() }; },
        node: el("li", { class: "checkin-row" },
          el("p", { class: "problem-title", id: "ci-label-" + i, text: a.action }),
          el("p", { class: "problem-evidence", text: a.businessName + (due ? " · " + fill(t("ai.plan.due"), { date: due }) : "") }),
          el("div", { class: "module-buttons", role: "group", "aria-labelledby": "ci-label-" + i }, buttons),
          el("label", { class: "d-small", for: "ci-note-" + i }, el("span", { text: t("ai.checkin.note") }), note))
      };
    });
    var more = el("textarea", { id: "ci-more", rows: "3" });

    ctx.mount.textContent = "";
    ctx.mount.appendChild(el("div", { class: "message" },
      el("h1", { tabindex: "-1", text: t("ai.checkin.title") }),
      el("p", { class: "lead", text: t(week.length ? "ai.checkin.lead" : "ai.checkin.none") }),
      el("form", { class: "diagnostic", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var reports = rows.map(function (r) { return r.read(); });
        var lines = reports.map(function (r) {
          var b = businessOf(ctx.profile, r.ref.businessId);
          return "- " + r.action + " (" + ((b && b.name) || r.ref.businessId) + "): " +
            (r.status ? t("ai.status." + r.status) : t("ai.checkin.noStatus")) + (r.note ? " - " + r.note : "");
        });
        var extra = more.value.trim();
        var message = [t("ai.checkin.intro")].concat(lines, extra ? [fill(t("ai.checkin.moreLine"), { text: extra })] : []).join("\n");
        start(reports, message, reports.map(function (r) { return r.note; }).concat(extra).join("\n"));
      } },
        el("ol", { class: "problems" }, rows.map(function (r) { return r.node; })),
        el("label", { class: "d-label", for: "ci-more", text: t("ai.checkin.more") }), more,
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", text: t("ai.send") }),
          el("button", { type: "button", class: "btn-quiet", text: t("nav.backNoSend"), onclick: ctx.onBack })))));
    window.scrollTo(0, 0);
    ctx.mount.querySelector("h1").focus();

    function start(reports, message, typed) {
      var check = Esc.checkMessage(typed, { from: "soldier" });
      if (check.level === 1 || check.level === 2) {
        var p = Esc.flagProfile(ctx.profile, check);
        ctx.store.save(p);
        ctx.mount.textContent = "";
        ctx.mount.appendChild(root.MomentumHandoffUI.build(check.level, t, function () { checkin(Object.assign({}, ctx, { profile: p })); }));
        return;
      }
      converse(ctx, {
        agent: "accountability", task: "checkin", businessId: null,
        firstMessage: message,
        title: t("ai.checkin.resultTitle"),
        question: "",
        confirmKey: "ai.checkin.confirm", changeKey: "ai.changePlan",
        render: function (r) {
          return el("div", { class: "agent-answer" },
            el("p", { class: "lead", text: r.summary || "" }),
            r.planNeedsReview ? el("p", { class: "tag urgent", text: t("ai.checkin.review") }) : null,
            (r.nextActions || []).length ? el("h2", { text: t("ai.checkin.next") }) : null,
            el("ul", { class: "plan-actions" }, (r.nextActions || []).slice(0, 3).map(function (a) {
              var b = businessOf(ctx.profile, a.businessId);
              var due = formatDate(a.dueDate, ctx.lang());
              return el("li", null, el("span", { text: a.action }),
                el("span", { class: "due", text: ((b && b.name) || "") + (due ? " · " + fill(t("ai.plan.due"), { date: due }) : "") }));
            })));
        },
        apply: function (profile, r) { return R.applyCheckIn(profile, reports, r, today()); }
      });
    }
  }

  root.MomentumAgentUI = { findings: findings, plan: plan, checkin: checkin };
})(this);
