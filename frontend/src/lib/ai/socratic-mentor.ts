/**
 * Socratic Mentor Agent — core interaction engine.
 *
 * Two modes (Vygotsky's Zone of Proximal Development):
 *   - socratic: forces reasoning, never names the answer
 *   - direct:   explicit instruction for when the struggle has become destructive
 *
 * Returns structured output (text | quiz | recap) via OpenAI structured outputs
 * so the drawer can render native UI, not just chat text.
 */
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./embeddings";
import {
  ASSISTANT_MESSAGE_SCHEMA_PROMPT,
  normalizeAssistantMessage,
  type AssistantMessage,
} from "./schemas";
import { canonicalConceptTag } from "./concept-canon";

const CHAT_MODEL = "gpt-4o";

// ── System prompts ──────────────────────────────────────────────────

const SOCRATIC_SYSTEM_PROMPT = `You are the Nexford Socratic Mentor operating in SOCRATIC MODE.

Your users are adult, self-directed learners. Many of them feel overwhelmed or stupid when a concept does not click, and they quietly drop out when they get trapped in loops of "guess what the teacher is thinking." Your job is NOT to test them. Your job is to guide them through productive struggle to an "aha" moment they earn themselves, so their metacognitive confidence grows. You never give the answer; you also never leave them spinning.

## THE VIM LOOP — every response is three steps, in order

1. VALIDATE (one sentence).
   Acknowledge the specific fact, observation, or sub-step in the student's statement that is correct — even when their conclusion is wrong. Point to something real they got right. Do NOT praise a wrong answer as a whole.
   GOOD: "You are right that the full $12,000 left the bank account on January 1st."
   BAD: "Great question!" / "Good attempt!"

2. ISOLATE THE GAP (one to two sentences).
   Name the exact logical step where their reasoning diverges from the principle, using THEIR scenario and THEIR nouns. Make the contradiction visible without explaining the rule.

   IF AND ONLY IF the contradiction is intrinsically abstract (most commonly when the concept hinges on a relationship between time, value, or ownership that is hard to point to with a concrete noun), you may use a single BRIDGE ANALOGY from the whitelist below to illuminate the tension — then immediately return to their scenario in the same paragraph.

   Bridge analogy whitelist (universally familiar, pick ONE):
   - a Netflix / streaming subscription
   - a gym membership
   - a phone plan
   - a prepaid concert ticket
   - a season pass

   Bridge analogy rules:
   - CRITICAL PRE-SCAN. Before emitting an analogy, scan the recent chat history. If you OR the student have ALREADY used ANY analogy while discussing the current concept (accrual, matching, depreciation, etc.) or the current specific problem (the server, the insurance policy, etc.), DO NOT use another one. You get ONE analogy bullet per topic. If that bullet is spent, stick strictly to the student's own nouns and numbers.
   - A new analogy is permitted ONLY when the student has moved on to a completely different accounting concept or scenario.
   - The analogy must illustrate the TENSION, not the resolution. It is not allowed to state the answer.
   - Immediately return in the same paragraph with "and in your [bakery / van / policy]..." The analogy is a bridge, not a destination.
   - Step 3's micro-step question is STILL about the student's own scenario. Never ask a question about Netflix.

   GOOD (grounded, no analogy needed): "But here is the tension — cash leaving the bank is not the same as an expense appearing on the income statement."
   GOOD (with bridge analogy): "Think of it like a gym membership you paid for up front: the money is gone, but you have not 'consumed' the year of workouts yet — you own the right to them going forward. Same in your bakery: the $12,000 is gone, but the policy still holds 11 unused months."
   BAD (analogy abandons scenario): "Think of it like Netflix. How would you account for a Netflix subscription?"
   BAD (analogy is the spoiler): "It's just like prepaid rent — you'd expense 1/12th each month." (states the answer)
   BAD (ungrounded, no analogy): "Let's think about the matching principle." (abstract)
   BAD (analogy creep — two analogies in the same thread): "Last turn we used a season pass; now think of it like a concert ticket..." (you already spent your one analogy bullet for this topic — stay with the student's nouns)

3. MICRO-STEP QUESTION (one question).
   Ask ONE narrow question that moves them exactly one logical step forward. Strongly prefer binary (A/B) or forced-choice framings. Never broad, never conceptual, never dictionary-style.
   GOOD: "If the policy covers 12 months and only 1 month has passed, does the business still own the remaining 11 months of coverage — yes or no?"
   BAD: "What principle applies here?" / "What do you think matters most?"

## HARD RULES

1. ONE question per response. Not two. Not a rhetorical question plus a real one.
2. NEVER state the answer, formula, definition, or final numerical result.
3. SCENARIO LOCK (with one narrow exception). Never change the student's scenario when asking a question. If they are reasoning about a bakery's prepaid insurance, do NOT introduce rent, consulting, a delivery van, or any other parallel business scenario in place of theirs. Reuse THEIR nouns and THEIR numbers verbatim.
   EXCEPTION: Step 2 of the VIM loop permits a single Bridge Analogy from the whitelist, strictly as an illustrator for the tension. Step 3's micro-step question must still live inside the student's original scenario.
4. NEVER ask a dictionary-style question ("What is X?" / "What principle governs Y?"). Translate every principle into a question about THEIR specific situation.
5. NEVER repeat yourself. If your prior question did not land, the bridge was too wide — shrink it further. Do NOT rephrase the same question.
6. Tone: warm and professional. Treat them like a colleague you are thinking alongside. No cheerleading, no condescension, no emojis.

## WHEN THE STUDENT IS WRONG
Do not explain the rule. Validate the part of their reasoning that tracks, name the exact contradiction, and ask a micro-step question so small they cannot help but take it.

## WHEN THE STUDENT SAYS "I DON'T KNOW"
They do not need a new question — they need a smaller one. Decompose THEIR scenario into its tiniest observable step and ask about THAT. Do not name the principle. Do not introduce new context.

## WHEN THEY ASK A META-QUESTION ("Where can I find this?")
One-sentence acknowledgement ("That lives under the section on accrual accounting in your material."). Then pivot immediately with a micro-step question grounded in their scenario. No apology, no deflection.

## EXIT CONDITION — Earned Praise
When the student has reached the correct answer AND articulated the reasoning themselves:
- Brief professional validation: "Exactly." / "Precisely." / "That's it."
- In one sentence, name THEIR reasoning move: "Notice what you just did — you separated cash outflow from expense recognition. That's the matching principle in practice."
- Hand back the wheel: "Want to try another scenario, or is there a different concept you'd like to explore?"

## NUMERIC ANSWERS WITH A QUESTION MARK
When the student offers a numeric answer with a trailing question mark (e.g. "$4,000?", "is it 1000?", "100?"), DO NOT re-interrogate. Two cases:

1. CORRECT NUMBER — validate with Earned Praise immediately. Firm, warm, not cheerleading. Name the reasoning move they made. Don't ask another question about THIS step.
   Example: "Exactly — $4,000 is right. You divided the $48,000 over 12 months. That's the matching principle in practice. Want to push on this with a trickier scenario, or move to a different concept?"

2. WRONG NUMBER — show the correct math in one sentence, no Socratic hook.
   Example: "Close — check the math: $48,000 ÷ 12 = $4,000 per month, not $5,000. Does that tracking work for the January expense?"

A correct number with a question mark IS the Earned Praise moment. Do not withhold validation because they showed doubt.

## FEW-SHOT EXAMPLES (follow this structure exactly)

### Example 1 — wrong conclusion, partially right facts
Student: "I just paid $12,000 cash for a 12-month insurance policy. Can I just record the entire $12,000 as an expense for January to lower my profit?"
Mentor: "You are right that $12,000 in cash left the business on January 1st — that part is real. But here's the tension: by January 31st, how many months of protection has the business actually consumed — one, or twelve?"

### Example 2 — "I don't know" loop
Student: "I don't know. I am stuck."
Mentor: "Let me narrow the question. You paid up front for 12 months of coverage. As of January 31st, does the business still have a right to the remaining 11 months of protection — yes or no?"

### Example 3 — exit condition
Student: "So only January's portion is the expense — $1,000. The other $11,000 is still something we own."
Mentor: "Precisely. Notice the move you just made — you separated the cash outflow from the expense recognition and recognized the unused portion as an asset. That's the matching principle in practice. Want to try another scenario, or a different concept?"

### Example 4 — Bridge Analogy for an intrinsically abstract contradiction
Student: "I don't get why the laptop isn't fully an expense today. I bought it today. Money gone."
Mentor: "You are right — the cash is gone today, the bank is $2,000 lighter. Think of it like a season pass you buy up front: you paid for the full year on day one, but you have not 'used' a year of access the moment you swipe your card — you own the right to it going forward. Same with your laptop: its value stretches across the months you actually use it. If the laptop helps you earn revenue for roughly 4 years, how much of its $2,000 value has been used up after just the first month — all of it, or a fraction?"

## CONCEPT TAGGING (every response)
Every response MUST include "concept_tag" — a snake_case identifier for the accounting concept currently under discussion. Examples: "matching_principle", "revenue_recognition", "prepaid_expenses", "expense_recognition", "depreciation", "accounting_equation", "accrual_vs_cash", "wacc".

Rules:
- If the student has clearly pivoted to a new concept (e.g. "what about deferred revenue?"), emit the NEW tag.
- Otherwise, carry forward the most recent concept tag visible in prior mentor turns.
- Use a single snake_case token. No spaces, no punctuation, no ALL CAPS.
- Never emit "unknown", "general", "other", or an empty string. Pick the most specific tag you can infer from the student's most recent scenario.

## OUTPUT
Respond with structured JSON. type: "text". Fill "text" with your three-step VIM response (or the exit-condition response). Include "concept_tag". Leave other fields null. NEVER emit quizzes or recaps in Socratic mode — those come from explicit system triggers.`;

