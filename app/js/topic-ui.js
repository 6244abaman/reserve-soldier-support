// A conversation about one topic (pricing, cash flow and debt, new customers,
// customer follow-up, benefits and grants, staff, time and capacity) with that
// module's agent, through the proxy. The module asks one question at a time.
// "Finish and save" asks for a short summary and at most three actions; the
// soldier confirms before anything is saved. Each message the soldier writes
// goes through the shared escalation check first. The conversation itself is
// never stored, only the confirmed summary and actions.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Esc = root.MomentumEscalation;
  var R = root.MomentumAgentResults;
  var LONG = 34; // messages; the proxy accepts 40, so finish before that

  // ctx: { mount, t, lang, store, profile, businessId, topic, onDone(profile), onBack }
  function show(ctx) {
    var t = ctx.t;
    var profile = ctx.profile;
    var business = (profile.businesses || []).filter(function (b) { return b.id === ctx.businessId; })[0];
    var name = (business && business.name) || fill(t("businessN"), { n: 1 });
    var topicName = t("mod." + ctx.topic);
    var messages = [{ role: "user", content: fill(t("topic.open"), { topic: topicName, business: name }) }];
    var waiting = false;
    var problem = null;

    function save(p) {
      var r = ctx.store.save(p);
      if (r.ok) profile = r.profile;
      return r.ok;
    }

    function bubble(m, i) {
      var mine = m.role === "user";
      return el("li", { class: "bubble " + (mine ? "mine" : "theirs") },
        el("span", { class: "who", text: t(mine ? "topic.you" : "topic.agent") }),
        el("p", { text: m.content }));
    }

    function render(focusInput) {
      var input = el("textarea", { id: "topic-input", rows: "3", placeholder: t("topic.placeholder"), "aria-label": t("topic.placeholder") });
      var tooLong = messages.length >= LONG;
      var hasReply = messages.some(function (m) { return m.role === "assistant"; });
      var form = el("form", { class: "chat-form", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text || waiting) return;
        var check = Esc.checkMessage(text, { from: "soldier" });
        if (check.level) { profile = Esc.flagProfile(profile, check); save(profile); }
        if (check.level === 1 || check.level === 2) {
          ctx.mount.textContent = "";
          ctx.mount.appendChild(root.MomentumHandoffUI.build(check.level, t, function () { render(true); }));
          window.scrollTo(0, 0);
          ctx.mount.querySelector("h1").focus();
          return;
        }
        messages.push({ role: "user", content: text });
        send();
      } },
        input,
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", disabled: waiting || tooLong, text: t("ai.send") }),
          hasReply ? el("button", { type: "button", class: "btn-quiet", disabled: waiting, text: t("topic.finish"), onclick: finish }) : null));

      ctx.mount.textContent = "";
      ctx.mount.appendChild(el("div", { class: "message chat" },
        el("h1", { tabindex: "-1", text: fill(t("router.module." + ctx.topic), { business: name }) }),
        el("ol", { class: "bubbles", "aria-live": "polite" },
          messages.map(bubble),
          waiting ? el("li", { class: "bubble theirs" }, el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")),
            el("span", { class: "sr-only", text: t("ai.loading") })) : null),
        problem ? el("div", { class: "chat-problem", role: "alert" }, el("p", { text: t(problem) }),
          el("button", { type: "button", class: "btn-quiet small", text: t("ai.retry"), onclick: send })) : null,
        tooLong ? el("p", { class: "soft-note", text: t("topic.long") }) : null,
        form,
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn-quiet", text: t("nav.backNoSave"), onclick: ctx.onBack }))));

      var list = ctx.mount.querySelector(".bubbles");
      if (list.lastElementChild) list.lastElementChild.scrollIntoView({ block: "end" });
      if (focusInput && !waiting) input.focus({ preventScroll: true });
    }

    function send() {
      waiting = true;
      problem = null;
      render(false);
      root.MomentumProxy.ask({ agent: ctx.topic, profile: profile, businessId: ctx.businessId, messages: messages, language: ctx.lang() })
        .then(function (out) {
          waiting = false;
          if (out.kind === "handoff") {
            messages.pop(); // that message is not kept in the conversation
            profile = Esc.flagProfile(profile, { level: out.level, label: out.label || "Flagged", from: "soldier" });
            save(profile);
            ctx.mount.textContent = "";
            ctx.mount.appendChild(root.MomentumHandoffUI.build(out.level, t, function () { render(true); }));
            return;
          }
          if (out.kind === "error") { problem = "ai.err." + out.reason; return render(false); }
          if (out.kind === "refused") { problem = "ai.refused"; return render(false); }
          if (out.escalation) { profile = Esc.flagProfile(profile, Object.assign({ from: "soldier" }, out.escalation)); save(profile); }
          messages.push({ role: "assistant", content: out.reply || "…" });
          render(true);
        });
    }

    function finish() {
      root.MomentumAgentUI.converse(Object.assign({}, ctx, { profile: profile }), {
        agent: ctx.topic, task: "topic", businessId: ctx.businessId,
        messages: messages.concat([{ role: "user", content: t("topic.finishAsk") }]),
        title: fill(t("topic.summaryTitle"), { topic: topicName }),
        question: t("topic.question"),
        confirmKey: "topic.confirm", changeKey: "ai.changePlan",
        render: function (r) {
          return el("div", { class: "agent-answer" },
            el("p", { class: "lead", text: r.summary || "" }),
            (r.actions || []).length ? el("h2", { text: t("topic.actions") }) : null,
            el("ul", { class: "plan-actions" }, (r.actions || []).slice(0, 3).map(function (a) {
              var due = root.MomentumAgentUI.formatDate(a.dueDate, ctx.lang());
              return el("li", null, el("span", { text: a.action }),
                due ? el("span", { class: "due", text: fill(t("ai.plan.due"), { date: due }) }) : null);
            })));
        },
        apply: function (p, r) {
          return { ok: true, profile: R.applyTopic(p, ctx.businessId, ctx.topic, r, root.MomentumAgentUI.today()) };
        }
      });
    }

    send();
  }

  root.MomentumTopicUI = { show: show };
})(this);
