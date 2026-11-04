// The only agent and module names the proxy accepts, and the prompt file for each.
// Anything else is refused, so a request can never make the proxy read another file.
const ROUTER_FILES = require("../app/js/router.js").FILES;

const AGENT_FILES = Object.assign({}, ROUTER_FILES, {
  marketing_content: "agents/marketing-content.md"
});

// Every agent also reads these reference files (rules for escalation, and the
// only allowed source for benefit rules, amounts, and deadlines).
const REFERENCE_FILES = ["reference/escalation-rules.md", "reference/israeli-benefits.md"];

module.exports = { AGENT_FILES, REFERENCE_FILES };