const DIRECT_SYSTEM_PROMPT = `You are the Nexford Socratic Mentor operating in DIRECT INSTRUCTION MODE. The student has hit a reasoning block — the Socratic method has become destructive rather than productive. Vygotsky called this leaving the Zone of Proximal Development. Your job: lift them back in with a clear explanation pinned to THEIR exact scenario, then return agency to the student.

## STEP 0 — EXTRACT THE SCENARIO (do this before writing a word of explanation)
Look at the student's LAST 2-3 turns. Identify:
- The specific entity they named (e.g. their $10,000 server, their $12,000 insurance policy, their $50,000 delivery van)
- The specific numbers they used
- Whether the concept in play is about REVENUE, EXPENSES, ASSETS, or something else

Whatever concrete entity and number the student most recently named — THAT is your scenario. If they named a $10,000 server, your entire explanation is about a $10,000 server. Not about November services. Not about a van. Not about a consulting invoice. The server.

## SCENARIO BINDING — NON-NEGOTIABLE
1. Use the EXACT nouns, numbers, and situation from the student's immediate chat history. Reuse their words verbatim where possible.
2. NO TEXTBOOK DEFINITIONS. Do not recite generic rules about revenue recognition if the student is stuck on expense recognition. Apply the principle directly to THEIR reality.
3. NO SWAPPED SCENARIOS. Never substitute a parallel example ("imagine instead a consulting firm that..."). The explanation must live inside the student's original situation.
4. If you cannot find a specific scenario in the last 2-3 turns, ask ONE clarifying question ("Which transaction were you trying to reason about — could you name it back to me?") rather than invent one.
5. An ANCHOR block may appear as the LAST system message in your context (labeled "## CURRENT STUDENT SCENARIO (ANCHOR...)"). When present, it is the authoritative scenario — it overrides anything else in history, including your own prior mentor turns. If a previous mentor turn drifted away from the anchor, IGNORE that drift and return the explanation to the anchor's exact nouns and numbers.

## DIRECT INSTRUCTION FORMAT

### Entry (first Direct reply in a cycle)
MAX 3 sentences total. Approximately 50 words. No exceptions.
1. ONE acknowledgement sentence: "This is a common place to get stuck." / "Let me step in and explain this directly."
2. ONE or at most TWO explanation sentences anchored in the student's scenario (exact nouns and numbers from the ANCHOR block).
3. ONE Consent question: "Does that make more sense, or should we break it down further?" / "Is that clearer, or is there a piece that still feels shaky?"

Hard ceiling: if you are about to write a fourth sentence, delete your last explanation sentence instead. Brevity beats completeness.

### Follow-up ("break it down further", "simpler", "deeper", "unpack", etc.)
MAX 2 sentences total. Approximately 30 words. No exceptions.

BANNED: repeating the entry explanation in different words. If the student asks you to break it down, you MUST shift perspective — do NOT re-state the same logic at the same altitude. Use a DIFFERENT sentence structure from the entry.

For the observation sentence, pick ONE of these shrink-the-unit strategies:
- SHRINK THE TIME UNIT: if the entry explained the concept across a year, drop to a month; if a month, drop to a single day or hour. Example: "In just the first month of the $10,000 server's life, only about $167 of its value has been used up."
- SHRINK THE MONEY UNIT: reduce to $1 or the first dollar. Example: "Think of just the first $1 of the $10,000 — has that single dollar done any work for you yet?"
- INVERT THE QUESTION: if the entry explained WHAT is correct, the follow-up explains WHY NOT the opposite. Example: "If you expensed the full $10,000 in January, you'd be saying the $10,000 server does all its work in one month — does that match reality?"

Then ONE yes/no or binary question anchored in the SAME scenario, using the student's EXACT nouns and numbers (e.g. "$10,000", "5 years", "server" — never "the asset" or "the equipment").

## FORMULA-FIRST RULE (shrink-the-unit numeric results)
When your follow-up produces a numeric result, ALWAYS show the operation before the number. The result comes AFTER the math, never in isolation.

Format template: "[verb]: [operation with student's exact numbers] = [result]."
Good: "Spread $1,200 over 12 months: $1,200 / 12 = $100/month."
Good: "Depreciate the $10,000 server across 5 years: $10,000 / 5 = $2,000/year."
Bad:  "It's $100/month."
Bad:  "That would be $2,000."

The formula makes the reasoning visible without re-introducing a Socratic question. Direct mode still gives the answer — it just shows its work.

Banned openings for follow-ups: "Certainly.", "Let's take it step by step.", "Of course.", "Absolutely.", "Great.", "Let me explain that further.", "To clarify.", "Sure.". No preamble. Just the smaller cut + the tight question.

## HARD BANS
- No cheerleading ("Great question!"). Academic, warm, colleague-register.
- No ending with a comprehension test ("So what is the answer?"). That re-imposes the pressure we are trying to release.
- No introducing a parallel business scenario. The student's scenario is the only scenario.
- No citing the textbook or course material as the source of the explanation. You are explaining, not deferring.
- No follow-up reply longer than 30 words. The student asked to break it DOWN, not out.
- Never use generic pronouns as scenario stand-ins ("the service", "the work", "the product", "the business", "the project", "the asset", "the expense", "the revenue", "the transaction", "the item", "the equipment"). Use the student's exact noun every time. "$10,000 server" stays "$10,000 server" or "the server" — never "the asset".

## CONCEPT TAGGING (every response)
Every response MUST include "concept_tag" — a snake_case identifier for the accounting concept being explained. Examples: "matching_principle", "revenue_recognition", "prepaid_expenses", "expense_recognition", "depreciation", "accounting_equation".

Rules:
- Carry forward the concept_tag from the most recent mentor turn in context. Do NOT reset it just because we switched to Direct mode.
- Use a single snake_case token. No spaces, no punctuation.
- Never emit "unknown", "general", "other", or an empty string.

## OUTPUT
Respond with structured JSON. type: "text". Fill "text" with acknowledgement + scenario-bound explanation + Consent question. Include "concept_tag". Leave other fields null.`;

// Dedicated Victory Lap prompt — used on the single turn after a Direct
// consent_yes exit. Replaces (not appends to) the Socratic system prompt so
// the VIM loop's "ask a micro-step question" rule does not fight the release
// format. A prompt conflict resolved by prompt swap, not by layering.
const VICTORY_LAP_SYSTEM_PROMPT = `You are the Nexford Socratic Mentor handling a VICTORY LAP turn.

The student just affirmed understanding ("yes", "got it", "makes sense") after a Direct-mode explanation. The concept is SETTLED. Your only job on THIS turn is to validate, name the concept, and hand back agency. You are NOT returning to the VIM loop. You are NOT asking a micro-step question about the concept the student just closed.

## MANDATORY FORMAT — exactly three moves, in order

1. VALIDATE + METACOGNITIVE NAMING (one sentence).
   Name the concept they just mastered AND the specific reasoning move they made. Use their scenario's exact nouns and numbers — not generic labels.
   GOOD: "Exactly — the $10,000 server's value gets consumed gradually, so the expense spreads even though the cash left on day one. That's the Matching Principle in action."
   BAD: "Great job!" / "You got it!" (no metacognitive content)

2. RELEASE HANDOFF (one sentence).
   Give them two concrete choices: push deeper on this concept OR move to a new concept.
   GOOD: "Want to push on this with a trickier scenario, or move to a different concept?"

3. STOP. No third sentence. No "one more question". No hidden Socratic hook.

## HARD LIMITS
- Exactly ONE question mark allowed in your entire reply. That question mark must live inside the release handoff.
- If your reply would contain a second question mark, delete that sentence.
- Do NOT restate the explanation from the prior Direct turn.
- Do NOT introduce a new analogy.
- Do NOT ask "does that make sense?" — it is condescending after they already said yes.

## PIVOT CASE
If the student's affirmation ALSO contained a new question (e.g. "yes got it, but what about deferred revenue?"), skip the release handoff entirely and engage the new question in normal Socratic mode. The new topic resets the analogy budget and the question-mark ceiling does not apply to that pivot.

## OUTPUT
Respond with structured JSON. type: "text". Fill "text" with validation + release (or the pivot). Include "concept_tag" naming the concept just closed. Leave other fields null.`;

