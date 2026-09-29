/** Every endpoint, model and credential the app talks to. */

export const GEN_BASE = "https://gen.pollinations.ai";
export const ENTER_BASE = "https://enter.pollinations.ai";

/**
 * Publishable App Key (`pk_...`) for Bring Your Own Pollen. It identifies the
 * app on the consent screen; the spend is always the player's own Pollen.
 * Overridable at build time so the key never has to live in git history.
 */
export const CLIENT_ID: string =
    (import.meta.env.VITE_POLLINATIONS_CLIENT_ID as string | undefined) ?? "";

/** OAuth redirect target — must match a Redirect URI registered on the App Key. */
export const REDIRECT_URI: string =
    (import.meta.env.VITE_POLLINATIONS_REDIRECT_URI as string | undefined) ??
    (typeof window === "undefined"
        ? ""
        : `${window.location.origin}${window.location.pathname}`);

/** The suspects talk, the player asks out loud, the model keeps both straight. */
export const TEXT_MODEL = "openai/gpt-5.4-nano";
export const TTS_MODEL = "elevenlabs/eleven-v3";
export const STT_MODEL = "openai/whisper-large-v3";

/**
 * One voice per seat in the lineup, assigned by position rather than by the
 * model, so a suspect keeps the same voice for the whole case.
 */
export const VOICES: readonly string[] = [
    "onyx",
    "nova",
    "shimmer",
    "ash",
    "fable",
];

/** Chat replies are one answer, not a novel — the TTS limit is 10 000 chars. */
export const MAX_SPEECH_CHARS = 10_000;

export const MIN_SUSPECTS = 3;
export const MAX_SUSPECTS = 5;
