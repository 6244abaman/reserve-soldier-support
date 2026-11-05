// Momentum proxy. The app sends: which agent, the soldier's profile, the
// business in focus, and the conversation. The proxy:
//   1. checks size and rate limits, the agent name, and the profile (schema)
//   2. runs the ONE shared escalation check on the latest message; Level 1
//      and 2 never reach Claude, the app shows the handoff screen instead
//   3. reads the agent's prompt file, sector file, and reference files
//   4. calls Claude, and returns the reply
// The API key lives only here, in the ANTHROPIC_API_KEY environment variable
// on Render. What soldiers write is never logged: only the agent, the result,
// the time taken, and token counts.
const http = require("http");
const { checkMessage } = require("../app/js/escalation.js");
const { validateProfile } = require("../app/js/validate.js");
const schema = require("../app/js/schema.js");
const { AGENT_FILES, TASKS, taskFits } = require("./agents");
const { buildSystem, taskSchema } = require("./context");
const { LIMITS, createRateLimiter } = require("./limits");
const Alerts = require("./alerts");

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers));
  res.end(JSON.stringify(body));
}

// ALLOWED_ORIGINS is a comma-separated list of the app's web addresses.
// Render's Blueprint passes only the service's short name (like
// "rss-app-2gwd"), so a name without a dot is read as <name>.onrender.com,
// and an address without "https://" gets it.
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      let origin = s.indexOf("://") === -1 ? "https://" + s : s;
      origin = origin.replace(/\/+$/, "");
      const host = origin.split("://")[1];
      return host.indexOf(".") === -1 ? origin + ".onrender.com" : origin;
    });
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins().indexOf(origin) === -1) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function callerKey(req) {
  // Render puts the caller's address first in x-forwarded-for.
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      // Past the limit, stop keeping the data but let the upload finish so the
      // phone gets a clear "too large" answer. Something far too big is cut off.
      if (size > LIMITS.maxBodyBytes * 10) { req.destroy(); return; }
      if (size <= LIMITS.maxBodyBytes) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > LIMITS.maxBodyBytes) reject(Object.assign(new Error("too_large"), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

// Returns an error message, or null when the request is fine.
function problemWith(body) {
  if (!body || typeof body !== "object") return "The request must be a JSON object.";
  if (!Object.prototype.hasOwnProperty.call(AGENT_FILES, body.agent)) return "Unknown agent.";
  if (!body.profile || typeof body.profile !== "object") return "A profile is required.";
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return "At least one message is required.";
  if (msgs.length > LIMITS.maxMessages) return "Too many messages.";
  for (const m of msgs) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) {
      return "Each message needs a role (user or assistant) and text.";
    }
    if (m.content.length > LIMITS.maxMessageChars) return "A message is too long.";
  }
  if (msgs[0].role !== "user" || msgs[msgs.length - 1].role !== "user") return "The conversation must start and end with the soldier.";
  if (body.speaker && body.speaker !== "soldier" && body.speaker !== "cover") return "Unknown speaker.";
  if (body.task != null) {
    if (!Object.prototype.hasOwnProperty.call(TASKS, body.task)) return "Unknown task.";
    if (!taskFits(body.task, body.agent)) return "That task belongs to a different agent.";
  }
  return null;
}

function log(entry) {
  console.log(JSON.stringify(Object.assign({ time: new Date().toISOString() }, entry)));
}