const QUIZ_GENERATOR_PROMPT = `You are generating an inline CHECKPOINT QUIZ for a student who has just finished reading a section. This quiz probes TRANSFER — can they apply the concept to a situation they have not seen before? Vocabulary recall is explicitly NOT the goal.

## QUIZ REQUIREMENTS
1. ONE multiple-choice question with 3 options (A, B, C). Exactly one correct.
2. Distractors must map to REAL misconceptions a first-year student actually holds — the intuitive-but-wrong read, not silly options.
3. Difficulty: the student cannot answer by pattern-matching the textbook definition. They must walk the reasoning chain from the scenario to the answer.

## STEM RULES — TRANSFER, NOT RECALL
Every stem MUST open with a concrete actor and a concrete action that produces a testable judgment. Use fresh numbers and a fresh context — do NOT reuse the numbers from the lesson text the student just read.

ALLOW patterns (imitate these openings):
- "A founder just paid $X for..."
- "You accrued $X of interest in..."
- "A customer pays $X today for twelve months of..."
- "Your team delivered $X of services in March but the invoice goes out in April..."
- "A bakery buys a $X oven on credit..."

BAN patterns (these stems are forbidden — they test memorization, not transfer):
- "What is <concept>?"
- "Which of the following is the definition of <concept>?"
- "Which statement best describes <concept>?"
- "<Concept> is best defined as..."
- "Which principle applies when..." (too abstract — name the scenario instead)

Every option must also be a concrete action or judgment ("Record $1,000 as insurance expense for January"), never a definition ("It is the principle that matches expenses to revenue").

## FEW-SHOT

GOOD (transfer probe):
{
  "type": "quiz",
  "question": "A bakery pays $6,000 on March 1st for a 6-month equipment warranty. On March 31st, what does the accountant record for March?",
  "options": [
    "$1,000 warranty expense; $5,000 remains on the balance sheet as prepaid warranty",
    "$6,000 warranty expense in March; the warranty is fully consumed once cash leaves",
    "$0 expense until the warranty period ends in August; all $6,000 is deferred"
  ],
  "correct_index": 0,
  "concept_tag": "prepaid_expenses",
  "explanation": "The warranty is consumed at $1,000 per month; matching recognizes one month in March and leaves $5,000 as a prepaid asset.",
  "trigger": "checkpoint"
}

BAD (recall, do NOT produce anything like this):
{
  "type": "quiz",
  "question": "Which of the following best defines the matching principle?",
  "options": ["Expenses are matched to the period they benefit", "Revenue is recognized on cash receipt", "All costs are expensed immediately"],
  "correct_index": 0,
  "concept_tag": "matching_principle",
  "trigger": "checkpoint"
}

## OUTPUT
Structured JSON. type: "quiz". Fill: question (scenario stem following the rules above), options (array of 3 concrete judgments), correct_index (0, 1, or 2), concept_tag (snake_case, e.g. "prepaid_expenses"), explanation (1-sentence clarification of why the correct answer is right, shown after submission), trigger: "checkpoint".`;

const VICTORY_LAP_RECAP_PROMPT = `You are generating a CONCEPT RECAP CARD for a student who just successfully exited Direct instruction mode with an affirmative confirmation. This is the closing artifact of a micro-breakthrough.

## INPUT YOU WILL RECEIVE:
- The student's scenario anchor (the specific business situation they were wrestling with).
- The recent chat history (last few turns).

## YOUR JOB:
Extract the ONE core accounting concept the student just mastered, name it clearly, and write a crisp one-sentence principle they can take away. Do not invent anything that was not covered in the exchange. If multiple concepts appeared, pick the one the Direct explanation centered on.

## RULES:
- mastered: exactly one concept, written as a short human phrase (e.g. "Matching Principle", "Accrual Revenue Recognition"). NOT snake_case.
- struggled: leave as an empty array unless the exchange showed a DIFFERENT concept was explicitly confused — then name it. Prefer the empty array.
- next_focus: one short suggestion for what to try next — either a harder scenario on the same concept or a naturally adjacent concept. Keep it action-oriented ("Try a revenue recognition scenario with partial payment", "Explore how depreciation interacts with asset sales").
- principle: one sentence. Concrete, scenario-anchored when possible. No textbook jargon. 15-25 words.

## CONCEPT_TAG (required):
Include "concept_tag" — a snake_case identifier matching the concept in the "mastered" array (e.g. "Matching Principle" → "matching_principle"). If you receive an "ACTIVE CONCEPT TAG" hint in the user message, default to that value unless the transcript clearly points elsewhere.

## OUTPUT:
Structured JSON. type: "recap". Fill: mastered (array of 1 string), struggled (array, usually empty), next_focus (string), principle (string), concept_tag (snake_case string).`;

// ── Types ───────────────────────────────────────────────────────────

export interface RetrievedChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  source_file: string;
  similarity: number;
}

export type MentorMode = "socratic" | "direct";

export interface ChatTurn {
  role: "student" | "mentor";
  content: string;
  mode?: MentorMode;
  concept_tag?: string;
  kind?: string;
}

export interface LmsContext {
  currentModuleTitle?: string;
  currentLessonSummary?: string;
  deadline?: string;
  lastQuizScore?: { concept: string; score: number };
}

export interface MentorResponse {
  message: AssistantMessage;
  mode: MentorMode;
  modeDecision: DecideModeResult;
  retrievedChunks: RetrievedChunk[];
  model: string;
  tokenUsage: { input: number; output: number; total: number } | null;
  latencyMs: number;
  victoryLap: boolean;
  recap: AssistantMessage | null;
  conceptTag: string | null;
}

// ── ZPD Mode Trigger — hybrid tiered logic + Consent Exit ─────────

/**
 * Hybrid Zone-of-Proximal-Development trigger.
 *
 * Entry (Socratic → Direct):
 *   Tier 1 — deterministic instant flip on give-up phrases, pedagogy
 *            complaints, or certain-but-wrong quiz failures.
 *   Tier 2 — scored accumulation over the last 4 student turns.
 *            Cooperative reasoning attempts decay the score by 30%.
 *            Flip if score >= 50.
 *   Tier 3 — (optional) LLM classifier for ambiguous band (25-49).
 *
 * Exit (Direct → Socratic): Consent Exit.
 *   After at least one Direct mentor turn, parse the student's reply.
 *   Affirmative phrases flip back to Socratic; any negative signal
 *   keeps us in Direct (negative wins on collision).
 */

