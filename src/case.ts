import { MAX_SUSPECTS, MIN_SUSPECTS, VOICES } from "./config.js";

/** One person in the lineup. `isCulprit` is decided when the case is opened. */
export interface Suspect {
    id: string;
    name: string;
    role: string;
    voice: string;
    alibi: string;
    motive: string;
    secret: string;
    observed: string[];
    isCulprit: boolean;
}

/** Everything true about the case, including what the player must discover. */
export interface CaseFile {
    title: string;
    setting: string;
    crime: string;
    truth: string;
    timeline: string[];
    suspects: Suspect[];
    culpritId: string;
}

/** The model's raw reply, before anything is trusted. */
export interface RawCase {
    title?: unknown;
    setting?: unknown;
    crime?: unknown;
    truth?: unknown;
    timeline?: unknown;
    suspects?: unknown;
    culpritIndex?: unknown;
}

/** A question the player put to a suspect, and what came back. */
export interface Turn {
    suspectId: string;
    suspectName: string;
    question: string;
    answer: string;
    /** Player's own "this does not add up" mark. */
    flagged: boolean;
}

export interface Verdict {
    correct: boolean;
    culpritName: string;
    truth: string;
    timeline: string[];
}

const text = (value: unknown): string =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

const list = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.map(text).filter((entry) => entry.length > 0)
        : [];

/** Position-based, so a suspect keeps one voice for the whole case. */
export const voiceFor = (index: number): string =>
    VOICES[index % VOICES.length];

const slug = (name: string, index: number): string => {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${base || "suspect"}-${index}`;
};

/** One id scheme for generated cases and the bundled fallback. */
export const suspectId = (name: string, index: number): string =>
    slug(name, index);

/**
 * Turn a model reply into a playable case, or `null` when it cannot be
 * trusted. The caller falls back to a known-good file â€” a malformed reply
 * must never put an unplayable case on the table.
 */
export const buildCase = (raw: RawCase): CaseFile | null => {
    const title = text(raw.title);
    const setting = text(raw.setting);
    const crime = text(raw.crime);
    const truth = text(raw.truth);
    const timeline = list(raw.timeline);
    const suspects = Array.isArray(raw.suspects) ? raw.suspects : [];

    if (!title || !setting || !crime || !truth) return null;
    if (timeline.length < 3) return null;
    if (suspects.length < MIN_SUSPECTS || suspects.length > MAX_SUSPECTS) return null;

    const culpritIndex = Number(raw.culpritIndex);
    if (!Number.isInteger(culpritIndex)) return null;
    if (culpritIndex < 0 || culpritIndex >= suspects.length) return null;

    const parsed: Suspect[] = [];
    for (const [index, entry] of suspects.entries()) {
        if (typeof entry !== "object" || entry === null) return null;
        const record = entry as Record<string, unknown>;
        const name = text(record.name);
        const role = text(record.role);
        const alibi = text(record.alibi);
        if (!name || !role || !alibi) return null;
        parsed.push({
            id: slug(name, index),
            name,
            role,
            voice: voiceFor(index),
            alibi,
            motive: text(record.motive) || "none admitted",
            secret: text(record.secret) || "nothing offered",
            observed: list(record.observed),
            isCulprit: index === culpritIndex,
        });
    }

    const culprit = parsed[culpritIndex];
    return {
        title,
        setting,
        crime,
        truth,
        timeline,
        suspects: parsed,
        culpritId: culprit.id,
    };
};

export const suspectById = (
    file: CaseFile,
    id: string,
): Suspect | undefined => file.suspects.find((suspect) => suspect.id === id);

export const culpritOf = (file: CaseFile): Suspect =>
    file.suspects.find((suspect) => suspect.isCulprit) ?? file.suspects[0];

/** The accusation the player stakes the case on. */
export const accuse = (file: CaseFile, suspectId: string): Verdict => {
    const accused = suspectById(file, suspectId);
    const culprit = culpritOf(file);
    return {
        correct: accused?.id === culprit.id,
        culpritName: culprit.name,
        truth: file.truth,
        timeline: file.timeline,
    };
};

export const recordTurn = (turns: Turn[], turn: Turn): Turn[] => [...turns, turn];

export const flagTurn = (turns: Turn[], index: number): Turn[] =>
    turns.map((turn, position) =>
        position === index ? { ...turn, flagged: !turn.flagged } : turn,
    );

export const flaggedCount = (turns: Turn[]): number =>
    turns.filter((turn) => turn.flagged).length;

/**
 * Used when the model's reply was unusable. Deliberately small and
 * self-consistent: the alibi must contradict an observation, or the game has
 * nothing to catch.
 */
export const fallbackCase = (): CaseFile => {
    const suspects: Suspect[] = [
        {
            id: suspectId("Ivy Marrow", 0),
            name: "Ivy Marrow",
            role: "Head Gardener",
            voice: voiceFor(0),
            alibi: "I was in the potting shed until half nine, then straight to the gate.",
            motive: "The will cut her out of the glasshouse endowment.",
            secret: "She sold cuttings from the walled garden on the side.",
            observed: [
                "The library lights went out at nine o'clock, on the dot.",
                "A figure in a grey coat crossed the lawn from the east path.",
            ],
            isCulprit: true,
        },
        {
            id: suspectId("Silas Brew", 1),
            name: "Silas Brew",
            role: "Stable Hand",
            voice: voiceFor(1),
            alibi: "Mucking out, same as every Thursday. I never left the yard.",
            motive: "None. He wanted the horse, not the money.",
            secret: "He can read, and pretends he cannot.",
            observed: [
                "Ivy came past the yard gate at a quarter to nine, coat already on.",
                "The east path gate sticks; it banged twice that night.",
            ],
            isCulprit: false,
        },
        {
            id: suspectId("Vera Quill", 2),
            name: "Vera Quill",
            role: "Librarian",
            voice: voiceFor(2),
            alibi: "Reshelving in the west stacks until the clock struck nine.",
            motive: "The collection was to be sold; she would have lost her post.",
            secret: "She had been quietly removing pages from one ledger.",
            observed: [
                "The library was empty when I left at nine. Nobody was inside.",
                "Ivy's boots were wet with glasshouse soil, not shed dirt.",
            ],
            isCulprit: false,
        },
        {
            id: suspectId("Otto Vane", 3),
            name: "Otto Vane",
            role: "Chauffeur",
            voice: voiceFor(3),
            alibi: "Cleaning the Daimler in the garage, radio on, all evening.",
            motive: "He was owed six months of back pay.",
            secret: "He had already given notice to a rival household.",
            observed: [
                "The garage door was open; I heard someone on the gravel at nine.",
                "Nobody used the front drive that night. I'd have seen it.",
            ],
            isCulprit: false,
        },
    ];

    return {
        title: "The Glasshouse Will",
        setting: "Thornfield Hall, a wet Thursday in October",
        crime: "The master of the house was found dead among the broken panes of his glasshouse.",
        truth:
            "Ivy Marrow argued with him over the will at nine, lost her temper, and struck him against a staging bench. She left by the east path with the library door already dark â€” her grey coat was later wet with glasshouse soil, not shed dirt.",
        timeline: [
            "9:00 â€” the library lights go out",
            "9:15 â€” the east path gate bangs twice",
            "9:30 â€” Ivy's grey coat is found wet with glasshouse soil",
            "10:00 â€” the body is discovered by the back stairs",
        ],
        suspects,
        culpritId: suspectId("Ivy Marrow", 0),
    };
};
