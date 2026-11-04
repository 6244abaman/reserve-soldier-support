// Copies the hand-edited data files into app/js/, so the app can use them even
// when index.html is opened by double-click (no server):
//   schema/recovery-profile.json       -> app/js/schema.js
//   reference/escalation-phrases.json  -> app/js/escalation-phrases.js
// Run after changing either file:  npm run build:data
// A test fails if you forget, so the copies can never drift apart.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function build(source, target, globalName) {
  const data = JSON.parse(fs.readFileSync(path.join(root, source), "utf8"));
  const output =
`// GENERATED from ${source} by scripts/build-data.js.
// Do not edit by hand. Change ${source}, then run: npm run build:data
(function (root) {
  var data = ${JSON.stringify(data, null, 2).replace(/\n/g, "\n  ")};
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.${globalName} = data;
})(this);
`;
  fs.writeFileSync(path.join(root, target), output);
  console.log("Wrote " + target);
}

build("schema/recovery-profile.json", "app/js/schema.js", "MomentumProfileSchema");
build("reference/escalation-phrases.json", "app/js/escalation-phrases.js", "MomentumEscalationPhrases");