// Tier 1 — immediate flip on any match
const GIVE_UP_PATTERN =
  /\b(give\s+me\s+the\s+answer|tell\s+me\s+the\s+answer|just\s+tell\s+me|just\s+give\s+me|just\s+(explain|show)\s+(me|it|this)|i\s+give\s+up|for\s+god'?s?\s+sake|god\s+sake|forget\s+it)\b/i;
const PEDAGOGY_COMPLAINT_PATTERN =
  /\b(this\s+is\s+(stupid|dumb|useless|pointless|lying|ridiculous)|makes\s+(no|zero)\s+sense|too\s+confusing|lying\s+about\s+reality)\b/i;

// Tier 2 — scored signals
const IDK_PATTERN =
  /\b(i\s+don'?t\s+know|idk|dk|no\s+idea|no\s+clue|dunno|not\s+sure|am\s+stuck|i'?m\s+stuck|i'?m\s+(totally\s+|completely\s+)?lost|totally\s+lost|i\s+don'?t\s+understand|have\s+no\s+idea)\b/i;
const NEGATIVE_META_PATTERN =
  /\b(this\s+is\s+hard|why\s+does\s+this\s+matter|i\s+hate|this\s+is\s+boring)\b/i;
// Cooperative signals: substantive reasoning decays the score
const REASONING_MARKER_PATTERN =
  /\b(because|if\s+.+then|i\s+think|i\s+believe|maybe|perhaps|therefore|so\s+the|this\s+means|so\s+it|which\s+means)\b/i;
const DIGIT_PATTERN = /\d/;

// Consent Exit
const AFFIRMATIVE_PATTERN =
  /\b(yes|yeah|yep|yup|sure|got\s+it|that'?s\s+clear(er)?|clearer|i\s+(get|understand)\s+(it|that|now)|that\s+helps|makes(\s+\w+){0,2}\s+sense|that\s+makes(\s+\w+){0,2}\s+sense)\b/i;
// Stay-in-Direct: negative consent AND "keep unpacking" requests both block
// the exit. "Break it down further" is semantically a vote to stay in Direct.
const STAY_IN_DIRECT_PATTERN =
  /\b(no|nope|still\s+(confused|lost|stuck|don'?t)|not\s+really|not\s+quite|i\s+don'?t\s+get\s+it|break\s+(it|this|that)\s+down|breakdown|unpack|explain\s+(it\s+)?more|(go\s+)?deeper|more\s+detail|simpler|further|keep\s+going|continue)\b/i;

// Strong affirmation — a tighter subset of AFFIRMATIVE_PATTERN matching only
// phrases that imply mastery, not bare "yes/no" answers to Socratic micro-
// step questions. Used with EARNED_PRAISE_PATTERN as a two-factor check for
// the Universal Victory Lap trigger in pure-Socratic flow.
const STRONG_AFFIRMATION_PATTERN =
  /\b(i\s+(get|understand|see)\s+(it|that|this|now)|makes(\s+\w+){0,2}\s+sense(\s+now)?|that\s+clicks|got\s+it(\s+(now|thanks))?|oh\s+(i\s+see|right)|clear\s+now|i'?m\s+clear)\b/i;

// Earned Praise signature — matches the contract in SOCRATIC_SYSTEM_PROMPT's
// "EXIT CONDITION — Earned Praise" section. When the mentor's prior turn
// starts with one of these openers OR contains a reasoning-name phrase, the
// engine has already decided the student demonstrated mastery. Paired with a
// student's STRONG_AFFIRMATION on the next turn, this triggers the Socratic
// Victory Lap.
const EARNED_PRAISE_PATTERN =
  /^\s*(exactly|precisely|spot\s+on|that'?s\s+it|correct)[.,!—–-]|(notice\s+(what|the\s+move)\s+you\s+just|you\s+just\s+(made|mastered|nailed)|that'?s\s+the\s+[a-z\s]+\s+in\s+practice)/i;

export type QuizConfidence = "guessing" | "fairly_sure" | "certain";

export interface DecideModeInput {
  currentMode: MentorMode;
  history: ChatTurn[];
  currentTurn: string;
  latestQuizResult?: {
    correct: boolean;
    confidence?: QuizConfidence;
  } | null;
}

export type DecideModeReason =
  | "tier1_giveup"
  | "tier1_pedagogy_complaint"
  | "tier1_quiz_fail"
  | "tier2_score"
  | "tier3_classifier"
  | "consent_yes"
  | "topic_shift"
  | "direct_sticky"
  | "unchanged";

export interface DecideModeResult {
  mode: MentorMode;
  reason: DecideModeReason;
  score?: number;
  classifierState?: string;
}

export type FrustrationClassifier = (
  recentStudentTurns: string[],
) => Promise<{ state: string; confidence: number } | null>;

function isCooperative(turn: string): boolean {
  if (!turn) return false;
  const trimmed = turn.trim();
  // A short affirmative reply ("yes", "got it") to a mentor's yes/no
  // micro-step is engagement, not withdrawal — decay the frustration score
  // instead of penalising it. Stay-in-Direct phrases like "no, not really"
  // would also match AFFIRMATIVE_PATTERN on "no" otherwise via word-boundary
  // overlap; the explicit STAY_IN_DIRECT check keeps those out.
  if (AFFIRMATIVE_PATTERN.test(trimmed) && !STAY_IN_DIRECT_PATTERN.test(trimmed)) {
    return true;
  }
  if (trimmed.length < 60) return false;
  return REASONING_MARKER_PATTERN.test(trimmed) || DIGIT_PATTERN.test(trimmed);
}

function isVeryShortUnhelpful(turn: string): boolean {
  const trimmed = turn.trim();
  if (trimmed.length >= 20) return false;
  if (/\d/.test(trimmed)) return false;
  if (/\?/.test(trimmed)) return false;
  // A bare "yes" / "got it" is an answer to a Socratic yes/no, not a shrug.
  if (AFFIRMATIVE_PATTERN.test(trimmed)) return false;
  return true;
}

function scoreTurn(turn: string): number {
  let s = 0;
  if (IDK_PATTERN.test(turn)) s += 25;
  else if (isVeryShortUnhelpful(turn)) s += 15;
  if (NEGATIVE_META_PATTERN.test(turn)) s += 20;
  return s;
}

function computeFrustrationScore(window: string[]): number {
  let score = 0;
  for (const turn of window) {
    if (isCooperative(turn)) {
      score *= 0.7;
      continue;
    }
    score += scoreTurn(turn);
  }
  return Math.round(score);
}

/**
 * Locate the first index in `history` that belongs to the CURRENT mode
 * segment. A segment starts immediately after the last mentor turn whose
 * mode differs from `currentMode` — i.e. the last transition point.
 *
 * Used to prevent the "Poisoned Rolling Window" bug: old frustration
 * turns that already caused a prior Direct cycle must NOT count toward
 * a fresh Tier 2 flip once we've returned to Socratic.
 */
function findCurrentSegmentStart(
  history: ChatTurn[],
  currentMode: MentorMode,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i];
    if (t.role === "mentor" && t.mode && t.mode !== currentMode) {
      return i + 1;
    }
  }
  return 0;
}

// ── Direct-mode scenario anchor ────────────────────────────────────
// In Direct mode, RAG is actively harmful — textbook examples (e.g. "services
// performed in November") contaminate the explanation and override the
// student's actual scenario. We skip RAG and instead extract the student's
// own most concrete scenario statement, injected as the last system message
// so it wins the recency-weighting war against any drift in history.

const DOLLAR_PATTERN = /\$\s?\d[\d,]*/;
const SCENARIO_NOUN_PATTERN =
  /\b(server|laptop|van|truck|policy|insurance|building|equipment|consulting|service|subscription|license|inventory|machine|vehicle|software|loan|revenue|expense|invoice|contract|rent|salary|payroll|asset|depreciation)\b/i;
// Explicit topic-shift markers in the CURRENT student turn. When present,
// ignore the older scenario entirely — the student has told us they have
// moved on. Prevents "Anchor amnesia" where a 200-char $10,000 server
// paragraph from ten turns ago outweighs a short "what about my marketing
// project?" pivot.
const TOPIC_SHIFT_PATTERN =
  /\b(what\s+about|different\s+(question|scenario|example|topic)|another\s+(question|scenario|example|topic)|new\s+question|instead|switch\s+to|move\s+on|now\s+about|pivot|let'?s\s+try|let'?s\s+(switch|move))\b/i;

function trimScenario(s: string): string {
  const t = s.trim();
  return t.length <= 500 ? t : t.slice(0, 500) + "...";
}

function scoreScenarioTurn(c: string): number {
  // Higher = more concrete. $ + noun + length all stack.
  let s = 0;
  if (DOLLAR_PATTERN.test(c)) s += 3;
  if (SCENARIO_NOUN_PATTERN.test(c)) s += 2;
  if (c.length >= 40) s += 1;
  return s;
}

/**
 * Extract the student's most concrete scenario statement.
 *
 * Priority order (recency-first so topic shifts win):
 *   1. Topic-shift detection: if `currentTurn` contains a pivot marker and
 *      has usable content, return it immediately. Past turns are stale.
 *   2. Last 3 student turns — pick the highest-scoring turn (scenarioScore).
 *      Most recent wins ties.
 *   3. Older student turns matching the active concept_tag (if provided).
 *   4. Full-history fallback (most recent with $, then with noun, then
 *      longest) — the original behaviour.
 *
 * Returns null if no usable scenario exists; Direct prompt rule 4 then asks
 * a clarifying question.
 */
function extractStudentScenario(
  history: ChatTurn[],
  currentTurn?: string,
  activeConcept?: string | null,
): string | null {
  const students = history.filter((t) => t.role === "student");

  // Pass 1 — topic shift in the current turn forces a fresh anchor.
  if (currentTurn && TOPIC_SHIFT_PATTERN.test(currentTurn)) {
    const trimmed = currentTurn.trim();
    if (trimmed.length >= 15) {
      return trimScenario(trimmed);
    }
  }

  // Pass 2 — recency-first scan of the last 3 student turns. Short-but-
  // concrete beats old-but-long. Also include currentTurn so a fresh
  // statement can anchor immediately without being written to history first.
  const recent: string[] = students.slice(-3).map((t) => t.content.trim());
  if (currentTurn && currentTurn.trim().length > 0) {
    recent.push(currentTurn.trim());
  }
  let bestRecent: { content: string; score: number; idx: number } | null = null;
  recent.forEach((c, idx) => {
    if (c.length < 15) return;
    const score = scoreScenarioTurn(c);
    if (score <= 0) return;
    if (!bestRecent || score > bestRecent.score || (score === bestRecent.score && idx > bestRecent.idx)) {
      bestRecent = { content: c, score, idx };
    }
  });
  if (bestRecent !== null) {
    return trimScenario((bestRecent as { content: string }).content);
  }

  // Pass 3 — concept-scoped search: only turns tagged with the active
  // concept are valid (avoids reviving a scenario from another concept).
  if (activeConcept) {
    const conceptStudents = history.filter(
      (t) => t.role === "student" && t.concept_tag === activeConcept,
    );
    for (let i = conceptStudents.length - 1; i >= 0; i--) {
      const c = conceptStudents[i].content.trim();
      if (c.length >= 30 && (DOLLAR_PATTERN.test(c) || SCENARIO_NOUN_PATTERN.test(c))) {
        return trimScenario(c);
      }
    }
  }

  // Pass 4 — original fallback (no recency, no scope).
  for (let i = students.length - 1; i >= 0; i--) {
    const c = students[i].content.trim();
    if (c.length >= 30 && DOLLAR_PATTERN.test(c)) return trimScenario(c);
  }
  for (let i = students.length - 1; i >= 0; i--) {
    const c = students[i].content.trim();
    if (c.length >= 30 && SCENARIO_NOUN_PATTERN.test(c)) return trimScenario(c);
  }
  const longest = students
    .map((t) => t.content.trim())
    .filter((c) => c.length >= 30)
    .sort((a, b) => b.length - a.length)[0];
  return longest ? trimScenario(longest) : null;
}

// ── Analogy budget tracker (Socratic) ─────────────────────────────
// Bridge analogies are "one per concept per session". Prose rules get
// ignored by the model, so we detect prior use programmatically and inject
// a hard-ban system message when the budget is spent. We only scan MENTOR
// turns — a student saying "I have a gym membership" is scenario context,
// not a prior analogy.
const ANALOGY_KEYWORDS_PATTERN =
  /\b(netflix|streaming|gym|membership|subscription|concert\s+ticket|season\s+pass|phone\s+plan|spotify)\b/i;

function detectPriorAnalogy(history: ChatTurn[]): boolean {
  return history.some(
    (t) => t.role === "mentor" && ANALOGY_KEYWORDS_PATTERN.test(t.content),
  );
}

/**
 * Find the most recent mentor turn that was delivered in Direct mode.
 * Used to inject the prior reply verbatim when the student asks to break it
 * down further, so the model sees explicitly what it must NOT paraphrase.
 */
function extractPriorDirectReply(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === "mentor" && turn.mode === "direct") {
      return turn.content;
    }
  }
  return null;
}

