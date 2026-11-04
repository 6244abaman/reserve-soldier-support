// Sends one request to the Momentum proxy and turns every outcome into a
// simple result the screens can show:
//   { kind: "result", result, escalation }  a structured answer (findings, plan, check-in)
//   { kind: "reply", reply, escalation }    a plain text answer
//   { kind: "handoff", level, label }       the shared safety check found Level 1 or 2
//   { kind: "refused" }                     Claude declined
//   { kind: "error", reason }               notConnected, offline, unreachable, busy, tooMany, incomplete, other
(function (root) {
  "use strict";

  var TIMEOUT_MS = 150000; // a full plan can take up to a couple of minutes

  // options: { agent, task, profile, businessId, messages, speaker, language }
  function ask(options) {
    var base = ((root.MOMENTUM_CONFIG && root.MOMENTUM_CONFIG.proxyUrl) || "").replace(/\/$/, "");
    if (!base) return Promise.resolve({ kind: "error", reason: "notConnected" });

    var profile = JSON.parse(JSON.stringify(options.profile));
    profile.meta = profile.meta || {};
    if (options.language) profile.meta.language = options.language;

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: options.agent,
        task: options.task || null,
        profile: profile,
        businessId: options.businessId || null,
        messages: options.messages,
        speaker: options.speaker || "soldier"
      }),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 200) {
          if (body.handoff) return { kind: "handoff", level: body.handoff.level, label: body.handoff.label };
          if (body.refused) return { kind: "refused" };
          if (body.result) return { kind: "result", result: body.result, escalation: body.escalation || null };
          return { kind: "reply", reply: body.reply || "", escalation: body.escalation || null };
        }
        if (res.status === 429) return { kind: "error", reason: "tooMany" };
        if (res.status === 503) return { kind: "error", reason: "busy" };
        if (res.status === 502) return { kind: "error", reason: "incomplete" };
        if (root.console) console.warn("Proxy said", res.status, body.error);
        return { kind: "error", reason: "other" };
      });
    }).catch(function () {
      // The browser gives the same error for "no internet" and "the server
      // refused this app", so only blame the internet when the phone is offline.
      var online = typeof navigator === "undefined" || navigator.onLine !== false;
      return { kind: "error", reason: online ? "unreachable" : "offline" };
    }).then(function (out) {
      if (timer) clearTimeout(timer);
      return out;
    });
  }

  root.MomentumProxy = { ask: ask };
})(this);
