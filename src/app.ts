import { ApiError, isMuted, quiet, speak, toggleMute, transcribe } from "./api.js";
import { beginAuthorization, completeAuthorization, isSignedIn } from "./auth.js";
import {
    accuse,
    flagTurn,
    flaggedCount,
    recordTurn,
    suspectById,
    type CaseFile,
    type Turn,
    type Verdict,
} from "./case.js";
import { MAX_SUSPECTS, MIN_SUSPECTS } from "./config.js";
import { button, clear, h, on } from "./dom.js";
import { answerQuestion, inventCase, selfIntroduction } from "./mystery.js";
import {
    cancelRecording,
    extensionFor,
    MicError,
    startRecording,
    stopRecording,
} from "./mic.js";

type Screen = "lineup" | "interrogation" | "notebook" | "accuse" | "verdict";

let screen: Screen = "lineup";
let caseFile: CaseFile | null = null;
let turns: Turn[] = [];
let activeId: string = "";
let verdict: Verdict | null = null;
let accusedName = "";
let pendingId = "";
let busy = false;
let recording = false;
let errorMessage = "";

const root = () => document.getElementById("app") as HTMLElement;

const messageOf = (error: unknown): string =>
    error instanceof ApiError || error instanceof MicError
        ? error.message
        : "Something went wrong. Try again.";

const run = async (work: () => Promise<void> | void): Promise<void> => {
    if (busy) return;
    busy = true;
    errorMessage = "";
    render();
    try {
        await work();
    } catch (error) {
        errorMessage = messageOf(error);
    } finally {
        busy = false;
        render();
    }
};

const activeSuspect = () =>
    caseFile ? suspectById(caseFile, activeId) : undefined;

const startCase = () =>
    run(async () => {
        caseFile = await inventCase();
        turns = [];
        verdict = null;
        activeId = caseFile.suspects[0]?.id ?? "";
        screen = "lineup";
    });

const question = (suspectId: string) => {
    activeId = suspectId;
    screen = "interrogation";
    render();
};

const ask = async (text: string): Promise<void> => {
    const file = caseFile;
    const suspect = file ? suspectById(file, activeId) : undefined;
    if (!file || !suspect || !text.trim()) return;
    const answer = await answerQuestion(file, suspect, turns, text.trim());
    turns = recordTurn(turns, {
        suspectId: suspect.id,
        suspectName: suspect.name,
        question: text.trim(),
        answer,
        flagged: false,
    });
    void speak(answer, suspect.voice);
};

const askByVoice = (): void => {
    if (recording) {
        void run(async () => {
            const pending = stopRecording();
            recording = false;
            const blob = await pending;
            const text = await transcribe(
                blob,
                `question.${extensionFor(blob.type)}`,
            );
            await ask(text);
        });
        return;
    }
    void (async () => {
        errorMessage = "";
        try {
            await startRecording();
            recording = true;
        } catch (error) {
            errorMessage = messageOf(error);
        }
        render();
    })();
};

const askByTyping = (): void => {
    const field = document.getElementById("question") as HTMLInputElement | null;
    const text = field?.value.trim() ?? "";
    if (!text) return;
    if (field) field.value = "";
    void run(() => ask(text));
};

const accuseSuspect = (suspectId: string) => {
    pendingId = suspectId;
    screen = "accuse";
    render();
};

const confirmAccusation = () =>
    run(async () => {
        const file = caseFile;
        if (!file) return;
        const target = suspectById(file, pendingId);
        if (!target) return;
        verdict = accuse(file, pendingId);
        accusedName = target.name;
        screen = "verdict";
        await speak(
            verdict.correct
                ? `You were right. ${verdict.culpritName} did it.`
                : `Not quite. It was ${verdict.culpritName}.`,
            file.suspects[0]?.voice ?? "onyx",
        );
    });

const footer = () =>
    h(
        "footer",
        { class: "foot" },
        h(
            "p",
            {},
            "Powered by ",
            h("a", { href: "https://pollinations.ai", target: "_blank", rel: "noreferrer", text: "Pollinations" }),
            " · ",
            h("a", { href: "https://gen.pollinations.ai/docs", target: "_blank", rel: "noreferrer", text: "API docs" }),
            " · ",
            on(
                h("button", { class: "link", type: "button", text: isMuted() ? "Voice: off" : "Voice: on" }),
                "click",
                () => {
                    toggleMute();
                    render();
                },
            ),
        ),
    );