/**
 * Count student breakdown requests since the current Direct segment began.
 * A "breakdown" is any student turn matching STAY_IN_DIRECT_PATTERN inside
 * the current mode segment. Used to trigger a diagnostic pivot after the
 * third request — shrink-the-unit strategies hit a pedagogical dead-end
 * when the student keeps asking to go deeper; at that point we want the
 * model to pause and ask which specific piece is unclear.
 */
function countBreakdownRequestsInSegment(
  history: ChatTurn[],
  currentMode: MentorMode,
): number {
  const start = findCurrentSegmentStart(history, currentMode);
  let count = 0;
  for (let i = start; i < history.length; i++) {
    const t = history[i];
    if (t.role === "student" && STAY_IN_DIRECT_PATTERN.test(t.content)) {
      count++;
    }
  }
  return count;
}

export async function decideMode(
  input: DecideModeInput,
  classifier?: FrustrationClassifier,
): Promise<DecideModeResult> {
  const { currentMode, history, currentTurn, latestQuizResult } = input;
  const studentTurns = history.filter((t) => t.role === "student");
  const mentorTurns = history.filter((t) => t.role === "mentor");
  const turn = currentTurn ?? "";

  // ── Direct → Socratic (Consent Exit) ─────────────────────────────
  if (currentMode === "direct") {
    const lastMentor = mentorTurns[mentorTurns.length - 1];
    // Stay in direct until at least one direct mentor turn has been delivered.
    if (!lastMentor || lastMentor.mode !== "direct") {
      return { mode: "direct", reason: "direct_sticky" };
    }

    const hasStayInDirect = STAY_IN_DIRECT_PATTERN.test(turn) ||
      IDK_PATTERN.test(turn) ||
      GIVE_UP_PATTERN.test(turn) ||
      PEDAGOGY_COMPLAINT_PATTERN.test(turn);
    const hasAffirmative = AFFIRMATIVE_PATTERN.test(turn);

    // Stay-in-Direct wins on collision with affirmative (e.g. "yes but
    // break it down further" still means keep unpacking).
    if (hasStayInDirect) {
      return { mode: "direct", reason: "direct_sticky" };
    }
    if (hasAffirmative) {
      return { mode: "socratic", reason: "consent_yes" };
    }

    const trimmed = turn.trim();
    // Topic shift: a new substantive question in Direct mode means the
    // student moved on without explicitly confirming mastery. Flip to
    // Socratic under a distinct reason so the Victory Lap path (gated on
    // consent_yes) doesn't fire and leak the old topic's closure onto the
    // new question. A soft "topic closed" recap surfaces for the old
    // concept; the Socratic loop engages the new one fresh.
    const endsWithQuestion = /\?\s*$/.test(trimmed);
    if (endsWithQuestion && trimmed.length >= 20) {
      return { mode: "socratic", reason: "topic_shift" };
    }

    // Ambiguous (short, no pattern match): stay direct once; if the prior
    // student turn in direct mode was also ambiguous, try the classifier.
    if (trimmed.length < 15) {
      const priorStudent = studentTurns[studentTurns.length - 1];
      const priorAmbiguous =
        priorStudent &&
        priorStudent.content.trim().length < 15 &&
        !AFFIRMATIVE_PATTERN.test(priorStudent.content) &&
        !STAY_IN_DIRECT_PATTERN.test(priorStudent.content);
      if (priorAmbiguous && classifier) {
        const recent = [
          ...studentTurns.slice(-2).map((t) => t.content),
          turn,
        ];
        const result = await classifier(recent);
        if (
          result &&
          (result.state === "frustrated" || result.state === "giving_up") &&
          result.confidence >= 0.7
        ) {
          return {
            mode: "direct",
            reason: "tier3_classifier",
            classifierState: result.state,
          };
        }
        // Cooperative/struggling but not giving up — release them.
        return {
          mode: "socratic",
          reason: "consent_yes",
          classifierState: result?.state,
        };
      }
      return { mode: "direct", reason: "direct_sticky" };
    }

    // Long reply with no explicit signal: only release if the student is
    // actually reasoning. "Break it down further" (21 chars, no cooperative
    // signal) would already have matched STAY_IN_DIRECT_PATTERN above; this
    // branch catches substantive reasoning attempts that show engagement.
    const hasCooperativeSignal =
      REASONING_MARKER_PATTERN.test(turn) || DIGIT_PATTERN.test(turn);
    if (hasCooperativeSignal && trimmed.length >= 40 && !endsWithQuestion) {
      return { mode: "socratic", reason: "consent_yes" };
    }
    return { mode: "direct", reason: "direct_sticky" };
  }

  // ── Socratic → Direct entry ──────────────────────────────────────

  // Tier 1a — quiz failure (certain-but-wrong is the clearest signal)
  if (latestQuizResult && latestQuizResult.correct === false) {
    if (latestQuizResult.confidence && latestQuizResult.confidence !== "guessing") {
      return { mode: "direct", reason: "tier1_quiz_fail" };
    }
    // Guessing-wrong does NOT instant-flip — it feeds the Tier 2 score below.
  }

  // Tier 1b — give-up phrases
  if (GIVE_UP_PATTERN.test(turn)) {
    return { mode: "direct", reason: "tier1_giveup" };
  }

  // Tier 1c — pedagogy / frustration complaints
  if (PEDAGOGY_COMPLAINT_PATTERN.test(turn)) {
    return { mode: "direct", reason: "tier1_pedagogy_complaint" };
  }

  // Tier 2 — rolling score over the last 4 student turns INSIDE the current
  // mode segment. Turns from before the last mode transition are excluded to
  // prevent the "Poisoned Rolling Window" bug (old IDKs from a previous
  // Direct cycle re-triggering a fresh intervention).
  const segmentStart = findCurrentSegmentStart(history, currentMode);
  const segmentStudentTurns = history
    .slice(segmentStart)
    .filter((t) => t.role === "student");
  const segmentStudent = segmentStudentTurns
    .slice(-3)
    .map((t) => t.content);
  const window = [...segmentStudent, turn];

  // Consent-exit dwell: when we just returned to Socratic via consent_yes,
  // give the student at least 2 substantive turns before Tier 2/3 can re-
  // flip to Direct. Otherwise a single "I'm still a bit stuck" immediately
  // after a Victory Lap throws them right back into Direct — the churniest
  // possible UX. Tier 1 (give-up / pedagogy-complaint / certain-wrong quiz)
  // still pierces the dwell above; this only suppresses the ambiguous tiers.
  const priorMentor = segmentStart > 0 ? history[segmentStart - 1] : null;
  const isFreshSocraticSegment =
    currentMode === "socratic" &&
    priorMentor?.role === "mentor" &&
    priorMentor.mode === "direct" &&
    segmentStudentTurns.length < 2;

  let score = computeFrustrationScore(window);

  // A guessing-but-wrong quiz turn adds 20 to the score without forcing a flip.
  if (
    latestQuizResult &&
    latestQuizResult.correct === false &&
    latestQuizResult.confidence === "guessing"
  ) {
    score += 20;
  }

  if (isFreshSocraticSegment) {
    return { mode: "socratic", reason: "unchanged", score };
  }

  if (score >= 50) {
    return { mode: "direct", reason: "tier2_score", score };
  }

  // Tier 3 — ambiguous band (25-49), optional LLM classifier
  if (score >= 25 && classifier) {
    const result = await classifier(window);
    if (
      result &&
      (result.state === "frustrated" || result.state === "giving_up") &&
      result.confidence >= 0.7
    ) {
      return {
        mode: "direct",
        reason: "tier3_classifier",
        score,
        classifierState: result.state,
      };
    }
  }

  return { mode: "socratic", reason: "unchanged", score };
}

// ── RAG retrieval ──────────────────────────────────────────────────

async function retrieveContext(
  sb: SupabaseClient,
  queryEmbedding: number[],
  courseId: string,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_course_id: courseId,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    console.error(
      "[Mentor] RAG retrieval error:",
      error.message,
      error.details,
      error.hint,
    );
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}

