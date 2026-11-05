// The screen shown when the shared escalation check finds Level 1 or 2
// (reference/escalation-rules.md). Shared by every screen that takes typed
// answers, so the wording and behaviour are the same everywhere.
//   Level 1: warm words, the contacts line, and a quiet way back that the
//            soldier chooses; no business topics are pushed.
//   Level 2: a person should look at this; no legal or financial advice.
// The mentor is emailed (mentor-alert.js). At Level 1 the phone number is
// shared for safety, and the screen says so. At Level 2 the soldier chooses.
(function (root) {
  "use strict";

  var el = root.MomentumDom.el;

  // Returns the screen as an element. onBack runs when the soldier chooses to go back.
  function build(level, t, onBack) {
    var k = "h" + level + ".";
    return el("div", { class: "message handoff level-" + level, role: "alert" },
      el("h1", { tabindex: "-1", text: t(k + "title") }),
      el("p", { class: "lead", text: t(k + "body") }),
      level === 1 ? el("p", { class: "contacts", text: t("h1.contacts") }) : null,
      el("p", { text: t(k + "mentor") }),
      level === 1 ? el("p", { class: "soft-note", text: t("h1.shared") }) : null,
      level === 2 && root.MomentumHandoffConsent ? consent(t) : null,
      el("div", { class: "actions" }, el("button", {
        type: "button",
        class: level === 1 ? "btn-quiet" : "btn-primary",
        text: t(level === 1 ? "h1.back" : "h2.continue"),
        onclick: onBack
      })));
  }

  // Level 2: "The mentor may have my phone number." One tap, and it is said back.
  function consent(t) {
    var note = el("p", { class: "soft-note", role: "status" });
    var btn = el("button", { type: "button", class: "btn-quiet", text: t("h2.share") });
    btn.addEventListener("click", function () {
      var ok = root.MomentumHandoffConsent();
      if (!ok) return;
      btn.hidden = true;
      note.textContent = t("h2.shared");
    });
    return el("div", { class: "handoff-consent" }, btn, note);
  }

  root.MomentumHandoffUI = { build: build };
})(this);
