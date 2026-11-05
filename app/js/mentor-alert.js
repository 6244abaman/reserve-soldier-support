// Mentor alerts (Phase 9), the app side. Whenever a saved profile carries a
// safety flag (escalation.js flagProfile) that has not been emailed yet, the
// app asks the proxy to email the human mentor. One place does this for every
// screen: app.js wraps the profile store's save with watch().
//
// What is sent: the level, the reason label, the first name, the language,
// and the phone number only at Level 1 (safety) or when the soldier agreed.
// Never the soldier's own words.
//
// The pure parts (pending, payload, markSent) work in Node tests (require).
(function (root) {
  "use strict";

  function flags(profile) { return (profile && profile.flags) || {}; }

  function levelOf(reason) {
    var m = /^Level ([123])\b/.exec(reason || "");
    return m ? Number(m[1]) : null;
  }

  // A flag that has not been emailed yet.
  function pending(profile) {
    var f = flags(profile);
    return Boolean(f.mentorEscalation && levelOf(f.escalationReason) && f.mentorNotifiedFor !== f.escalationReason);
  }

  function payload(profile) {
    var f = flags(profile);
    var level = levelOf(f.escalationReason);
    var person = profile.person || {};
    var share = level === 1 || f.mentorContactApproved === true;
    var out = {
      level: level,
      reason: f.escalationReason,
      firstName: person.firstName || "",
      language: profile.meta && profile.meta.language === "en" ? "en" : "he",
      profileId: (profile.meta && profile.meta.profileId) || undefined,
      contactApproved: f.mentorContactApproved === true
    };
    if (share && person.phone) out.phone = String(person.phone).slice(0, 20);
    return out;
  }

  // The profile with the alert recorded as sent.
  function markSent(profile, reason, nowIso) {
    var p = JSON.parse(JSON.stringify(profile));
    p.flags = p.flags || {};
    p.flags.mentorNotifiedFor = reason;
    p.flags.mentorNotifiedAt = nowIso;
    return p;
  }

  // ---------- browser only ----------

  function post(body) {
    var base = ((root.MOMENTUM_CONFIG && root.MOMENTUM_CONFIG.proxyUrl) || "").replace(/\/$/, "");
    if (!base || typeof fetch !== "function") return Promise.resolve(false);
    return fetch(base + "/api/alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) { return res.ok; }, function () { return false; });
  }

  // Wraps store.save so every save checks for a new flag. Screens keep their
  // own copies of the profile, so what was already sent (and the soldier's
  // agreement to share the phone) is carried into every later save.
  function watch(store) {
    var rawSave = store.save;
    var sent = {};          // reason -> time it was emailed
    var approved = false;
    var inFlight = {};

    function carry(profile) {
      var f = flags(profile);
      if (!profile || !profile.flags) return profile;
      if (sent[f.escalationReason] && f.mentorNotifiedFor !== f.escalationReason) {
        profile = markSent(profile, f.escalationReason, sent[f.escalationReason]);
      }
      if (approved && f.mentorContactApproved !== true) {
        profile = JSON.parse(JSON.stringify(profile));
        profile.flags.mentorContactApproved = true;
      }
      return profile;
    }

    function notify(saved) {
      if (!pending(saved)) return;
      var reason = flags(saved).escalationReason;
      if (inFlight[reason]) return;
      inFlight[reason] = true;
      post(payload(saved)).then(function (ok) {
        inFlight[reason] = false;
        if (!ok) return;                     // tried again on the next save
        sent[reason] = new Date().toISOString();
        rawSave(markSent(saved, reason, sent[reason]));
      });
    }

    store.save = function (profile) {
      var r = rawSave(carry(profile));
      if (r.ok) notify(r.profile);
      return r;
    };

    // The soldier agreed to share their phone with the mentor (Level 2 screen).
    // A Level 2 or 3 alert already sent without it is sent again, with it.
    store.approveMentorContact = function (profile) {
      approved = true;
      var p = JSON.parse(JSON.stringify(profile));
      p.flags = p.flags || {};
      p.flags.mentorContactApproved = true;
      var reason = p.flags.escalationReason;
      if (reason && sent[reason] && levelOf(reason) !== 1) {
        delete sent[reason];
        delete p.flags.mentorNotifiedFor;
      }
      return store.save(p);
    };
    return store;
  }

  var api = { pending: pending, payload: payload, markSent: markSent, levelOf: levelOf, watch: watch };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumMentorAlert = api;
})(this);
