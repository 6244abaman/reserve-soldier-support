// The Cover Person (agents/accountability.md, "Cover Person"; CLAUDE.md rule 4):
// someone who keeps the business running while the soldier is on reserve duty.
//   setUp        the soldier names them, chooses what they may do and which
//                businesses they see; needs the soldier's consent and the Cover
//                Person's agreement
//   saveBrief    the handover brief (key customers, payments, suppliers, prices,
//                what must not be decided without the soldier)
//   endAccess    the soldier ends access at any time (it also ends on return)
//   state        none | ready (set up, not on duty yet) | active | ended
//   shareText    the message the soldier sends them (a draft; the soldier sends it)
//   privacyProblem  bank details, passwords, or ID numbers do not belong in the brief
// Every function returns a new profile and never changes the one it is given.
//
// Works in the browser (window.MomentumCover) and in Node tests (require).
(function (root) {
  "use strict";

  var isNode = typeof module === "object" && module.exports;
  var Paths = isNode ? require("./profile-paths.js") : root.MomentumPaths;

  var TASKS = ["answer_customers", "send_followups", "monitor_only"];
  var BRIEF_MAX = 3000;

  function businessIds(profile) { return (profile.businesses || []).map(function (b) { return b.id; }); }

  function clean(s) { return typeof s === "string" ? s.trim() : ""; }

  // Words and number shapes that point to bank details, passwords, or ID numbers.
  var PRIVATE = [
    /סיסמ/, /\bpassword/i, /\bpin\b/i, /קוד סודי/,
    /חשבון בנק/, /מספר חשבון/, /\bbank account/i, /\baccount number/i, /\biban\b/i, /\bIL\d{2}\s?\d{4}/i,
    /תעודת זהות/, /ת\.ז/, /\bid number/i,
    /כרטיס אשראי/, /\bcredit card/i, /(?:\d[ -]?){12,}/
  ];

  function privacyProblem(text) {
    var s = String(text || "");
    return PRIVATE.some(function (re) { return re.test(s); });
  }

  // input: { name, relationship, contact, sharedBusinessIds, allowedTasks,
  //          accessEndDate, consent (true), agreed (true) }
  // Returns { ok, profile } or { ok: false, errors: { field: key } }.
  function setUp(profile, input, today) {
    var errors = {};
    var name = clean(input.name);
    var ids = businessIds(profile);
    var shared = (input.sharedBusinessIds || []).filter(function (id) { return ids.indexOf(id) !== -1; });
    var tasks = (input.allowedTasks || []).filter(function (x) { return TASKS.indexOf(x) !== -1; });
    if (tasks.indexOf("monitor_only") !== -1) tasks = ["monitor_only"];   // "only monitor" means nothing else
    var end = clean(input.accessEndDate);

    if (!name) errors.name = "errName";
    if (!shared.length) errors.businesses = "errBusinesses";
    if (!tasks.length) errors.tasks = "errTasks";
    if (end && (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today)) errors.end = "errEnd";
    if (!input.consent) errors.consent = "errConsent";
    if (!input.agreed) errors.agreed = "errAgreed";
    if (Object.keys(errors).length) return { ok: false, errors: errors };

    var p = Paths.copy(profile);
    var before = p.cover || {};
    var c = {
      active: true,
      name: name,
      allowedTasks: tasks,
      sharedBusinessIds: shared,
      soldierConsentDate: before.soldierConsentDate && before.active ? before.soldierConsentDate : today,
      coverAgreed: true,
      agreedDate: before.agreedDate && before.active ? before.agreedDate : today
    };
    if (clean(input.relationship)) c.relationship = clean(input.relationship);
    if (clean(input.contact)) c.contact = clean(input.contact);
    if (end) c.accessEndDate = end;
    if (before.handoverBrief) c.handoverBrief = before.handoverBrief;
    p.cover = c;
    return { ok: true, profile: p };
  }

  // Returns { ok, profile } or { ok: false, error: "errPrivate" | "errLong" }.
  function saveBrief(profile, text) {
    var brief = clean(text);
    if (privacyProblem(brief)) return { ok: false, error: "errPrivate" };
    if (brief.length > BRIEF_MAX) return { ok: false, error: "errLong" };
    var p = Paths.copy(profile);
    p.cover = p.cover || {};
    if (brief) p.cover.handoverBrief = brief; else delete p.cover.handoverBrief;
    return { ok: true, profile: p };
  }

  function endAccess(profile, today) {
    var p = Paths.copy(profile);
    if (!p.cover) return p;
    p.cover.active = false;
    if (!p.cover.accessEndDate || p.cover.accessEndDate > today) p.cover.accessEndDate = today;
    return p;
  }

  function onDuty(profile) { return Boolean(profile.service && profile.service.status === "called_up"); }

  // none: nobody named, or access was ended. ready: set up, before the call-up.
  // active: on duty, agreed, not past the end date. ended: past the end date.
  function state(profile, today) {
    var c = profile.cover || {};
    if (!c.active || !c.name) return "none";
    if (c.accessEndDate && today > c.accessEndDate) return "ended";
    return onDuty(profile) && c.coverAgreed ? "active" : "ready";
  }

  // The message the soldier can send to the Cover Person. t is the screen-text
  // function, so it is in the soldier's language; formatDate shows the end date.
  function shareText(profile, t, formatDate) {
    var c = profile.cover || {};
    var names = (profile.businesses || []).filter(function (b) { return (c.sharedBusinessIds || []).indexOf(b.id) !== -1; })
      .map(function (b) { return b.name || b.id; });
    var lines = [
      t("cover.share.hello").replace("{name}", c.name || ""),
      t("cover.share.businesses").replace("{list}", names.join(", ")),
      t("cover.share.tasks").replace("{list}", (c.allowedTasks || []).map(function (x) { return t("cover.task." + x); }).join(", ")),
      t("cover.share.limits")
    ];
    if (c.accessEndDate) lines.push(t("cover.share.until").replace("{date}", formatDate ? formatDate(c.accessEndDate) : c.accessEndDate));
    if (c.handoverBrief) lines.push("", c.handoverBrief);
    return lines.join("\n");
  }

  var api = {
    TASKS: TASKS, BRIEF_MAX: BRIEF_MAX,
    setUp: setUp, saveBrief: saveBrief, endAccess: endAccess, state: state,
    shareText: shareText, privacyProblem: privacyProblem
  };
  if (isNode) module.exports = api;
  else root.MomentumCover = api;
})(this);
