// The only agent and module names the proxy accepts, and the prompt file for each.
// Anything else is refused, so a request can never make the proxy read another file.
const { FILES: ROUTER_FILES, MODULES } = require("../app/js/router.js");

const AGENT_FILES = Object.assign({}, ROUTER_FILES, {
  marketing_content: "agents/marketing-content.md"
});

// Every agent also reads these reference files (rules for escalation, and the
// only allowed source for benefit rules, amounts, and deadlines).
const REFERENCE_FILES = ["reference/escalation-rules.md", "reference/israeli-benefits.md"];

// Tasks that need an answer in a fixed shape the app can save. Each task
// belongs to one agent, adds its own instruction file, and has a JSON schema.
const TASKS = {
  findings: { agent: "diagnostic", file: "agents/tasks/findings.md", schema: "schema/outputs/findings.json" },
  plan: { agent: "recovery_plan", file: "agents/tasks/plan.md", schema: "schema/outputs/plan.json" },
  checkin: { agent: "accountability", file: "agents/tasks/checkin.md", schema: "schema/outputs/checkin.json" }
};

// A module answering in the chat (no task) also reads this note: short replies,
// plain text, and nothing is saved in this version.
const MODULE_CHAT_FILE = "agents/tasks/module-chat.md";

module.exports = { AGENT_FILES, REFERENCE_FILES, TASKS, MODULES, MODULE_CHAT_FILE };