// options: { client (an Anthropic client, injected in tests), today(), rateLimiter }
function createServer(options) {
  const opts = options || {};
  const allow = opts.rateLimiter || createRateLimiter();
  const today = opts.today || (() => new Date().toISOString().slice(0, 10));
  let client = opts.client || null;
  // Mentor alerts: at most 10 per 10 minutes from one address, and never the same one twice a day.
  const allowAlert = opts.alertRateLimiter || createRateLimiter({ limit: 10 });
  const alertMemory = opts.alertMemory || Alerts.createAlertMemory();
  const sendEmail = opts.sendEmail || Alerts.resendSender();
  const alertsReady = opts.alertsReady || Alerts.ready;

  function getClient() {
    if (client) return client;
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const Anthropic = require("@anthropic-ai/sdk");
    client = new Anthropic({ maxRetries: 2 });
    return client;
  }

  async function handleAgent(req, res, cors) {
    const started = Date.now();
    const rate = allow(callerKey(req));
    if (!rate.ok) {
      return send(res, 429, { error: "Too many requests. Please wait a few minutes." },
        Object.assign({ "Retry-After": String(rate.retryAfterSeconds) }, cors));
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.status === 413 ? 413 : 400, { error: e.status === 413 ? "The request is too large." : "The request is not valid JSON." }, cors);
    }

    const problem = problemWith(body);
    if (problem) return send(res, 400, { error: problem }, cors);

    const check = validateProfile(body.profile, schema);
    if (!check.ok) return send(res, 400, { error: "The profile does not match the schema.", details: check.errors.slice(0, 5) }, cors);

    // The shared escalation check runs before any agent replies (CLAUDE.md rule 1).
    const speaker = body.speaker === "cover" ? "cover" : "soldier";
    const latest = body.messages[body.messages.length - 1].content;
    const escalation = checkMessage(latest, { from: speaker });
    if (escalation.level === 1 || escalation.level === 2) {
      log({ agent: body.agent, outcome: "handoff", level: escalation.level, ms: Date.now() - started });
      return send(res, 200, { handoff: { level: escalation.level, category: escalation.category, label: escalation.label } }, cors);
    }

    const anthropic = getClient();
    if (!anthropic) return send(res, 503, { error: "The proxy is not set up yet (no API key)." }, cors);

    const task = body.task || null;
    const system = buildSystem({
      agent: body.agent,
      task,
      profile: body.profile,
      businessId: body.businessId || null,
      speaker,
      today: today(),
      escalationNote: escalation.level === 3
        ? "The shared safety check flagged this message at Level 3 (" + escalation.label + "). Continue only with safe, simple steps, and say plainly what you cannot help with."
        : null
    });

    try {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
        output_config: task
          ? { effort: "medium", format: { type: "json_schema", schema: taskSchema(task) } }
          : { effort: "medium" },
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default"
      });

      const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();
      log({
        agent: body.agent, outcome: response.stop_reason, ms: Date.now() - started,
        input_tokens: response.usage && response.usage.input_tokens,
        cached_tokens: response.usage && response.usage.cache_read_input_tokens,
        output_tokens: response.usage && response.usage.output_tokens
      });

      if (response.stop_reason === "refusal") {
        return send(res, 200, { reply: null, refused: true }, cors);
      }
      if (task) {
        // A task answer must be complete JSON in the agreed shape.
        let result = null;
        try { result = response.stop_reason === "max_tokens" ? null : JSON.parse(reply); } catch (e) { result = null; }
        if (!result) return send(res, 502, { error: "The answer came back incomplete. Please try again." }, cors);
        return send(res, 200, {
          result,
          escalation: escalation.level === 3 ? { level: 3, category: escalation.category, label: escalation.label } : null
        }, cors);
      }
      return send(res, 200, {
        reply,
        stopReason: response.stop_reason,
        escalation: escalation.level === 3 ? { level: 3, category: escalation.category, label: escalation.label } : null
      }, cors);
    } catch (error) {
      const status = error && error.status;
      log({ agent: body.agent, outcome: "error", status: status || null, ms: Date.now() - started });
      if (status === 429 || status === 529 || (status >= 500 && status < 600)) {
        return send(res, 503, { error: "Claude is busy right now. Please try again in a minute." }, cors);
      }
      return send(res, 502, { error: "Something went wrong talking to Claude." }, cors);
    }
  }

  // POST /api/alert: { level, reason, firstName, phone, contactApproved, profileId, language }
  async function handleAlert(req, res, cors) {
    const rate = allowAlert(callerKey(req));
    if (!rate.ok) {
      return send(res, 429, { error: "Too many alerts. Please wait a few minutes." },
        Object.assign({ "Retry-After": String(rate.retryAfterSeconds) }, cors));
    }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) {
      return send(res, e.status === 413 ? 413 : 400, { error: "The request is not valid." }, cors);
    }
    const problem = Alerts.problemWithAlert(body);
    if (problem) return send(res, 400, { error: problem }, cors);
    if (!alertsReady()) {
      log({ route: "alert", outcome: "not_set_up", level: body.level });
      return send(res, 503, { error: "Mentor alerts are not set up yet." }, cors);
    }
    const key = (body.profileId || callerKey(req)) + "|" + body.reason + (body.phone ? "|phone" : "");
    if (alertMemory.seen(key, Date.now())) return send(res, 200, { sent: true, repeat: true }, cors);

    try {
      const out = await sendEmail(Alerts.emailFor(body, new Date().toISOString()));
      log({ route: "alert", outcome: out.ok ? "sent" : "failed", level: body.level, status: out.status });
      if (!out.ok) return send(res, 502, { error: "The alert email could not be sent." }, cors);
      alertMemory.remember(key, Date.now());
      return send(res, 200, { sent: true }, cors);
    } catch (e) {
      log({ route: "alert", outcome: "error", level: body.level });
      return send(res, 502, { error: "The alert email could not be sent." }, cors);
    }
  }

  return http.createServer((req, res) => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return send(res, 200, { ok: true, model: MODEL, ready: Boolean(opts.client || process.env.ANTHROPIC_API_KEY), alerts: alertsReady() }, cors);
    }
    if (req.method === "POST" && req.url === "/api/agent") {
      return handleAgent(req, res, cors).catch(() => send(res, 500, { error: "Unexpected error." }, cors));
    }
    if (req.method === "POST" && req.url === "/api/alert") {
      return handleAlert(req, res, cors).catch(() => send(res, 500, { error: "Unexpected error." }, cors));
    }
    send(res, 404, { error: "Not found." }, cors);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    log({ outcome: "started", port, model: MODEL, ready: Boolean(process.env.ANTHROPIC_API_KEY) });
  });
}

module.exports = { createServer, problemWith };
