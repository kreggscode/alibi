import { describe, expect, it } from "vitest";
import {
    accuse,
    buildCase,
    culpritOf,
    fallbackCase,
    flaggedCount,
    flagTurn,
    recordTurn,
    suspectById,
    voiceFor,
    type RawCase,
    type Turn,
} from "./case.js";
import { MAX_SUSPECTS, MIN_SUSPECTS, VOICES } from "./config.js";

const suspect = (name: string, role: string) => ({
    name,
    role,
    alibi: `${name} says they were in the kitchen.`,
    motive: "money",
    secret: "a debt",
    observed: ["The clock struck nine."],
});

const goodRaw = (): RawCase => ({
    title: "A Fine Mess",
    setting: "the old customs house",
    crime: "The harbourmaster was found at the bottom of the stair.",
    truth: "The clerk pushed him and let the tide take the rest.",
    timeline: ["21:00 - the lamp goes out", "21:10 - a shout", "21:20 - the tide turns"],
    suspects: [
        suspect("Nell Carter", "Clerk"),
        suspect("Jonah Pike", "Boatswain"),
        suspect("Ada Voss", "Customs officer"),
    ],
    culpritIndex: 0,
});

describe("buildCase", () => {
    it("turns a good reply into a playable case", () => {
        const file = buildCase(goodRaw());
        expect(file).not.toBeNull();
        expect(file?.title).toBe("A Fine Mess");
        expect(file?.suspects).toHaveLength(3);
        expect(file?.culpritId).toBe("nell-carter-0");
        expect(file?.suspects.filter((s) => s.isCulprit)).toHaveLength(1);
    });

    it("assigns every suspect a distinct voice", () => {
        const file = buildCase(goodRaw());
        const voices = file?.suspects.map((s) => s.voice) ?? [];
        expect(new Set(voices).size).toBe(voices.length);
        for (const voice of voices) expect(VOICES).toContain(voice);
    });

    it("rejects a reply with no culprit", () => {
        expect(buildCase({ ...goodRaw(), culpritIndex: undefined })).toBeNull();
    });

    it("rejects a culprit index outside the lineup", () => {
        expect(buildCase({ ...goodRaw(), culpritIndex: 7 })).toBeNull();
        expect(buildCase({ ...goodRaw(), culpritIndex: -1 })).toBeNull();
    });

    it("rejects a fractional culprit index", () => {
        expect(buildCase({ ...goodRaw(), culpritIndex: 1.5 })).toBeNull();
    });

    it("rejects a lineup that is too small or too large", () => {
        const raw = goodRaw();
        expect(buildCase({ ...raw, suspects: [suspect("A", "x")] })).toBeNull();
        expect(
            buildCase({
                ...raw,
                suspects: Array.from({ length: MAX_SUSPECTS + 1 }, (_, i) =>
                    suspect(`S${i}`, "role"),
                ),
            }),
        ).toBeNull();
    });

    it("rejects a case with too few timeline facts", () => {
        expect(buildCase({ ...goodRaw(), timeline: ["21:00 - one"] })).toBeNull();
    });

    it("rejects missing headings", () => {
        expect(buildCase({ ...goodRaw(), title: "  " })).toBeNull();
        expect(buildCase({ ...goodRaw(), truth: "" })).toBeNull();
        expect(buildCase({ ...goodRaw(), setting: undefined })).toBeNull();
    });

    it("rejects a suspect with no alibi", () => {
        const raw = goodRaw();
        (raw.suspects as Record<string, unknown>[])[1] = {
            name: "Jonah Pike",
            role: "Boatswain",
        };
        expect(buildCase(raw)).toBeNull();
    });

    it("rejects non-objects in the lineup", () => {
        expect(buildCase({ ...goodRaw(), suspects: ["nope"] })).toBeNull();
    });
});

describe("voiceFor", () => {
    it("stays inside the roster", () => {
        for (let index = 0; index < 12; index += 1) {
            expect(VOICES).toContain(voiceFor(index));
        }
    });

    it("gives each seat its own voice", () => {
        const assigned = Array.from({ length: MAX_SUSPECTS }, (_, i) => voiceFor(i));
        expect(new Set(assigned).size).toBe(assigned.length);
    });
});

describe("fallbackCase", () => {
    it("is itself a valid case", () => {
        const file = fallbackCase();
        const rebuilt = buildCase({
            title: file.title,
            setting: file.setting,
            crime: file.crime,
            truth: file.truth,
            timeline: file.timeline,
            culpritIndex: file.suspects.findIndex((s) => s.isCulprit),
            suspects: file.suspects.map((s) => ({
                name: s.name,
                role: s.role,
                alibi: s.alibi,
                motive: s.motive,
                secret: s.secret,
                observed: s.observed,
            })),
        });
        expect(rebuilt).not.toBeNull();
        expect(rebuilt?.culpritId).toBe(file.culpritId);
    });

    it("has a culprit inside the legal lineup size", () => {
        const file = fallbackCase();
        expect(file.suspects.length).toBeGreaterThanOrEqual(MIN_SUSPECTS);
        expect(file.suspects.length).toBeLessThanOrEqual(MAX_SUSPECTS);
        expect(suspectById(file, file.culpritId)?.isCulprit).toBe(true);
    });

    it("leaves an innocent witness whose account contradicts the alibi", () => {
        const file = fallbackCase();
        const witnesses = file.suspects.filter(
            (s) => !s.isCulprit && s.observed.length > 0,
        );
        expect(witnesses.length).toBeGreaterThan(0);
    });
});

describe("accuse", () => {
    it("is correct only for the culprit", () => {
        const file = fallbackCase();
        const right = accuse(file, file.culpritId);
        expect(right.correct).toBe(true);
        expect(right.culpritName).toBe(culpritOf(file).name);

        const wrongId = file.suspects.find((s) => !s.isCulprit)!.id;
        expect(accuse(file, wrongId).correct).toBe(false);
    });

    it("always reveals who did it", () => {
        const file = fallbackCase();
        expect(accuse(file, file.suspects[2].id).truth).toBe(file.truth);
        expect(accuse(file, file.suspects[2].id).timeline.length).toBeGreaterThan(0);
    });
});

describe("notebook", () => {
    const turns: Turn[] = [
        {
            suspectId: "ivy-marrow",
            suspectName: "Ivy Marrow",
            question: "Where were you at nine?",
            answer: "In the potting shed.",
            flagged: false,
        },
        {
            suspectId: "silas-brew",
            suspectName: "Silas Brew",
            question: "Did you see anyone?",
            answer: "Ivy came past the gate, coat on.",
            flagged: false,
        },
    ];

    it("records without mutating the previous notebook", () => {
        const next = recordTurn(turns, {
            suspectId: "vera-quill",
            suspectName: "Vera Quill",
            question: "And you?",
            answer: "The library was empty.",
            flagged: false,
        });
        expect(next).toHaveLength(3);
        expect(turns).toHaveLength(2);
    });

    it("marks and unmarks a single claim", () => {
        const flagged = flagTurn(turns, 0);
        expect(flagged[0].flagged).toBe(true);
        expect(flagged[1].flagged).toBe(false);
        expect(flaggedCount(flagged)).toBe(1);
        expect(flagTurn(flagged, 0)[0].flagged).toBe(false);
    });

    it("leaves other claims untouched", () => {
        const flagged = flagTurn(turns, 1);
        expect(flagged[0]).toBe(turns[0]);
        expect(flagged[1]).not.toBe(turns[1]);
    });
});
