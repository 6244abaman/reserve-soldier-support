// Starts the app: language (Hebrew, right to left, by default), saved profile
// storage, and the Intake screens.
(function () {
  var STRINGS = window.MOMENTUM_I18N;
  var LANG_KEY = "momentum.lang";
  var root = document.documentElement;
  var lang = "he";

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

  window.MomentumIntakeUI.start({
    mount: document.getElementById("app"),
    store: store,
    t: t,
    lang: function () { return lang; },
    chartTemplate: document.getElementById("comeback-chart")
  });

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.dataset.lang);
      saveLang(btn.dataset.lang);
      window.MomentumIntakeUI.render();
    });
  });
})();
