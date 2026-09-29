import { getToken } from "./auth.js";
import {
    GEN_BASE,
    MAX_SPEECH_CHARS,
    STT_MODEL,
    TEXT_MODEL,
    TTS_MODEL,
} from "./config.js";

export class ApiError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

const authorized = () => {
    const token = getToken();
    if (!token) throw new ApiError("Sign in with your Pollen to continue.", 401);
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
};

export const chat = async (
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    model = TEXT_MODEL,
): Promise<string> => {
    const response = await fetch(`${GEN_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: authorized(),
        body: JSON.stringify({ model, messages, temperature: 0.9 }),
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);
    const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
        throw new ApiError("The suspect said nothing. Ask again.");
    }
    return content;
};

const describe = async (response: Response): Promise<string> => {
    try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) return body.error.message;
    } catch {
        /* fall through to the status line */
    }
    return `Pollinations responded with ${response.status}.`;
};

/**
 * Ask the model for structured data. Replies arrive wrapped in prose or code
 * fences, so pull the outermost array or object out rather than trusting the
 * first byte.
 */
export const chatJSON = async <T,>(system: string, user: string): Promise<T> =>
    parseJson<T>(
        await chat([
            { role: "system", content: system },
            { role: "user", content: user },
        ]),
    );

export const parseJson = <T,>(reply: string): T => {
    const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : reply).trim();
    const start = candidate.search(/[[{]/);
    if (start === -1) throw new ApiError("The reply contained no JSON.");
    const trimmed = candidate.slice(start);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    try {
        return JSON.parse(trimmed.slice(0, end + 1)) as T;
    } catch {
        throw new ApiError("The reply could not be read.");
    }
};

/**
 * Turn a recording into text. Deliberately sends no `Content-Type`: the
 * browser has to add the multipart boundary itself.
 */
export const transcribe = async (
    audio: Blob,
    filename = "question.webm",
): Promise<string> => {
    const token = getToken();
    if (!token) throw new ApiError("Sign in with your Pollen to continue.", 401);

    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", STT_MODEL);
    form.append("language", "en");

    const response = await fetch(`${GEN_BASE}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const payload = (await response.json()) as { text?: string };
    const text = (payload.text ?? "").trim();
    if (!text) throw new ApiError("I didn't catch that. Try again, or type it.");
    return text;
};

const MUTE_KEY = "alibi.muted";
let muted =
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(MUTE_KEY) === "1";

/** The single voice currently playing, so a new answer can cut the last off. */
let playing: HTMLAudioElement | null = null;

export const isMuted = () => muted;

/** Suspects should be heard, but never over the player's own thinking. */
export const toggleMute = (): boolean => {
    muted = !muted;
    sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (muted) quiet();
    return muted;
};

/**
 * Play a suspect's answer in their own voice. Never throws: a failed voice
 * request must not stop the interrogation, so the written answer always
 * stands on its own.
 */
export const speak = async (text: string, voice: string): Promise<void> => {
    const token = getToken();
    if (muted || !token || !text.trim()) return;
    try {
        const response = await fetch(`${GEN_BASE}/v1/audio/speech`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: TTS_MODEL,
                voice,
                input: text.slice(0, MAX_SPEECH_CHARS),
                response_format: "mp3",
            }),
        });
        if (!response.ok) return;
        quiet();
        const url = URL.createObjectURL(await response.blob());
        const audio = new Audio(url);
        playing = audio;
        audio.addEventListener("ended", () => {
            URL.revokeObjectURL(url);
            if (playing === audio) playing = null;
        });
        await audio.play();
    } catch {
        /* autoplay may be blocked before the first user gesture */
    }
};

/** Stop whatever is currently being said. */
export const quiet = () => {
    if (!playing) return;
    playing.pause();
    playing.removeAttribute("src");
    playing = null;
};
