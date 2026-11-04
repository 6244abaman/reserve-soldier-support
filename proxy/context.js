// Builds what Claude reads for one turn: the agent's prompt file, the sector
// file of the business in focus, the reference files, and the soldier's
// profile. Prompts are never written here; they are read from their own files
// (CLAUDE.md rule 10).
//
// The system prompt has two parts so the long, unchanging part can be cached:
//   1. stable: agent prompt + sector file + reference files
//   2. this turn: language, date, who is speaking, and the profile
const fs = require("fs");
const path = require("path");
const { AGENT_FILES, REFERENCE_FILES } = require("./agents");
const { sectorFile } = require("../app/js/router.js");

const ROOT = path.join(__dirname, "..");
const cache = new Map();

function read(relative) {
  if (!cache.has(relative)) cache.set(relative, fs.readFileSync(path.join(ROOT, relative), "utf8"));
  return cache.get(relative);
}

// The phone number and the Cover Person's contact details are not needed to
// give advice, so they are removed before anything is sent to Claude.
function forClaude(profile) {
  const copy = JSON.parse(JSON.stringify(profile));
  if (copy.person) delete copy.person.phone;
  if (copy.cover) delete copy.cover.contact;
  return copy;
}

function section(title, body) {
  return "<" + title + ">\n" + body.trim() + "\n</" + title + ">";
}

// input: { agent, profile, businessId, speaker, today }
function buildSystem(input) {
  const business = (input.profile.businesses || []).find((b) => b.id === input.businessId) || null;
  const sector = sectorFile(business ? business.sector : "other");

  const stable = [
    section("agent_instructions", read(AGENT_FILES[input.agent])),
    section("sector_notes", read(sector)),
    ...REFERENCE_FILES.map((file) => section("reference file=\"" + file + "\"", read(file)))
  ].join("\n\n");

  const language = input.profile.meta && input.profile.meta.language === "en" ? "English" : "Hebrew";
  const turn = [
    "Reply in " + language + ".",
    "Today's date: " + input.today + ".",
    "You are speaking with: " + (input.speaker === "cover"
      ? "the Cover Person, as a helper with only the permissions the soldier approved"
      : "the soldier") + ".",
    business ? "Business in focus: " + (business.name || business.id) + " (id " + business.id + ")." : "No single business is in focus.",
    input.escalationNote ? "Note: " + input.escalationNote : "",
    section("recovery_profile", JSON.stringify(forClaude(input.profile), null, 2))
  ].filter(Boolean).join("\n");

  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: turn }
  ];
}

module.exports = { buildSystem, forClaude, read };
