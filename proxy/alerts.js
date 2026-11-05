// Mentor alerts (Phase 9): when the shared safety check flags a soldier, the
// app asks the proxy to email the human mentor through Resend.
//
// Settings, all on Render (Environment), never in the code:
//   RESEND_API_KEY  the Resend key
//   MENTOR_EMAIL    where alerts go (one address, or several separated by commas)
//   ALERT_FROM      optional sender, e.g. "Momentum <alerts@your-domain>";
//                   without it Resend's test sender is used, which can only
//                   send to the email address of the Resend account itself
//
// Privacy (reference/escalation-rules.md, "Privacy in handoffs"): the email
// holds the level, the reason label, the first name, and the date. The phone
// number is included at Level 1 always (for safety), and at Level 2 or 3 only
// if the soldier agreed. The soldier's own words are never sent or logged.
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Momentum <onboarding@resend.dev>";

const WHAT_TO_DO = {
  1: "Level 1: possible personal crisis or danger. Reach out now. The app has shown the soldier emergency and support contacts.",
  2: "Level 2: a legal, money, or safety problem that needs a person. Reach out today. The app gave no legal or financial advice.",
  3: "Level 3: something to look at soon, for example exhaustion or the same action blocked two weeks in a row. Reach out within a few days."
};

function settings() {
  const to = String(process.env.MENTOR_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { key: process.env.RESEND_API_KEY || "", to, from: process.env.ALERT_FROM || DEFAULT_FROM };
}

function ready() {
  const s = settings();
  return Boolean(s.key && s.to.length);
}

const PHONE = /^[0-9+\-\s()]{7,20}$/;

// Returns an error message, or null when the alert request is fine.
function problemWithAlert(body) {
  if (!body || typeof body !== "object") return "The request must be a JSON object.";
  if ([1, 2, 3].indexOf(body.level) === -1) return "Unknown level.";
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 300) return "A short reason is required.";
  if (body.firstName != null && (typeof body.firstName !== "string" || body.firstName.length > 60)) return "The name is too long.";
  if (body.phone != null && (typeof body.phone !== "string" || !PHONE.test(body.phone))) return "The phone number does not look right.";
  if (body.phone && body.level !== 1 && body.contactApproved !== true) return "The phone number needs the soldier's agreement at this level.";
  if (body.profileId != null && (typeof body.profileId !== "string" || body.profileId.length > 80)) return "Unknown profile.";
  if (body.language != null && body.language !== "he" && body.language !== "en") return "Unknown language.";
  return null;
}

function emailFor(body, now) {
  const name = (body.firstName || "").trim() || "(no name given)";
  const subject = "Momentum alert, Level " + body.level + (body.level === 1 ? " (urgent)" : "") + ": " + name;
  const lines = [
    WHAT_TO_DO[body.level],
    "",
    "Soldier: " + name,
    "Phone: " + (body.phone ? body.phone : "not shared (the soldier did not agree to share it at this level)"),
    "Language: " + (body.language === "en" ? "English" : "Hebrew"),
    "Reason: " + body.reason.trim(),
    "Sent: " + now,
    "",
    "The soldier's own words are not included, for their privacy.",
    "This email was sent automatically by the Momentum proxy."
  ];
  return { subject, text: lines.join("\n") };
}

// Remembers what was already sent, so the same alert is never emailed twice.
// Only a sent alert is remembered, so a failed one can be tried again.
function createAlertMemory(windowMs) {
  const sent = new Map();
  const span = windowMs || 24 * 60 * 60 * 1000;
  return {
    seen(key, now) { const at = sent.get(key); return Boolean(at && now - at < span); },
    remember(key, now) { if (sent.size > 5000) sent.clear(); sent.set(key, now); }
  };
}

// sendEmail(message) -> Promise<{ ok, status }>. Injected in tests.
function resendSender(fetchFn) {
  const f = fetchFn || fetch;
  return async function sendEmail(message) {
    const s = settings();
    const res = await f(RESEND_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + s.key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: s.from, to: s.to, subject: message.subject, text: message.text })
    });
    return { ok: res.ok, status: res.status };
  };
}

module.exports = { ready, problemWithAlert, emailFor, createAlertMemory, resendSender, settings };