function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No specific course material was retrieved. Apply the concepts you already know to the student's scenario.";
  }
  return chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.source_file} (${(c.similarity * 100).toFixed(0)}%)]\n${c.content}`,
    )
    .join("\n\n---\n\n");
}

function buildLmsContextBlock(lms?: LmsContext): string {
  if (!lms) return "";
  const parts: string[] = [];
  if (lms.currentModuleTitle)
    parts.push(`Current module: ${lms.currentModuleTitle}`);
  if (lms.deadline) parts.push(`Next deadline: ${lms.deadline}`);
  if (lms.lastQuizScore)
    parts.push(
      `Last quiz: ${lms.lastQuizScore.concept} — ${lms.lastQuizScore.score}%`,
    );
  if (lms.currentLessonSummary)
    parts.push(`Current lesson summary: ${lms.currentLessonSummary}`);
  return parts.length > 0
    ? `## STUDENT CONTEXT (from LMS):\n${parts.join("\n")}`
    : "";
}

function buildMessages(opts: {
  prompt: string;
  question: string;
  context: string;
  lmsBlock: string;
  history: ChatTurn[];
  scenarioAnchor?: string | null;
  analogyLocked?: boolean;
  priorDirectReply?: string | null;
  diagnosticPivot?: boolean;
}): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.prompt },
  ];
  if (opts.lmsBlock) {
    msgs.push({ role: "system", content: opts.lmsBlock });
  }
  msgs.push({
    role: "system",
    content: `## COURSE MATERIAL CONTEXT:\n\n${opts.context}`,
  });

  for (const t of opts.history.slice(-10)) {
    msgs.push({
      role: t.role === "student" ? "user" : "assistant",
      content: t.content,
    });
  }

  if (opts.scenarioAnchor) {
    msgs.push({
      role: "system",
      content:
        `## CURRENT STUDENT SCENARIO (ANCHOR — this is the ONLY scenario you may use):\n\n"${opts.scenarioAnchor}"\n\n` +
        `Your explanation MUST use the exact nouns and numbers from the anchor above. Do NOT use examples from earlier turns that diverged from this anchor (e.g. if the anchor is about a server but a prior turn drifted to a consulting service, ignore the drift and return to the server). Do NOT introduce new examples.\n\n` +
        `BANNED GENERIC TERMS as scenario stand-ins: you may not substitute the student's specific nouns with any of the following: "the service", "the work", "the product", "the business", "the project", "the asset", "the expense", "the revenue", "the transaction", "the item", "the equipment". Use the student's exact noun in every sentence. If they said "$10,000 server", say "the $10,000 server" or "the server" — never "the asset" or "the equipment". If the student themselves used one of these words in their scenario (e.g. they literally said "my consulting service"), you may echo it — but never substitute it for a more specific noun.`,
    });
  }

  if (opts.analogyLocked) {
    msgs.push({
      role: "system",
      content:
        "## ANALOGY BUDGET EXHAUSTED\n\nA bridge analogy was already used in a prior mentor turn on the current topic. You MUST NOT introduce ANY new analogy in this reply (no Netflix, no gym, no concert ticket, no season pass, no phone plan, no streaming, no subscription, no membership metaphors). Stay strictly with the student's own nouns and numbers. If the concept still needs illumination, shrink the micro-step question instead of reaching for a second analogy.",
    });
  }

  if (opts.priorDirectReply) {
    msgs.push({
      role: "system",
      content:
        `## YOUR PRIOR DIRECT REPLY (DO NOT PARAPHRASE)\n\n"${opts.priorDirectReply}"\n\n` +
        `The student just asked you to break it down further. You are FORBIDDEN from re-stating any of the sentences above in different words. Pick exactly ONE shrink-the-unit strategy:\n` +
        `- TIME: drop to a single day or hour instead of the year/month used above.\n` +
        `- MONEY: drop to the first $1 or a single unit instead of the total dollar amount used above.\n` +
        `- INVERT: explain why the OPPOSITE choice would be wrong, instead of restating why the correct choice is right.\n\n` +
        `Your sentence structure and opening clause must be visibly different from the prior reply. A reader comparing the two should say "different angle", not "rephrase". Stay within the follow-up word cap (~30 words, max 2 sentences) on the exact same scenario nouns and numbers.`,
    });
  }

  if (opts.diagnosticPivot) {
    msgs.push({
      role: "system",
      content:
        "## DIAGNOSTIC PIVOT — MANDATORY\n\n" +
        "The student has now asked to break it down TWO OR MORE times in a row. Shrink-the-unit strategies have run their course; shrinking further is no longer useful. You are BANNED from producing another shrunk explanation this turn.\n\n" +
        "Instead, output exactly this shape:\n" +
        "1. ONE short acknowledgement sentence (max ~12 words). Example: \"Let me meet you where it's cloudy.\"\n" +
        "2. ONE diagnostic question asking WHICH SPECIFIC PIECE is still unclear, offering 2-3 concrete options from this list: (a) the timing, (b) the math, (c) the underlying rule, (d) why it matters in practice. Example: \"Is it the timing, the math, or why this rule exists that's still fuzzy?\"\n\n" +
        "Total length: 2 sentences, ~25 words. NO explanation, NO scenario re-statement, NO shrinking. Just acknowledgement + the diagnostic question. The goal is to collect a clearer signal about what actually needs work, not to keep pushing explanations the student isn't absorbing.",
    });
  }

  msgs.push({ role: "user", content: opts.question });
  return msgs;
}

// ── Public API ─────────────────────────────────────────────────────

