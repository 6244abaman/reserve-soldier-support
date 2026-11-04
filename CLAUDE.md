# Momentum: Multi-Agent Business Recovery System

## What this is
Momentum helps Israeli reservists restart their businesses after long military service. One soldier has one Recovery Profile that holds a list of businesses. A Router agent sends each conversation to the right agent or module. Soldiers use a Hebrew and English web app. The Claude API is called only through our Render proxy.

## Who the users are
Soldiers and veterans, often tired, stretched, and worried about money. They use phones. They may be called up again at any time. Treat them with respect and plain language. Never judge.

## Source of truth
The design lives in the Google Doc "Momentum Agent System: Build Blueprint" (https://claude.ai/artifact/JAbFMYEJ6M7jBomjjVy1oA). The prompt files in this repo are copies of its sections. If the doc and the repo disagree, ask Aba before changing anything.

## Layout
- agents/: router, intake, diagnostic, recovery-plan, accountability, marketing-content
- modules/: pricing, cash-flow-debt, customer-acquisition, customer-followup, benefits-grants, staff, time-capacity
- sectors/: food-hospitality, retail-ecommerce, trades-construction, professional-services, tech-creative, health-personal-care, transport-logistics, other
- reference/: israeli-benefits.md, escalation-rules.md
- schema/recovery-profile.json
- app/: HTML front end, Hebrew (right to left) and English
- proxy/: Render proxy

## Flow
Intake, then Diagnostic, then Recovery Planning, then Accountability. A specific question from the soldier always beats the default flow: the Router loads the matching module, then returns to where the soldier left off. The Router also loads the sector file for the business in focus, or sectors/other.md.

## Hard rules
1. Escalation. One shared function checks every message against reference/escalation-rules.md before any agent replies. Level 1 stops everything and hands off immediately. Agents never write their own escalation checks.
2. No rules from memory. Agents never state tax, legal, benefit, or labor rules, amounts, or deadlines from memory. They use only verified entries in reference/israeli-benefits.md. With no verified entry, they say they cannot confirm and point to the human mentor.
3. Draft only. Agents never send messages, submit forms, pay money, sign, or contact anyone for a soldier. They write drafts. A person sends.
4. Privacy. Never store ID numbers, bank details, passwords, medical information, or combat information. Staff are stored as roles only. The Cover Person sees only what the soldier shared, and access ends automatically after the return date.
5. Reserve duty respect. During a marked call-up, no automatic nudges, and nothing counts as late or failed. At most one gentle nudge a week otherwise. After two weeks of silence, stop and flag a human mentor. Never ask about service experiences.
6. Honesty about numbers. Mark every number as stated, estimated, or missing. Never present a guess as a fact.
7. Limits. At most three problems in a diagnosis, three priorities in a plan, and three weekly actions in total across all businesses.
8. Language. Reply in the soldier's language. Hebrew screens are right to left.
9. No back-office steps shown to the soldier.
10. Each prompt lives in its own file. Never hard-code prompts in application code.

## Technical rules
- The API key lives only on the server (Render environment variable). Never in the front end, never in the repo.
- The proxy takes an agent name, loads that prompt file, adds the profile and sector context, calls the Claude API, and returns the reply. Add rate limiting and input size limits.
- The profile is stored behind one storage interface (localStorage keyed by phone for now, so it can move to a server database later). Validate against schema/recovery-profile.json on every save.

## How to work with Aba
- Work in phases and stop for approval at each checkpoint.
- If something conflicts with the existing code or this file, stop and ask.
- Do not add features that were not asked for.
- Never overwrite an existing file without saying so first.
- Small commits with clear messages.
- Summarize each phase: what changed, what was tested, what is unsure, what you need.

## Still open
- Fill reference/israeli-benefits.md with verified entries from official sources.
- Fill the contacts section of reference/escalation-rules.md with verified numbers.
- Decide how the human mentor is notified (email, dashboard, or both).
