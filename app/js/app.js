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

  function showNextStep(request) {
    view = { name: "next", request: request || null };
    window.MomentumNextStepUI.show({
      mount: mount,
      profile: window.MomentumIntakeUI.profile(),
      t: t,
      request: view.request,
      testing: TESTING,
      onBack: function () { view = { name: "intake" }; window.MomentumIntakeUI.showSummary(); }
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
      var profile = window.MomentumIntakeUI.profile();
      if (profile && profile.person && profile.person.phone) store.remove(profile.person.phone);
      try { localStorage.removeItem("momentum.intake"); } catch (e) { /* fine */ }
      location.reload();
    });
    testingBar.appendChild(btn);
  }

  renderTesting();
})();
