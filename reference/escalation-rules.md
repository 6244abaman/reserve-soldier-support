# Escalation rules

## Purpose
This file defines when any agent or module must stop its normal work and hand the soldier to a human mentor. It is read by the shared escalation function. Every agent and module follows it; none writes its own version.

## Core principle
When in doubt, escalate. A wrong handoff costs a few minutes of a mentor's time. A missed one can cost far more. An agent never tries to handle a crisis itself.

## Level 1: Stop now and hand off immediately
**Triggers:**
- The soldier mentions harming themselves, not wanting to live, or feeling hopeless or unsafe.
- The soldier mentions harming someone else.
- Abuse or violence at home or at work.
- A medical emergency.

**What the agent does:**
1. Stops the current task completely. No plan, no module, no questions about the business.
2. Responds with warmth and without judgment, in the soldier's language. Says it is glad they said something and that they deserve support from a person right now.
3. Gives the emergency and support contacts listed in this file's contacts section. If that section is empty, says so honestly and urges the soldier to contact emergency services or someone they trust right away.
4. Flags the human mentor immediately with the reason, saved to the flags section of the profile.
5. Does not return to business topics until the soldier does, or a mentor confirms.

## Level 2: Stop the task and hand off the same day
**Triggers:**
- A legal action, court date, enforcement, seizure, or a lawyer's letter.
- Risk of losing the home, vehicle, or tools.
- A workplace accident, a workers' dispute, a harassment claim, or a threatened claim.
- A creditor, customer, or employee threatening the soldier.
- Suspected fraud, either against the soldier or involving them.
- The numbers show the business cannot cover basic costs within 90 days under any realistic plan.

**What the agent does:**
1. Stops the current task and explains in plain words that a person should look at this.
2. Flags the human mentor with the reason and a short neutral summary the soldier has approved.
3. Offers to prepare a short list of questions or documents for the mentor, as a draft.
4. Gives no legal, tax, or financial advice about the situation.

## Level 3: Flag a mentor, continue carefully
**Triggers:**
- The soldier has been silent for two weeks in a row (no automatic messages after that point).
- The Cover Person has been unreachable for two weeks.
- The same action has been blocked two weeks in a row and the soldier seems stuck or discouraged.
- The soldier says they are exhausted, burned out, or overwhelmed, but with no sign of Level 1.
- The soldier asks about hiding income, bending facts to qualify for help, or avoiding legal duties to workers.
- A question the agents cannot answer because no verified entry exists in the reference file.

**What the agent does:**
1. Says honestly what it cannot help with and why.
2. Flags the mentor with the reason, saved to the flags section of the profile.
3. Continues only with safe, simple steps the soldier agrees to.

## Reserve duty rules
- During a marked call-up, escalate to the human mentor, not to the Cover Person, for anything at Level 1 or Level 2.
- Level 3 silence rules pause while the soldier is called up. Nothing counts as missed.
- The Cover Person never receives the soldier's reasons for escalation.

## Privacy in handoffs
Share only what the soldier approved, or what is needed to keep them safe. At Level 1 only, share what is needed for safety even if the soldier has not approved. Never store details that the profile schema excludes: ID numbers, bank details, medical information, or combat information.

## What agents never do
- Never diagnose, label, or assess a person's mental or physical state.
- Never promise that a mentor will arrive at a particular time.
- Never tell the soldier that things will be fine.
- Never argue the soldier out of seeking help.
- Never continue normal work after a Level 1 trigger.

## Contacts (to be filled by the Momentum team)
Emergency services, crisis and mental-health lines, a veterans' or reservists' support line, the mentor handoff channel, and a legal-aid contact. Each entry needs a verified source link and a last-checked date, the same as the benefits reference file.

_No verified contacts yet._ Until filled, agents say: "I don't have a verified number to give you here. Please contact emergency services or someone you trust right now."

## Build note
One shared function checks every incoming soldier message, and every Cover Person message, against these triggers before the agent replies, and returns a level or none. Agents call this function; they do not write their own checks.
