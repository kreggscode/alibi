import { describe, expect, it } from "vitest";
import { ApiError, parseJson } from "./api.js";

describe("parseJson", () => {
    it("reads a bare object", () => {
        expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    });

    it("reads a bare array", () => {
        expect(parseJson("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("strips a code fence", () => {
        expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it("finds the object inside prose", () => {
        expect(parseJson('Sure! Here is the case:\n{"title":"X"}\nHope that helps.')).toEqual({
            title: "X",
        });
    });

    it("reads the outermost object when the value is itself JSON", () => {
        expect(parseJson('{"a":"{\\"b\\":2}"}')).toEqual({ a: '{"b":2}' });
    });

    it("throws on a reply with nothing to parse", () => {
        expect(() => parseJson("I am afraid I cannot do that.")).toThrow(ApiError);
    });

    it("throws on truncated JSON", () => {
        expect(() => parseJson('{"title": "unfinished')).toThrow(ApiError);
    });
});
