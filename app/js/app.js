// Starts the app: language (Hebrew, right to left, by default), saved profile
// storage, the Intake screens, and the next step chosen by the Router.
(function () {
  // Testing mode shows the "Start over" button and the Router's details.
  // TURN THIS OFF (false) before real soldiers use the app.
  var TESTING = true;

  var STRINGS = window.MOMENTUM_I18N;
  var LANG_KEY = "momentum.lang";
  var root = document.documentElement;
  var mount = document.getElementById("app");
  var lang = "he";
  var view = { name: "intake", request: null };

  function readLang() {
    try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; }
  }

  function saveLang(value) {
    try { localStorage.setItem(LANG_KEY, value); } catch (e) { /* storage blocked: still works this visit */ }
  }

  // Returns the text for a key in the current language; the key itself if missing.
  function t(key) {
    var text = STRINGS[lang][key];
    return text == null ? key : text;
  }

  function applyLang(value) {
    lang = value;
    root.lang = value;
    root.dir = value === "he" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === value));
    });
  }

  var stored = readLang();
  applyLang(STRINGS[stored] ? stored : "he");

  var store = window.MomentumStorage.createProfileStore({
    schema: window.MomentumProfileSchema,
    validator: window.MomentumValidate
  });
  // Every save checks for a new safety flag and emails the mentor (Phase 9).
  window.MomentumMentorAlert.watch(store);
  // Level 2 screen: the soldier agrees to share their phone with the mentor.
  window.MomentumHandoffConsent = function () {
    var p = profile();
    if (!p || !p.person || !p.person.phone) return false;
    // The screen that raised the flag saved it; start from that saved copy.
    var latest = store.load(p.person.phone);
    var r = store.approveMentorContact((latest.ok && latest.profile) || p);
    if (r.ok) current = r.profile;
    return r.ok;
  };

  // The latest saved profile (Intake keeps its own copy while it runs).
  var current = null;
  function profile() { return current || window.MomentumIntakeUI.profile(); }

  function showNextStep(request) {
    view = { name: "next", request: request || null };
    window.MomentumNextStepUI.show({
      mount: mount,
      profile: profile(),
      t: t,
      request: view.request,
      testing: TESTING,
      onBack: function () {
        var latest = profile();
        view = { name: "intake" };
        current = null;
        window.MomentumIntakeUI.showSummary(latest);
      },
      onOpenDiagnostic: showDiagnostic,
      onOpen: showAgent,
      onOpenTopic: showTopic,
      lang: function () { return lang; },
      onCallUp: showCallUp,
      onReturn: function () { saveAndHome(window.MomentumReserveDuty.markReturn(profile(), today())); },
      onReturnChoice: returnChoice,
      onLightMessage: function (on) { saveOnly(window.MomentumReserveDuty.setLightMessage(profile(), on)); },
      cover: {
        onEdit: showCoverSetup,
        onBrief: showCoverBrief,
        onEnd: function () { saveAndHome(window.MomentumCover.endAccess(profile(), today())); }
      }
    });
  }

  // ---------- Cover Person (Phase 7b) ----------

  function showCoverSetup() {
    view = { name: "cover" };
    window.MomentumCoverUI.setupForm({
      mount: mount, t: t, lang: function () { return lang; }, profile: profile(),
      onSave: function (p) { if (saveOnly(p)) showCoverBrief(); },
      onFlag: saveOnly,
      onBack: function () { showNextStep(null); }
    });
  }

  function showCoverBrief() {
    view = { name: "brief" };
    window.MomentumCoverUI.briefScreen({
      mount: mount, t: t, lang: function () { return lang; }, profile: profile(),
      onSave: function (p) { return saveOnly(p) ? current : null; },
      onFlag: saveOnly,
      onBack: function () { showNextStep(null); }
    });
  }

  // ---------- Reserve duty (Phase 7) ----------

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function saveOnly(p) {
    var r = store.save(p);
    if (r.ok) current = r.profile;
    else if (window.console) console.warn("Not saved", r.errors);
    return r.ok;
  }

  function saveAndHome(p) { saveOnly(p); showNextStep(null); }

  // After a "fresh look" on return, the new findings lead straight to a new plan.
  var planAfterFindings = null;

  function showCallUp() {
    view = { name: "callup" };
    window.MomentumReserveDutyUI.callUpForm({
      mount: mount, t: t, lang: function () { return lang; }, profile: profile(),
      onSave: saveAndHome,
      onBack: function () { showNextStep(null); }
    });
  }

  function returnChoice(choice, businessId) {
    var RD = window.MomentumReserveDuty;
    if (choice === "pick_up") return saveAndHome(RD.pickUp(profile()));
    saveOnly(RD.finishReturn(profile()));
    if (choice === "new_plan") return showAgent("plan", businessId);
    planAfterFindings = businessId;           // fresh_look: the Diagnostic form first
    showDiagnostic(businessId);
  }

  // A conversation about one topic with that module's agent.
  function showTopic(topic, businessId) {
    view = { name: "topic" };
    window.MomentumTopicUI.show({
      mount: mount,
      t: t,
      lang: function () { return lang; },
      store: store,
      profile: profile(),
      businessId: businessId,
      topic: topic,
      onDone: function (saved) { current = saved; showNextStep(null); },
      onBack: function () { showNextStep(null); }
    });
  }

  // findings, plan, or checkin, answered by Claude through the proxy.
  function showAgent(step, businessId) {
    view = { name: "agent", step: step, businessId: businessId };
    window.MomentumAgentUI[step]({
      mount: mount,
      t: t,
      lang: function () { return lang; },
      store: store,
      profile: profile(),
      businessId: businessId,
      onDone: function (saved) {
        current = saved;
        if (step === "findings" && planAfterFindings === businessId) { planAfterFindings = null; return showAgent("plan", businessId); }
        showNextStep(null);
      },
      onBack: function () { showNextStep(null); }
    });
  }

  function showDiagnostic(businessId) {
    view = { name: "diagnostic", businessId: businessId };
    window.MomentumDiagnosticUI.show({
      mount: mount,
      profile: profile(),
      businessId: businessId,
      t: t,
      store: store,
      onSaved: function (saved) { current = saved; showNextStep(null); },
      onBack: function () { showNextStep(null); }
    });
  }

  window.MomentumIntakeUI.start({
    mount: mount,
    store: store,
    t: t,
    lang: function () { return lang; },
    chartTemplate: document.getElementById("comeback-chart"),
    onContinue: function () { showNextStep(null); }
  });

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.dataset.lang);
      saveLang(btn.dataset.lang);
      if (view.name === "next") showNextStep(view.request);
      else if (view.name === "callup") showCallUp();
      else if (view.name === "cover") showCoverSetup();
      else if (view.name === "brief") showCoverBrief();
      else if (view.name === "diagnostic") showDiagnostic(view.businessId);
      else if (view.name === "agent" || view.name === "topic") showNextStep(null);   // do not re-send to Claude just for a language switch
      else window.MomentumIntakeUI.render();
      renderTesting();
      updateHome();
    });
  });

  // ---------- Home button ----------
  // Shown once Intake is finished; always leads to the page with the next step.

  var homeBtn = document.getElementById("home-btn");

  function updateHome() {
    var p = profile();
    homeBtn.hidden = !(p && p.meta && p.meta.intakeComplete);
    homeBtn.setAttribute("aria-label", t("nav.homeLabel"));
  }

  homeBtn.addEventListener("click", function () { showNextStep(null); });
  new MutationObserver(updateHome).observe(mount, { childList: true });
  updateHome();

  // ---------- Testing only: Start over ----------

  var testingBar = document.getElementById("testing-bar");
  var armed = false;

  function renderTesting() {
    if (!TESTING || !testingBar) return;
    testingBar.hidden = false;
    testingBar.textContent = "";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reset" + (armed ? " is-armed" : "");
    btn.textContent = t(armed ? "test.resetConfirm" : "test.reset");
    btn.addEventListener("click", function () {
      if (!armed) { armed = true; renderTesting(); return; }
      var p = profile();
      if (p && p.person && p.person.phone) store.remove(p.person.phone);
      try { localStorage.removeItem("momentum.intake"); } catch (e) { /* fine */ }
      location.reload();
    });
    testingBar.appendChild(btn);
  }

  renderTesting();
})();
