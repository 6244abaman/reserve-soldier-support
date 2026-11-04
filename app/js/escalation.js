// The ONE shared escalation check (CLAUDE.md, hard rule 1).
//
// Every soldier message and every Cover Person message goes through
// checkMessage() before any agent replies. Agents and modules never write
// their own checks; they call this.
//
// Levels come from reference/escalation-rules.md:
//   1 = stop now and hand off immediately
//   2 = stop the task and hand off the same day
//   3 = flag a mentor and continue carefully
//   0 = nothing found
// The phrases live in reference/escalation-phrases.json (generated into
// app/js/escalation-phrases.js). When in doubt, a phrase should be added:
// a wrong handoff costs a mentor a few minutes; a missed one can cost far more.
//
// This is layer 1 (phrases). Layer 2, a short Claude check on the server for
// wording that phrases miss, is added in Phase 9 and can only raise the level.
//
// Works in the browser (window.MomentumEscalation) and in Node tests (require).
(function (root) {
  "use strict";

  var PHRASES = typeof module === "object" && module.exports
    ? require("./escalation-phrases.js")
    : root.MomentumEscalationPhrases;

  var ACTIONS = {
    0: "none",
    1: "stop_and_hand_off_now",
    2: "stop_task_and_hand_off_today",
    3: "flag_mentor_and_continue_carefully"
  };

  var HEBREW = /[֐-׿]/;
  var HEBREW_PREFIXES = "[ובכלמשה]{0,2}"; // ו ב כ ל מ ש ה can stick to the front of a word

  // Same clean-up for the message and for every phrase, so they compare fairly.
  function normalize(text) {
    return String(text == null ? "" : text)
      .normalize("NFC")
      .replace(/[֑-ׇ]/g, "")     // Hebrew vowel marks (niqqud)
      .replace(/['’׳`]/g, "")    // apostrophes: don't = dont
      .replace(/[״“”]/g, '"') // Hebrew and curly double quotes
      .replace(/[-–—_]/g, " ")   // self-harm = self harm
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compile(phrase) {
    var stem = phrase.slice(-1) === "*";
    var core = normalize(stem ? phrase.slice(0, -1) : phrase);
    var body = escapeRegex(core).replace(/ /g, "\\s+");
    // "Start of text or a non-letter" instead of a lookbehind, which older iPhones (before iOS 16.4) reject.
    var start = "(?:^|[^\\p{L}\\p{N}])" + (HEBREW.test(core.charAt(0)) ? HEBREW_PREFIXES : "");
    var end = stem ? "" : "(?![\\p{L}\\p{N}])";
    return new RegExp(start + body + end, "u");
  }

  var RULES = [];
  PHRASES.categories.forEach(function (cat) {
    ["he", "en"].forEach(function (lang) {
      (cat[lang] || []).forEach(function (phrase) {
        RULES.push({ level: cat.level, category: cat.category, label: cat.label, lang: lang, phrase: phrase, regex: compile(phrase) });
      });
    });
  });

  // Level 1 is the most serious, so "higher" means a smaller number above 0.
  function moreSerious(a, b) {
    if (!a) return b;
    if (!b) return a;
    return Math.min(a, b);
  }

  // Check one message. from = "soldier" or "cover".
  // Returns { level, action, category, label, categories, matches, from }.
  // It never stores or returns the message text itself (privacy).
  function checkMessage(text, options) {
    var from = (options && options.from) || "soldier";
    var clean = normalize(text);
    var matches = [];
    if (clean) {
      RULES.forEach(function (rule) {
        if (rule.regex.test(clean)) {
          matches.push({ level: rule.level, category: rule.category, lang: rule.lang, phrase: rule.phrase });
        }
      });
    }

    var level = 0;
    matches.forEach(function (m) { level = moreSerious(level, m.level); });
    matches.sort(function (a, b) { return a.level - b.level; });

    var top = matches[0];
    var categories = [];
    matches.forEach(function (m) { if (categories.indexOf(m.category) === -1) categories.push(m.category); });

    return {
      level: level,
      action: ACTIONS[level],
      category: top ? top.category : null,
      label: top ? labelFor(top.category) : null,
      categories: categories,
      matches: matches,
      from: from
    };
  }

  function labelFor(category) {
    for (var i = 0; i < PHRASES.categories.length; i++) {
      if (PHRASES.categories[i].category === category) return PHRASES.categories[i].label;
    }
    return category;
  }

  function levelOfReason(reason) {
    var m = /^Level (\d)/.exec(reason || "");
    return m ? Number(m[1]) : 0;
  }

  // Returns a copy of the profile with the mentor flag set (rules: every level
  // flags the mentor). Saves only the level, the kind of trigger, and the date,
  // never the soldier's words. A less serious flag never replaces a more serious one.
  function flagProfile(profile, result, now) {
    var copy = JSON.parse(JSON.stringify(profile));
    if (!result || !result.level) return copy;

    copy.flags = copy.flags || {};
    var current = copy.flags.mentorEscalation ? levelOfReason(copy.flags.escalationReason) : 0;
    if (current && current <= result.level) return copy;

    var date = (now ? now() : new Date().toISOString()).slice(0, 10);
    copy.flags.mentorEscalation = true;
    copy.flags.escalationReason = "Level " + result.level + ": " + result.label + " (" + date + ", from " + result.from + ")";
    return copy;
  }

  var api = { checkMessage: checkMessage, flagProfile: flagProfile, normalize: normalize };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumEscalation = api;
})(this);
