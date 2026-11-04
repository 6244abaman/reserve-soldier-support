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
      onOpen: showAgent
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
      onDone: function (saved) { current = saved; showNextStep(null); },
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
      else if (view.name === "diagnostic") showDiagnostic(view.businessId);
      else if (view.name === "agent") showNextStep(null);   // do not re-send to Claude just for a language switch
      else window.MomentumIntakeUI.render();
      renderTesting();
    });
  });

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
