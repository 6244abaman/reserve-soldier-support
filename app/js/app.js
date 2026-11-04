// Sample screen logic: language switch (Hebrew right-to-left by default) and the two buttons.
(function () {
  var STRINGS = window.MOMENTUM_I18N;
  var LANG_KEY = "momentum.lang";
  var root = document.documentElement;
  var status = document.getElementById("status");

  function readLang() {
    try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; }
  }

  function saveLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* storage blocked: still works this visit */ }
  }

  function applyLang(lang) {
    var t = STRINGS[lang];
    root.lang = lang;
    root.dir = lang === "he" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t[el.dataset.i18n];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = t[el.dataset.i18nPlaceholder];
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
    });
    status.textContent = "";
  }

  var lang = readLang();
  applyLang(STRINGS[lang] ? lang : "he");

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.dataset.lang);
      saveLang(btn.dataset.lang);
    });
  });

  document.getElementById("question-form").addEventListener("submit", function (e) {
    e.preventDefault();
    status.textContent = STRINGS[root.lang].sampleContinue;
  });

  document.getElementById("skip").addEventListener("click", function () {
    status.textContent = STRINGS[root.lang].sampleSkip;
  });
})();
