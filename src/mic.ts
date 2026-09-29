/**
 * Push-to-talk recording. The app asks, the player holds a thought, the model
 * hears it. Kept separate from the screens so the recorder lifecycle is
 * testable on its own.
 */

export class MicError extends Error {}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: BlobPart[] = [];
let settle: { resolve: (blob: Blob) => void; reject: (error: Error) => void } | null = null;

const teardown = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
    chunks = [];
};

export const isRecording = (): boolean => recorder?.state === "recording";

/**
 * Open the microphone. Throws `MicError` when the browser cannot or will not
 * grant it, so the caller can fall back to typing without losing the question.
 */
export const startRecording = async (): Promise<void> => {
    if (isRecording()) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new MicError("This browser will not share a microphone. Type your question instead.");
    }
    if (typeof MediaRecorder === "undefined") {
        throw new MicError("Recording is not supported here. Type your question instead.");
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        throw new MicError("No microphone available. Type your question instead.");
    }

    chunks = [];
    try {
        recorder = new MediaRecorder(stream);
    } catch {
        teardown();
        throw new MicError("Could not start recording. Type your question instead.");
    }

    recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
        const failure = settle;
        settle = null;
        teardown();
        failure?.reject(new MicError("The recording failed. Try again, or type it."));
    });
    recorder.addEventListener("stop", () => {
        const done = settle;
        settle = null;
        const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        teardown();
        if (blob.size > 0) done?.resolve(blob);
        else done?.reject(new MicError("Nothing was recorded. Try again, or type it."));
    });

    recorder.start();
};

/** Stop and hand back what was captured. */
export const stopRecording = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
        if (!recorder || !isRecording()) {
            reject(new MicError("Nothing is being recorded."));
            return;
        }
        settle = { resolve, reject };
        recorder.stop();
    });

/** Abandon a recording without asking the model to listen to it. */
export const cancelRecording = (): void => {
    if (!recorder) return;
    settle = null;
    if (isRecording()) recorder.stop();
    else teardown();
};

/** A MediaRecorder mimeType such as `audio/webm;codecs=opus`, for the filename. */
export const extensionFor = (mimeType: string): string => {
    if (mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("wav")) return "wav";
    return "webm";
};
