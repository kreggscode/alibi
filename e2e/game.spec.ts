import { expect, test, type Page } from "@playwright/test";

const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const APP = process.env.E2E_BASE_URL || "http://127.0.0.1:4173/alibi/";
const evidence = (name: string) => `evidence/${name}.png`;

const heading = (page: Page, text: string | RegExp) =>
    page.getByRole("heading", { name: text });

const shot = (page: Page, name: string) =>
    page.screenshot({ path: evidence(name), fullPage: true });

const signIn = async (page: Page) => {
    await page.goto(APP);
    // The app needs a Pollinations key before it can ask anyone anything.
    // The sign-in round trip is covered separately; this drives the game.
    await page.evaluate(
        ([key]) => {
            sessionStorage.setItem("alibi.token", key);
            sessionStorage.setItem("alibi.muted", "1");
        },
        [API_KEY],
    );
    await page.reload();
    await expect(
        page.getByText("Signed in — the suspects speak on your Pollen."),
    ).toBeVisible();
};

/** Deal a case and return the lineup, which is three to five named suspects. */
const openCase = async (page: Page): Promise<string[]> => {
    await page.getByRole("button", { name: "Open a new case" }).click();
    await expect(page.locator(".suspect").first()).toBeVisible({ timeout: 120_000 });
    const names = await page.locator(".suspect h2").allInnerTexts();
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(names.length).toBeLessThanOrEqual(5);
    expect(new Set(names).size).toBe(names.length);
    return names;
};

const askTyped = async (page: Page, question: string) => {
    await page.locator("#question").fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".turn .a").last()).toBeVisible({ timeout: 90_000 });
};

test.beforeEach(() => {
    expect(API_KEY, "set POLLINATIONS_API_KEY to run the live end-to-end test").not.toBe("");
});

test("opens a case, questions two suspects, notes and accuses", async ({ page }) => {
    await signIn(page);
    await shot(page, "01-briefing");

    const names = await openCase(page);
    await expect(page.locator(".crime")).toBeVisible();
    await shot(page, "02-lineup");

    await expect(page.getByRole("button", { name: "Hear them" })).toHaveCount(names.length);

    // Question the first suspect, typed.
    await page.locator(".suspect").first().getByRole("button", { name: "Question" }).click();
    await expect(page.locator(".thread")).toBeVisible();
    await shot(page, "03-interrogation-empty");
    await askTyped(page, "Where were you when it happened?");
    const firstAnswer = await page.locator(".turn .a").first().innerText();
    expect(firstAnswer.length).toBeGreaterThan(20);
    await shot(page, "04-answer-one");

    await page.getByRole("button", { name: "Back to the lineup" }).click();
    await expect(page.locator(".suspect")).toHaveCount(names.length);

    // Question a different suspect so the notebook has two sources.
    await page.locator(".suspect").nth(1).getByRole("button", { name: "Question" }).click();
    await askTyped(page, "Did you see anyone near the scene?");
    await page.getByRole("button", { name: "Back to the lineup" }).click();

    // The notebook tracks what each suspect claimed.
    await page.getByRole("button", { name: /^Notebook \(/ }).click();
    await expect(page.locator(".claim")).toHaveCount(2, { timeout: 60_000 });
    await expect(page.locator(".claim .who").first()).toHaveText(names[0]);
    await expect(page.locator(".claim .who").nth(1)).toHaveText(names[1]);
    await shot(page, "05-notebook");

    // A claim can be marked as one that does not add up.
    await page.locator(".claim .mark").first().click();
    await expect(page.locator(".claim").first()).toHaveClass(/flagged/);
    await expect(page.locator(".claim .mark").first()).toHaveText("Marked as a lie");
    await expect(page.locator(".head .sub")).toContainText("1 marked");

    await page.getByRole("button", { name: "Back" }).click();

    // Accuse, confirm, and get a verdict that names the real killer.
    await page.getByRole("button", { name: /^Accuse \(/ }).click();
    await expect(page.locator(".suspect")).toHaveCount(names.length);
    await page.locator(".suspect").first().getByRole("button", { name: "Accuse" }).click();
    await expect(page.locator(".confirm")).toBeVisible();
    await shot(page, "06-accuse-confirm");
    await page.getByRole("button", { name: /^Yes — it was / }).click();

    await expect(heading(page, /^(You were right\.|Not quite\.)$/)).toBeVisible({
        timeout: 90_000,
    });
    await expect(page.locator(".timeline li")).not.toHaveCount(0);
    await expect(page.locator("#error")).toHaveCount(0);
    await shot(page, "07-verdict");
});

test("falls back to typing when there is no microphone", async ({ page }) => {
    await signIn(page);
    await openCase(page);
    await page.locator(".suspect").first().getByRole("button", { name: "Question" }).click();

    await page.getByRole("button", { name: "Ask out loud" }).click();
    await expect(page.locator("#error")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#error")).toContainText("Type your question instead");
    // The typed path still works after the microphone refused.
    await askTyped(page, "Are you sure about that?");
    await expect(page.locator("#error")).toHaveCount(0);
    await shot(page, "08-typing-fallback");
});

test("reports a broken session instead of failing silently", async ({ page }) => {
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.removeItem("alibi.token"));
    await page.getByRole("button", { name: "Open a new case" }).click();
    await expect(page.locator("#error")).toBeVisible({ timeout: 60_000 });
    await shot(page, "09-error-state");
});

test("sign-in hands off to the Pollinations consent screen", async ({ page }) => {
    test.skip(
        !process.env.E2E_BASE_URL,
        "the local preview port is not a registered redirect URI",
    );
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Sign in with your Pollen" }).click();
    await page.waitForURL(/enter\.pollinations\.ai\/authorize/, { timeout: 60_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get("client_id")).toMatch(/^pk_/);
    expect(url.searchParams.get("redirect_uri")).toBe(APP);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();

    // The consent screen must name the app, not fall back to the hostname.
    await expect(page.getByText("Alibi", { exact: true })).toBeVisible({
        timeout: 60_000,
    });
    await shot(page, "10-consent");
});
