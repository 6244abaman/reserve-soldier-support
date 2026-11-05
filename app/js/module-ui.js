// The chat screen for a specific topic (the modules: pricing, cash flow and
// debt, new customers, customer follow-up, benefits and grants, staff, time
// and capacity). The soldier asks in their own words and the module answers
// through the proxy. When they are done, they go back to their next step in
// the main flow, exactly where they left off.
//
// Every message goes through the shared escalation check first (Level 1 and 2
// open the handoff screen). The conversation is kept only while the screen is
// open: nothing from it is saved, apart from a safety flag when one is raised.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;
  var fill = root.MomentumDom.fill;
  var Esc = root.MomentumEscalation;
  var Chat = root.MomentumModuleChat;

  // A fresh conversation. app.js keeps it, so a language switch does not lose it.
  function newState() {
    return { messages: [], pending: false, error: null, canRetry: false, draft: "", open: true, render: null };
  }

  function businessOf(profile, id) {
    return (profile.businesses || []).filter(function (b) { return b.id === id; })[0] || null;
  }

  function replyNode(text) {
    return Chat.parseReply(text).map(function (b) {
      if (b.type === "p") return el("p", { text: b.text });
      return el(b.type, null, b.items.map(function (item) { return el("li", { text: item }); }));
    });
  }

  // Copies a reply, so the soldier can keep it or paste a draft into their own messages.
  function copyButton(text, t) {
    if (!navigator.clipboard) return null;
    var btn = el("button", { type: "button", class: "copy", text: t("chat.copy") });
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = t("chat.copied");
        setTimeout(function () { btn.textContent = t("chat.copy"); }, 2000);
      }, function () { /* copying blocked: nothing to do */ });
    });
    return btn;
  }

  // ctx: { mount, t, lang(), store, profile, agent, businessId, state, onSaved(profile), onBack }
  function show(ctx) {
    var t = ctx.t;
    var state = ctx.state;
    var profile = ctx.profile;
    var business = businessOf(profile, ctx.businessId);
    var name = (business && business.name) || fill(t("businessN"), { n: 1 });
    var title = fill(t("router.module." + ctx.agent), { business: name });
    var first = true;

    function save(p) {
      var r = ctx.store.save(p);
      if (r.ok) { profile = r.profile; ctx.onSaved(profile); }
      else if (root.console) console.warn("Not saved", r.errors);
    }

    function flag(check) {
      profile = Esc.flagProfile(profile, Object.assign({ from: "soldier" }, check));
      save(profile);
    }

    function handoff(level, label) {
      flag({ level: level, label: label || "Flagged" });
      ctx.mount.textContent = "";
      ctx.mount.appendChild(root.MomentumHandoffUI.build(level, t, function () { first = true; render(); }));
      window.scrollTo(0, 0);
      ctx.mount.querySelector("h1").focus();
    }

    function bubble(m) {
      var mine = m.role === "user";
      return el("div", { class: "bubble " + (mine ? "from-me" : "from-momentum") },
        el("p", { class: "bubble-who", text: t(mine ? "chat.you" : "chat.momentum") }),
        el("div", { class: "bubble-text", dir: "auto" }, mine ? el("p", { text: m.content }) : replyNode(m.content)),
        mine ? null : copyButton(m.content, t));
    }

    function render() {
      if (!state.open) return;
      var box = el("textarea", { id: "chat-text", rows: "3", placeholder: t("chat.example." + ctx.agent) });
      box.value = state.draft;
      box.addEventListener("input", function () { state.draft = box.value; });
      var err = el("p", { class: "q-error", role: "alert" });

      var log = el("div", { class: "chat-log", role: "log", "aria-live": "polite" },
        state.messages.map(bubble),
        state.pending ? el("div", { class: "thinking", role: "status" },
          el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")), t("chat.thinking")) : null);

      var problem = state.error ? el("div", { class: "chat-problem" },
        el("p", { class: "lead", text: t(state.error) }),
        state.canRetry ? el("div", { class: "actions" },
          el("button", { type: "button", class: "btn-primary", text: t("ai.retry"), onclick: call })) : null) : null;

      var form = el("form", { class: "chat-form", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var text = box.value.trim();
        if (!text || state.pending) return;
        if (Chat.tooLong(text)) { err.textContent = t("chat.tooLong"); return; }
        var check = Esc.checkMessage(text, { from: "soldier" });
        if (check.level === 1 || check.level === 2) { state.draft = ""; return handoff(check.level, check.label); }
        if (check.level === 3) flag(check);
        state.messages.push({ role: "user", content: text });
        state.draft = "";
        call();
      } },
        el("label", { class: "d-label", for: "chat-text", text: t(state.messages.length ? "chat.labelMore" : "chat.label") }),
        box, err,
        el("div", { class: "actions" },
          el("button", { type: "submit", class: "btn-primary", text: t("ai.send"), disabled: state.pending })));

      ctx.mount.textContent = "";
      ctx.mount.appendChild(el("div", { class: "message module-chat" },
        el("h1", { tabindex: "-1", text: title }),
        state.messages.length ? null : el("p", { class: "lead", text: t("chat.lead") }),
        el("p", { class: "soft-note", text: t(ctx.agent === "benefits_grants" ? "chat.noteBenefits" : "chat.note") }),
        log, problem,
        state.pending || (state.error && state.canRetry) ? null : form,
        el("div", { class: "actions" },
          el("button", { type: "button", class: "btn-quiet", text: t("chat.done"), onclick: function () {
            state.open = false;
            ctx.onBack();
          } }))));

      if (first) {
        first = false;
        window.scrollTo(0, 0);
        ctx.mount.querySelector("h1").focus();
      } else {
        var last = log.lastElementChild;
        if (last && last.scrollIntoView) last.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
    state.render = render;

    function call() {
      state.pending = true;
      state.error = null;
      render();
      root.MomentumProxy.ask({
        agent: ctx.agent, profile: profile, businessId: ctx.businessId,
        messages: Chat.forSending(state.messages), language: ctx.lang()
      }).then(function (out) {
        state.pending = false;
        if (out.kind === "handoff") {
          state.messages.pop();
          if (state.open) return handoff(out.level, out.label);
          return;
        }
        if (out.kind === "refused") { state.messages.pop(); state.error = "ai.refused"; state.canRetry = false; }
        else if (out.kind === "error") { state.error = "ai.err." + out.reason; state.canRetry = out.reason !== "notConnected"; }
        else {
          if (out.escalation) flag(out.escalation);
          state.messages.push({ role: "assistant", content: out.reply || t("ai.err.incomplete") });
        }
        if (state.render) state.render();
      });
    }

    render();
  }

  root.MomentumModuleUI = { show: show, newState: newState };
})(this);