const heading = (title: string, sub: string) =>
    h(
        "header",
        { class: "head" },
        h("p", { class: "mark", text: "Alibi" }),
        h("h1", { text: title }),
        h("p", { class: "sub", text: sub }),
    );

const shell = (...nodes: (Node | null | false)[]) => {
    const node = root();
    clear(node);
    for (const child of nodes) if (child) node.appendChild(child);
    if (busy) {
        node.appendChild(h("p", { class: "busy", text: "…" }));
    }
    if (errorMessage) {
        node.appendChild(h("div", { id: "error", class: "error", text: errorMessage }));
    }
    node.appendChild(footer());
};

const signInBlock = () =>
    isSignedIn()
        ? h("p", { class: "signed", text: "Signed in — the suspects speak on your Pollen." })
        : button("Sign in with your Pollen", () => void beginAuthorization(), "ghost");

const renderLineup = () => {
    const file = caseFile;
    if (!file) {
        shell(
            heading(
                "Question them out loud.",
                "A new case every time. Three to five suspects. One of them is lying.",
            ),
            h(
                "section",
                { class: "card" },
                signInBlock(),
                h("p", { class: "fine", text: `${MIN_SUSPECTS}–${MAX_SUSPECTS} suspects, one killer.` }),
                button("Open a new case", () => void startCase()),
            ),
        );
        return;
    }

    shell(
        heading(file.title, file.setting),
        h(
            "section",
            { class: "card" },
            h("p", { class: "crime", text: file.crime }),
            h("p", { class: "fine", text: "Question each of them. One is lying about where they were." }),
        ),
        h(
            "section",
            { class: "lineup" },
            ...file.suspects.map((suspect) =>
                h(
                    "article",
                    { class: "suspect", "data-suspect": suspect.id },
                    h("h2", { text: suspect.name }),
                    h("p", { class: "role", text: suspect.role }),
                    h(
                        "div",
                        { class: "row" },
                        button("Question", () => question(suspect.id)),
                        button(
                            "Hear them",
                            () => void speak(selfIntroduction(file, suspect), suspect.voice),
                            "ghost",
                        ),
                    ),
                ),
            ),
        ),
        h(
            "div",
            { class: "row spread" },
            button(`Notebook (${turns.length})`, () => {
                screen = "notebook";
                render();
            }, "ghost"),
            button(`Accuse (${file.suspects.length})`, () => {
                pendingId = "";
                screen = "accuse";
                render();
            }, "ghost"),
            button("New case", () => void startCase(), "ghost"),
        ),
    );
};

const renderInterrogation = () => {
    const file = caseFile;
    const suspect = activeSuspect();
    if (!file || !suspect) {
        screen = "lineup";
        render();
        return;
    }
    const mine = turns.filter((turn) => turn.suspectId === suspect.id);

    shell(
        heading(suspect.name, suspect.role),
        h(
            "section",
            { class: "thread" },
            ...(mine.length > 0
                ? mine.map((turn) =>
                      h(
                          "div",
                          { class: "turn" },
                          h("p", { class: "q", text: turn.question }),
                          h("p", { class: "a", text: turn.answer }),
                      ),
                  )
                : [
                      h("p", {
                          class: "fine",
                          text: `${suspect.name} is watching you. Ask anything — out loud, or typed.`,
                      }),
                  ]),
        ),
        h(
            "div",
            { class: "controls" },
            button(recording ? "Stop — send it" : "Ask out loud", () => askByVoice(), recording ? "primary" : "ghost"),
            on(
                h("input", {
                    id: "question",
                    class: "ask",
                    type: "text",
                    maxlength: "240",
                    placeholder: "Or type your question…",
                    autocomplete: "off",
                }),
                "keydown",
                (event: Event) => {
                    if ((event as KeyboardEvent).key === "Enter") askByTyping();
                },
            ),
            button("Ask", () => askByTyping(), "ghost"),
        ),
        h(
            "div",
            { class: "row spread" },
            button("Back to the lineup", () => {
                quiet();
                recording = false;
                cancelRecording();
                screen = "lineup";
                render();
            }, "ghost"),
            button(`Notebook (${turns.length})`, () => {
                screen = "notebook";
                render();
            }, "ghost"),
        ),
    );
};

