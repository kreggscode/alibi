import { ApiError, chat, chatJSON } from "./api.js";
import {
    buildCase,
    culpritOf,
    fallbackCase,
    type CaseFile,
    type RawCase,
    type Suspect,
    type Turn,
} from "./case.js";
import { MAX_SUSPECTS, MIN_SUSPECTS } from "./config.js";

const CASE_SYSTEM = `You write murder-mystery cases for a party game.

Reply with ONE JSON object and nothing else. No prose, no code fences.

{
  "title": "case name",
  "setting": "place and time, one line",
  "crime": "what happened, one sentence, no solution in it",
  "truth": "what actually happened and who did it, 2-3 sentences",
  "timeline": ["3 to 5 facts as HH:MM - event"],
  "suspects": [
    {
      "name": "full name",
      "role": "their job at the location",
      "alibi": "the story they tell about where they were",
      "motive": "why they might have done it",
      "secret": "something unrelated they are hiding",
      "observed": ["1 or 2 true things they personally saw"]
    }
  ],
  "culpritIndex": 0
}

Rules:
- Exactly ${MIN_SUSPECTS} to ${MAX_SUSPECTS} suspects. No fewer, no more.
- Exactly ONE culprit, at culpritIndex.
- The culprit's alibi must be a lie that is contradicted by at least one
  innocent suspect's "observed" entry. Innocents' observed entries are all true.
- Every suspect must be plausible and have a real reason to be questioned.
- The same person named in "truth" must be the one at culpritIndex.`;

const casePrompt = (): string =>
    `Write a self-contained case for ${MIN_SUSPECTS} to ${MAX_SUSPECTS} suspects. ` +
    `Make the culprit's alibi catchable by comparing it against what someone else saw.`;

/**
 * A new case every playthrough. If the reply cannot be trusted the bundled
 * fallback goes on the table instead — a bad generation must not strand the
 * player before the game starts.
 */
export const inventCase = async (): Promise<CaseFile> => {
    try {
        const raw = await chatJSON<RawCase>(CASE_SYSTEM, casePrompt());
        const built = buildCase(raw);
        if (built) return built;
    } catch (error) {
        // A missing sign-in is the player's to fix, not something to paper over
        // with the bundled case: BYOP is the point of the quest.
        if (error instanceof ApiError && error.status === 401) throw error;
        /* otherwise fall through to the known-good file */
    }
    return fallbackCase();
};

const RULES = [
    "RULES OF THE LIE:",
    "- If you ARE the culprit, your alibi is fabricated. Tell it the same way every time, with the same times and places. Never admit it, never contradict yourself, never hint that you are lying. You may deflect, get impatient, or change the subject.",
    "- If you are NOT the culprit, you are innocent: tell the truth about what you saw. You may be nervous about your secret and reluctant to share it, but you never invent facts.",
    "- You only know what is in your own entry. Do not speak for other suspects.",
    "- If asked something you did not witness, say so plainly.",
].join("\n");

const ANSWER_SYSTEM = `You are a suspect in a murder mystery, being questioned by a detective.

Stay in character. Never mention being an AI, a model, or a game.
Answer in 2 to 4 sentences, in first person, the way the character described above.

${RULES}`;

/** How much of the suspect's own earlier answers to carry, for consistency. */
const HISTORY_LIMIT = 6;

const answerPrompt = (
    file: CaseFile,
    suspect: Suspect,
    history: Turn[],
    question: string,
): string => {
    const prior = history
        .filter((turn) => turn.suspectId === suspect.id)
        .slice(-HISTORY_LIMIT)
        .map((turn) => `you said: ${turn.answer}`)
        .join("\n");

    const observed = suspect.observed.map((fact) => `- ${fact}`).join("\n");

    return [
        `CASE: ${file.title}`,
        `SETTING: ${file.setting}`,
        `WHAT REALLY HAPPENED (the truth): ${file.truth}`,
        ``,
        `YOUR NAME: ${suspect.name}`,
        `YOUR ROLE: ${suspect.role}`,
        `YOUR ALIBI (the story you tell): ${suspect.alibi}`,
        `YOUR MOTIVE: ${suspect.motive}`,
        `YOUR SECRET: ${suspect.secret}`,
        `WHAT YOU PERSONALLY SAW:\n${observed || "- nothing relevant"}`,
        `ARE YOU THE CULPRIT: ${suspect.isCulprit ? "YES" : "NO"}`,
        ``,
        prior ? `WHAT YOU HAVE ALREADY TOLD THE DETECTIVE:\n${prior}` : "",
        ``,
        `THE DETECTIVE ASKS: ${question}`,
    ]
        .filter((line) => line !== "")
        .join("\n");
};

/**
 * One answer from one suspect. The full case and the suspect's own earlier
 * answers go with every request, so the story cannot drift between turns.
 */
export const answerQuestion = async (
    file: CaseFile,
    suspect: Suspect,
    history: Turn[],
    question: string,
): Promise<string> => {
    try {
        const reply = await chat([
            { role: "system", content: ANSWER_SYSTEM },
            { role: "user", content: answerPrompt(file, suspect, history, question) },
        ]);
        const cleaned = reply.trim();
        if (cleaned) return cleaned;
    } catch {
        /* the written fallback below keeps the interrogation alive */
    }
    return suspect.isCulprit
        ? `I've told you where I was. I was not in that glasshouse.`
        : `I'm sorry — I don't know anything more about that.`;
};

/** A short line so the player can hear a suspect before questioning them. */
export const selfIntroduction = (file: CaseFile, suspect: Suspect): string =>
    `I'm ${suspect.name}, ${suspect.role} here at ${file.setting.replace(/\.$/, "")}.`;

export const culpritName = (file: CaseFile): string => culpritOf(file).name;
