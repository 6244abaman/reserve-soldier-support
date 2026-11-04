// Copies schema/recovery-profile.json into app/js/schema.js, so the app can use
// the schema even when index.html is opened by double-click (no server).
// Run after any change to the schema:  npm run build:schema
// A test fails if you forget, so the two can never drift apart.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema", "recovery-profile.json"), "utf8"));

const output =
`// GENERATED from schema/recovery-profile.json by scripts/build-schema.js.
// Do not edit by hand. Change the schema file, then run: npm run build:schema
(function (root) {
  var schema = ${JSON.stringify(schema, null, 2).replace(/\n/g, "\n  ")};
  if (typeof module === "object" && module.exports) module.exports = schema;
  else root.MomentumProfileSchema = schema;
})(this);
`;

fs.writeFileSync(path.join(root, "app", "js", "schema.js"), output);
console.log("Wrote app/js/schema.js");