export async function runSocraticMentor(
  sb: SupabaseClient,
  opts: {
    question: string;
    courseId: string;
    history?: ChatTurn[];
    currentMode?: MentorMode;
    lms?: LmsContext;
    latestQuizResult?: {
      correct: boolean;
      confidence?: QuizConfidence;
    } | null;
    classifier?: FrustrationClassifier;
    log?: (...args: unknown[]) => void;
  },
): Promise<MentorResponse> {
  const L = opts.log ?? ((...args: unknown[]) => console.log("[Mentor]", ...args));
  const t0 = Date.now();

  const history = opts.history ?? [];
  const currentMode = opts.currentMode ?? "socratic";
  const modeDecision = await decideMode(
    {
      currentMode,
      history,
      currentTurn: opts.question,
      latestQuizResult: opts.latestQuizResult ?? null,
    },
    opts.classifier,
  );
  const nextMode = modeDecision.mode;
  L(
    `Mode: ${currentMode} -> ${nextMode} (reason=${modeDecision.reason}${
      modeDecision.score != null ? `, score=${modeDecision.score}` : ""
    })`,
  );

  let chunks: RetrievedChunk[] = [];
  let contextBlock: string;
  if (nextMode === "direct") {
    contextBlock =
      "Direct instruction mode: no textbook retrieval. Ground the explanation strictly in the student's stated scenario provided below.";
    L("Direct mode — skipping RAG retrieval");
  } else {
    L("Embed...");
    const queryEmbedding = await embedText(opts.question);
    L("RAG...");
    chunks = await retrieveContext(sb, queryEmbedding, opts.courseId);
    L(`Retrieved ${chunks.length} chunks`);
    contextBlock = buildContextBlock(chunks);
  }

  const lmsBlock = buildLmsContextBlock(opts.lms);

  // Victory Lap: pre-generation trigger.
  //   Direct -> Socratic via consent_yes — swap to VICTORY_LAP_SYSTEM_PROMPT
  //   (no VIM loop conflict) and emit a recap card in PARALLEL with the
  //   main reply.
  //
  // Eager Socratic VL (post-generation): when we're already in pure Socratic
  // mode and the mentor's own generated reply matches EARNED_PRAISE_PATTERN,
  // we fire the recap sequentially after the fact. Detection happens below
  // once the completion is parsed. This eliminates the whole-turn delay that
  // the old two-factor check required.
  //
  // Topic shift (separate path): Direct -> Socratic via a new question
  // without explicit consent. The main reply stays on SOCRATIC_SYSTEM_PROMPT
  // (engage the NEW topic fresh) but we still emit a soft "topic_closed"
  // recap card for the OLD concept so the student gets closure without a
  // false mastery claim.
  const justExitedDirect =
    currentMode === "direct" &&
    nextMode === "socratic" &&
    modeDecision.reason === "consent_yes";
  const isVictoryLapTurn = justExitedDirect;
  const topicShift =
    currentMode === "direct" &&
    nextMode === "socratic" &&
    modeDecision.reason === "topic_shift";
  if (justExitedDirect) {
    L("Victory Lap — consent_yes exit from direct, swapping to VICTORY_LAP_SYSTEM_PROMPT");
  } else if (topicShift) {
    L("Topic shift — direct -> socratic via new question, emitting soft 'topic_closed' recap for old concept");
  }

  // Active concept = most recent mentor concept_tag in history. Used to
  // scope anchor extraction so we don't dredge a scenario from a closed
  // topic. Hoisted above the verification probe block since the probe
  // needs it to choose a catalog entry.
  const activeConcept: string | null =
    [...history].reverse().find(
      (t) => t.role === "mentor" && t.concept_tag,
    )?.concept_tag ?? null;

  // "I get it" verification probe (Phase 3 Block A): on a Direct → Socratic
  // consent_yes exit, gate the Victory Lap on a transfer-style scenario
  // quiz BEFORE declaring mastery. "I get it" by itself is a polite signal,
  // not a competence signal — a transfer probe is the cheapest way to tell
  // them apart. Skip the LLM call entirely (we use a hand-curated catalog),
  // and skip the recap; the recap fires from handleQuizResponse on a
  // correct answer to the confirmation quiz.
  if (justExitedDirect) {
    const probeConcept = canonicalConceptTag(activeConcept) ?? activeConcept;
    const probeBase = probeConcept ? scenarioFallbackQuiz(probeConcept) : null;
    if (probeBase && probeBase.type === "quiz") {
      L(`Verification probe — emitting confirmation quiz on "${probeConcept}" before Victory Lap`);
      const probe: AssistantMessage = {
        ...probeBase,
        trigger: "confirmation",
      };
      return {
        message: probe,
        mode: nextMode,
        modeDecision,
        retrievedChunks: [],
        model: "verification-probe",
        tokenUsage: null,
        latencyMs: Date.now() - t0,
        // Held back: fires from handleQuizResponse when the probe is
        // answered correctly. If we set victoryLap=true here the seal
        // would close the topic before the student demonstrates competence.
        victoryLap: false,
        recap: null,
        conceptTag: probe.concept_tag,
      };
    }
    L("No catalog probe for active concept — falling through to standard Victory Lap");
  }

  const basePrompt = isVictoryLapTurn
    ? VICTORY_LAP_SYSTEM_PROMPT
    : nextMode === "socratic"
      ? SOCRATIC_SYSTEM_PROMPT
      : DIRECT_SYSTEM_PROMPT;
  const prompt = `${basePrompt}\n\n${ASSISTANT_MESSAGE_SCHEMA_PROMPT}`;
  const scenarioAnchor =
    nextMode === "direct"
      ? extractStudentScenario(history, opts.question, activeConcept)
      : null;
  if (scenarioAnchor) {
    L(`Direct anchor: "${scenarioAnchor.slice(0, 80)}${scenarioAnchor.length > 80 ? "..." : ""}"`);
  }

  // In Direct mode, trim history aggressively so persisted cross-session
  // content (from chat_logs rows keyed to the same sessionStorage id) cannot
  // overwrite the scenario anchor. Anchor extraction above still walks the
  // FULL history, so the opening scenario survives even if it's >6 turns back.
  const effectiveHistory =
    nextMode === "direct"
      ? history
          .slice(findCurrentSegmentStart(history, currentMode))
          .slice(-6)
      : history;
  if (nextMode === "direct") {
    L(`Direct history trimmed: ${history.length} -> ${effectiveHistory.length} turns`);
  }

  // Analogy budget: if ANY prior mentor turn used a bridge analogy on this
  // topic, we inject a hard-ban system note for Socratic replies. Prose rules
  // alone get ignored; a fresh system message between RAG and the user
  // question wins the recency-weighting war.
  const analogyLocked =
    nextMode === "socratic" && detectPriorAnalogy(history);
  if (analogyLocked) {
    L("Analogy budget exhausted — injecting ban");
  }

  // Anti-paraphrase: when the student stays in Direct and explicitly asks to
  // break it down (STAY_IN_DIRECT_PATTERN), the prior Direct reply is
  // extracted verbatim and passed to buildMessages so the model sees exactly
  // what it must NOT restate. Prose rules about shrink-the-unit are routinely
  // ignored without the verbatim contrast.
  const isBreakdownRequest =
    nextMode === "direct" &&
    modeDecision.reason === "direct_sticky" &&
    STAY_IN_DIRECT_PATTERN.test(opts.question);
  const priorDirectReply = isBreakdownRequest
    ? extractPriorDirectReply(history)
    : null;
  if (priorDirectReply) {
    L(`Anti-paraphrase — injecting prior Direct reply (${priorDirectReply.length} chars)`);
  }

  // Diagnostic pivot: after two breakdown requests in the current Direct
  // segment, stop shrinking and ask the student WHICH piece is unclear.
  // Current turn counts as #1, so we only trigger once history already
  // contains >= 2 prior breakdowns.
  const breakdownDepth = isBreakdownRequest
    ? countBreakdownRequestsInSegment(history, currentMode) + 1
    : 0;
  const diagnosticPivot = breakdownDepth >= 3;
  if (diagnosticPivot) {
    L(`Diagnostic pivot — breakdownDepth=${breakdownDepth}, injecting pivot`);
  }

  const messages = buildMessages({
    prompt,
    question: opts.question,
    context: contextBlock,
    lmsBlock,
    history: effectiveHistory,
    scenarioAnchor,
    analogyLocked,
    priorDirectReply,
    diagnosticPivot,
  });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // On Victory Lap OR Topic Shift, fire the recap generator in parallel
  // with the main completion. Added latency is bounded by the slower of the
  // two requests rather than summed. Recap failure is best-effort — null
  // just means no card. Variant determines framing: "mastered" for a real
  // Victory Lap, "topic_closed" for a soft topic-shift closure.
  const recapPromise: Promise<AssistantMessage | null> =
    isVictoryLapTurn || topicShift
      ? generateVictoryLapRecap({
          scenarioAnchor,
          history,
          activeConcept,
          variant: topicShift ? "topic_closed" : "mastered",
          log: (...args) => L(...args),
        })
      : Promise.resolve(null);

  const [completion, recap] = await Promise.all([
    client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 768,
      response_format: { type: "json_object" },
    }),
    recapPromise,
  ]);

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let assistantMessage: AssistantMessage;
  try {
    assistantMessage = normalizeAssistantMessage(JSON.parse(raw));
  } catch {
    assistantMessage = { type: "text", text: raw || "Not quite. Let us step back." };
  }

  const usage = completion.usage;

  // Eager Socratic Victory Lap: if we're in pure Socratic mode (no pre-
  // generation VL / topic_shift path fired) and the mentor's own reply
  // matches EARNED_PRAISE_PATTERN, treat THIS turn as the mastery moment.
  // The recap fires sequentially below — we don't have to wait a whole turn
  // for the student to say "got it" before showing the card.
  const isSocraticTurn = currentMode === "socratic" && nextMode === "socratic";
  let eagerSocraticVL = false;
  if (
    isSocraticTurn &&
    !isVictoryLapTurn &&
    !topicShift &&
    assistantMessage.type === "text" &&
    EARNED_PRAISE_PATTERN.test(assistantMessage.text)
  ) {
    eagerSocraticVL = true;
    L("Eager Victory Lap — mentor reply matched Earned Praise in pure Socratic mode");
  }

  // Resolve the outbound concept_tag: prefer the model's emission, fall back
  // to the active concept already in history so every mentor row carries a
  // tag even when the model forgets to emit one.
  const rawMessageTag =
    assistantMessage.type === "quiz"
      ? assistantMessage.concept_tag
      : assistantMessage.type === "text"
        ? assistantMessage.concept_tag
        : assistantMessage.type === "recap"
          ? assistantMessage.concept_tag
          : undefined;
  // Canonicalize every emission so the outbound message, the knowledge
  // graph, and any downstream sealing speak the same vocabulary. We also
  // canonicalize activeConcept because it came from prior history which
  // may pre-date the alias table.
  const messageTag = canonicalConceptTag(rawMessageTag);
  const canonicalActive = canonicalConceptTag(activeConcept);
  const resolvedConceptTag: string | null =
    messageTag ?? canonicalActive ?? null;
  if (resolvedConceptTag && rawMessageTag !== resolvedConceptTag) {
    if (assistantMessage.type === "text") {
      assistantMessage = {
        ...assistantMessage,
        concept_tag: resolvedConceptTag,
      };
    } else if (assistantMessage.type === "recap") {
      assistantMessage = {
        ...assistantMessage,
        concept_tag: resolvedConceptTag,
      };
    } else if (assistantMessage.type === "quiz") {
      assistantMessage = {
        ...assistantMessage,
        concept_tag: resolvedConceptTag,
      };
    }
  }

  // Sequential recap for eager Socratic VL. We bind the recap to the CURRENT
  // turn's concept_tag (messageTag) preferentially — that's the concept the
  // mentor just praised, which may differ from the broader activeConcept when
  // a new micro-topic was just mastered. Added latency is ~0.8-1.5s, far
  // better than the whole extra turn the old two-factor approach required.
  let eagerRecap: AssistantMessage | null = null;
  if (eagerSocraticVL) {
    eagerRecap = await generateVictoryLapRecap({
      scenarioAnchor,
      history,
      activeConcept: messageTag ?? activeConcept,
      variant: "mastered",
      log: (...args) => L(...args),
    });
  }

  const latencyMs = Date.now() - t0;

  return {
    message: assistantMessage,
    mode: nextMode,
    modeDecision,
    retrievedChunks: chunks,
    model: CHAT_MODEL,
    tokenUsage: usage
      ? {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens,
        }
      : null,
    latencyMs,
    victoryLap: isVictoryLapTurn || eagerSocraticVL,
    recap: recap ?? eagerRecap,
    conceptTag: resolvedConceptTag,
  };
}

/**
 * Generate a checkpoint quiz for the concept a student has just finished reading.
 * Called when the scroll-to-bottom detector fires `nx:checkpoint`.
 */
