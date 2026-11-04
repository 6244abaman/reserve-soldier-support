// The only agent and module names the proxy accepts, and the prompt file for each.
// Anything else is refused, so a request can never make the proxy read another file.
const ROUTER_FILES = require("../app/js/router.js").FILES;

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
  checkin: { agent: "accountability", file: "agents/tasks/checkin.md", schema: "schema/outputs/checkin.json" },
  // The end of a topic conversation: any of the seven modules can use it.
  topic: { agents: require("../app/js/router.js").MODULES, file: "agents/tasks/topic.md", schema: "schema/outputs/topic.json" }
};

function taskFits(task, agent) {
  const t = TASKS[task];
  return Boolean(t) && (t.agent === agent || (Array.isArray(t.agents) && t.agents.indexOf(agent) !== -1));
}

module.exports = { AGENT_FILES, REFERENCE_FILES, TASKS, taskFits };
