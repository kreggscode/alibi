import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ApiError, transcribe } from "./api.js";

const KEY = process.env.POLLINATIONS_API_KEY ?? "";

// `auth.ts` reads sessionStorage when a call is made; Node has none.
const store = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
};

beforeAll(() => {
    if (KEY) store.set("alibi.token", KEY);
});

const fixture = () => {
    const bytes = readFileSync(
        fileURLToPath(new URL("./fixtures/question.mp3", import.meta.url)),
    );
    return new File([new Uint8Array(bytes)], "question.mp3", {
        type: "audio/mpeg",
    });
};

describe.skipIf(!KEY)("transcribe against the live endpoint", () => {
    it("turns a spoken question into text", async () => {
        const text = await transcribe(fixture(), "question.mp3");
        expect(text.toLowerCase()).toContain("gardener");
    });

    it("refuses to send anything without a signed-in player", async () => {
        store.delete("alibi.token");
        await expect(transcribe(fixture(), "question.mp3")).rejects.toBeInstanceOf(ApiError);
        store.set("alibi.token", KEY);
    });
});