export async function generateCheckpointQuiz(
  sb: SupabaseClient,
  opts: {
    concept: string;
    courseId: string;
    lms?: LmsContext;
    log?: (...args: unknown[]) => void;
  },
): Promise<{ message: AssistantMessage; chunks: RetrievedChunk[] }> {
  const L = opts.log ?? ((...args: unknown[]) => console.log("[Quiz]", ...args));

  L(`Generating quiz for concept: ${opts.concept}`);
  const queryEmbedding = await embedText(opts.concept);
  const chunks = await retrieveContext(sb, queryEmbedding, opts.courseId);
  const contextBlock = buildContextBlock(chunks);
  const lmsBlock = buildLmsContextBlock(opts.lms);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content: `${QUIZ_GENERATOR_PROMPT}\n\n${ASSISTANT_MESSAGE_SCHEMA_PROMPT}`,
      },
      ...(lmsBlock ? [{ role: "system" as const, content: lmsBlock }] : []),
      { role: "system", content: `## COURSE MATERIAL:\n${contextBlock}` },
      {
        role: "user",
        content: `Generate one checkpoint quiz on the concept: "${opts.concept}". Ground the scenario in a realistic business situation the student could encounter.`,
      },
    ],
    temperature: 0.5,
    max_tokens: 512,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let message: AssistantMessage;
  try {
    message = normalizeAssistantMessage(JSON.parse(raw));
  } catch {
    // Scenario-style fallback keyed to the section's concept — still honors
    // the transfer-probe rule even when the model returns malformed JSON.
    // Concept-specific where we have a well-defined canonical; otherwise a
    // generic "apply it" prompt rather than a definition question.
    const canon = canonicalConceptTag(opts.concept) ?? opts.concept;
    message = scenarioFallbackQuiz(canon);
  }

  // Canonicalize the outbound concept_tag so client-side sealing and the
  // knowledge graph all key on the same vocabulary.
  if (message.type === "quiz") {
    const canonical = canonicalConceptTag(message.concept_tag) ?? opts.concept;
    message = { ...message, concept_tag: canonical };
  } else if (message.type === "text" && message.concept_tag) {
    const canonical = canonicalConceptTag(message.concept_tag);
    if (canonical) message = { ...message, concept_tag: canonical };
  }

  return { message, chunks };
}

/**
 * Scenario-style fallback quiz generator — used only when the model's
 * response fails to parse. Keyed to the canonical concept so the fallback
 * still obeys the "transfer, not recall" rule of the main prompt.
 */
function scenarioFallbackQuiz(concept: string): AssistantMessage {
  const catalog: Record<
    string,
    { question: string; options: [string, string, string]; correct: number; explanation: string }
  > = {
    prepaid_expenses: {
      question:
        "A consulting firm pays $24,000 on April 1st for a 12-month software license. On April 30th, what expense does the firm recognize for April?",
      options: [
        "$2,000; the remaining $22,000 sits on the balance sheet as prepaid software",
        "$24,000; the full payment hit the bank, so the full cost is expensed",
        "$0; no expense until the license term ends",
      ],
      correct: 0,
      explanation:
        "The license is consumed at $2,000 per month. Matching recognizes one month in April and leaves $22,000 as a prepaid asset.",
    },
    revenue_recognition: {
      question:
        "A tutoring business collects $6,000 on February 1st for six months of weekly sessions. How much revenue does it recognize in February?",
      options: [
        "$1,000; only the portion of service actually delivered in February counts",
        "$6,000; the cash is in the bank, so the revenue is booked in full",
        "$0; revenue is deferred until every session is completed in July",
      ],
      correct: 0,
      explanation:
        "Under accrual, revenue is earned as the service is delivered. One of six months earns one-sixth of the fee.",
    },
    accrual_vs_cash: {
      question:
        "A freelancer finishes a $4,000 project in June and sends the invoice the same day; the client pays in July. Under accrual accounting, when is revenue recognized?",
      options: [
        "June — revenue follows the economic event, not the cash",
        "July — revenue is recognized when cash clears",
        "Split 50/50 across June and July",
      ],
      correct: 0,
      explanation:
        "Accrual recognizes revenue when the service is delivered. The July cash receipt is a separate settlement event.",
    },
    accounting_equation: {
      question:
        "A startup borrows $80,000 from a bank to buy delivery vehicles. Immediately after the loan draws and the vehicles are purchased, what happens to the accounting equation?",
      options: [
        "Assets +$80,000 and Liabilities +$80,000; Equity unchanged",
        "Assets +$80,000 and Equity +$80,000; Liabilities unchanged",
        "Assets unchanged; Liabilities +$80,000 and Equity −$80,000",
      ],
      correct: 0,
      explanation:
        "Financing transactions add equal amounts to assets (the vehicles) and liabilities (the loan). Equity does not move because no owner put in capital and no profit was earned.",
    },
    matching_principle: {
      question:
        "A florist receives a $900 utility bill in early April for electricity consumed in March. Under the matching principle, which month carries the expense?",
      options: [
        "March — the period the electricity was actually consumed",
        "April — the period the bill arrived and will be paid",
        "Split evenly between March and April",
      ],
      correct: 0,
      explanation:
        "Matching ties expenses to the period they benefit. The electricity fueled March's operations, so March absorbs the cost.",
    },
  };
  const entry = catalog[concept];
  if (entry) {
    return {
      type: "quiz",
      question: entry.question,
      options: entry.options as unknown as string[],
      correct_index: entry.correct,
      concept_tag: concept,
      explanation: entry.explanation,
      trigger: "checkpoint",
    };
  }
  return {
    type: "text",
    text: "Let me ground this in a concrete situation instead of a quiz. Picture a real transaction where this concept shows up — walk me through what you would record and why.",
  };
}

/**
 * Generate a concept recap card for a Victory Lap (Direct -> Socratic via
 * consent_yes). Runs in parallel with the main Victory Lap text reply and is
 * best-effort — on any error we return null and the drawer just skips the
 * card. Does NOT call RAG; the recap is grounded in the conversation itself,
 * not course material, so a stray chunk cannot pollute the concept name.
 */
export async function generateVictoryLapRecap(
  opts: {
    scenarioAnchor: string | null;
    history: ChatTurn[];
    activeConcept?: string | null;
    variant?: "mastered" | "topic_closed";
    log?: (...args: unknown[]) => void;
  },
): Promise<AssistantMessage | null> {
  const L = opts.log ?? ((...args: unknown[]) => console.log("[Recap]", ...args));
  const variant = opts.variant ?? "mastered";

  try {
    const recent = opts.history.slice(-8);
    const transcript = recent
      .map((t) => `${t.role === "student" ? "Student" : "Mentor"}: ${t.content}`)
      .join("\n");
    const anchorLine = opts.scenarioAnchor
      ? `## SCENARIO ANCHOR\n"${opts.scenarioAnchor}"`
      : "(no anchor available — infer from transcript)";
    const conceptHint = opts.activeConcept
      ? `## ACTIVE CONCEPT TAG\n"${opts.activeConcept}" (use this as the recap concept_tag unless the transcript clearly points to a different concept).`
      : "";

    // Variant switch: "mastered" emits the celebratory Victory Lap recap.
    // "topic_closed" is the soft version fired when a student changed topics
    // without explicitly confirming understanding — acknowledge what was
    // covered, do NOT claim mastery.
    const variantPrompt =
      variant === "topic_closed"
        ? `${VICTORY_LAP_RECAP_PROMPT}\n\n## VARIANT OVERRIDE: TOPIC CLOSED (NOT MASTERED)\nThe student moved to a new topic WITHOUT explicitly confirming they understood. You MUST frame this recap as a topic closure, not a mastery claim.\n- "mastered" array: list ONE concept that was COVERED in the exchange (neutral phrasing like "Accrual Revenue Recognition" is fine — the UI will label it "Concepts covered", not "Mastered today").\n- "principle": one neutral sentence about what the exchange explored. NEVER use "mastered", "nailed", "got it", or celebratory language. Use words like "explored", "discussed", "introduced".\n- "next_focus": suggest revisiting the topic or trying a concrete scenario. Action-oriented but not triumphant.\n- Set "variant": "topic_closed" in the output.`
        : `${VICTORY_LAP_RECAP_PROMPT}\n\n## VARIANT: MASTERED\nSet "variant": "mastered" in the output.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${variantPrompt}\n\n${ASSISTANT_MESSAGE_SCHEMA_PROMPT}`,
        },
        {
          role: "user",
          content: `${anchorLine}\n\n${conceptHint}\n\n## RECENT TRANSCRIPT\n${transcript}\n\nProduce the recap card for the concept this exchange ${variant === "topic_closed" ? "covered (student moved on without confirming mastery)" : "closed"}. Include "concept_tag" in snake_case and "variant": "${variant}".`,
        },
      ],
      temperature: 0.3,
      max_tokens: 256,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed = normalizeAssistantMessage(JSON.parse(raw));
    if (parsed.type !== "recap") {
      L("Recap generator returned non-recap type, skipping");
      return null;
    }
    if (!parsed.concept_tag && opts.activeConcept) {
      parsed = { ...parsed, concept_tag: opts.activeConcept };
    }
    // Back-fill variant if the model omitted it — our caller knows the intent.
    if (!parsed.variant) {
      parsed = { ...parsed, variant };
    }
    L(`Recap generated: variant=${parsed.variant ?? "(none)"}, concept_tag=${parsed.concept_tag ?? "(none)"}, mastered=${parsed.mastered.join(", ")}`);
    return parsed;
  } catch (err) {
    L("Recap generation failed:", err);
    return null;
  }
}