const renderNotebook = () => {
    shell(
        heading("Your notebook", `${turns.length} claim${turns.length === 1 ? "" : "s"} recorded, ${flaggedCount(turns)} marked`),
        turns.length === 0
            ? h("section", { class: "card" }, h("p", { class: "fine", text: "Nothing written down yet. Ask a suspect something." }))
            : h(
                  "section",
                  { class: "notebook" },
                  ...turns.map((turn, index) =>
                      h(
                          "article",
                          { class: `claim${turn.flagged ? " flagged" : ""}` },
                          h("p", { class: "who", text: turn.suspectName }),
                          h("p", { class: "q", text: turn.question }),
                          h("p", { class: "a", text: turn.answer }),
                          on(
                              h("button", {
                                  class: "mark",
                                  type: "button",
                                  text: turn.flagged ? "Marked as a lie" : "This doesn't add up",
                              }),
                              "click",
                              () => {
                                  turns = flagTurn(turns, index);
                                  render();
                              },
                          ),
                      ),
                  ),
              ),
        button("Back", () => {
            screen = "lineup";
            render();
        }, "ghost"),
    );
};

const renderAccuse = () => {
    const file = caseFile;
    if (!file) {
        screen = "lineup";
        render();
        return;
    }
    const pending = suspectById(file, pendingId);

    shell(
        heading("Name the killer", "One accusation. Make it count."),
        pending
            ? h(
                  "section",
                  { class: "card confirm" },
                  h("p", { class: "crime", text: `You are accusing ${pending.name}, ${pending.role}.` }),
                  h(
                      "div",
                      { class: "row" },
                      button(`Yes — it was ${pending.name}`, () => void confirmAccusation()),
                      button("Wait, no", () => {
                          pendingId = "";
                          render();
                      }, "ghost"),
                  ),
              )
            : h(
                  "section",
                  { class: "lineup" },
                  ...file.suspects.map((suspect) =>
                      h(
                          "article",
                          { class: "suspect", "data-suspect": suspect.id },
                          h("h2", { text: suspect.name }),
                          h("p", { class: "role", text: suspect.role }),
                          button("Accuse", () => accuseSuspect(suspect.id)),
                      ),
                  ),
              ),
        !pending &&
            button("Leave it", () => {
                screen = "lineup";
                render();
            }, "ghost"),
    );
};

const renderVerdict = () => {
    const file = caseFile;
    if (!file || !verdict) {
        screen = "lineup";
        render();
        return;
    }
    shell(
        heading(
            verdict.correct ? "You were right." : "Not quite.",
            verdict.correct
                ? `${accusedName} did it. The story holds.`
                : `You named ${accusedName}. It was ${verdict.culpritName}.`,
        ),
        h(
            "section",
            { class: "card" },
            h("p", { class: "who", text: `The killer: ${verdict.culpritName}` }),
            h("p", { class: "crime", text: verdict.truth }),
            h("p", { class: "fine", text: "What actually happened:" }),
            h(
                "ul",
                { class: "timeline" },
                ...verdict.timeline.map((entry) => h("li", { text: entry })),
            ),
        ),
        button("Open a new case", () => void startCase()),
    );
};

const render = () => {
    if (!caseFile && screen !== "lineup") screen = "lineup";
    if (screen === "lineup") renderLineup();
    else if (screen === "interrogation") renderInterrogation();
    else if (screen === "notebook") renderNotebook();
    else if (screen === "accuse") renderAccuse();
    else renderVerdict();
};

const boot = async (): Promise<void> => {
    try {
        if (await completeAuthorization()) {
            const url = new URL(window.location.href);
            url.search = "";
            window.history.replaceState({}, "", url);
        }
    } catch (error) {
        errorMessage = messageOf(error);
    }
    render();
};

export { boot, render };
