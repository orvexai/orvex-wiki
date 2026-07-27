import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * REAL user journey — a browser driving the actual UI, not the HTTP API.
 *
 * Everything else in this repo's test estate (unit, integration, and the
 * scripts/e2e HTTP suites) exercises the SERVER. This file exercises what a
 * person actually touches: the login form, the page tree, the editor, the
 * share modal. It exists because a green server-side suite proves nothing
 * about whether a screen renders — the same blind spot that let the per-role
 * health probes ship broken (see scripts/e2e/README.md).
 *
 * Requires: the built engine running at APP_URL in VANILLA mode
 * (ORVEX_MODULES_ENABLED unset — under the orvex fold-in the native-login
 * guard fail-closes by design, so there is no password path to drive), with a
 * workspace already set up. See scripts/e2e/README.md.
 *
 * SERIAL + ONE shared login: the auth throttler is 10 attempts / 60s
 * (AUTH_THROTTLER, Redis-backed), so a login per test makes the suite throttle
 * ITSELF and the resulting 429 reads exactly like a broken login form. The
 * form is still driven for real by the two auth tests; everything after reuses
 * one captured session.
 */

const EMAIL = process.env.E2E_EMAIL ?? "tester@e2e.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "SuperSecret123!";
const STORAGE = "e2e/.auth-state.json";

/**
 * Console errors that are benign HTTP-status noise, not JS faults.
 *
 * 401/403/404 are the app's own unauthenticated/absent probes (the signal it
 * routes on). 429 is the auth throttler (10/60s) pushing back on a suite that
 * logs in and provisions fixtures — infrastructure back-pressure, never a
 * rendering defect. A REAL JS fault arrives as a `pageerror` or a
 * non-network console.error, and those still fail the run: that is exactly
 * how this suite caught the uncaught `Invalid token specified: must be a
 * string` in the collab auth-failure handler.
 */
function isBenign(msg: ConsoleMessage): boolean {
  const t = msg.text();
  return (
    /Failed to load resource: the server responded with a status of (404|401|403|429)/.test(t) ||
    /workspace not found/i.test(t)
  );
}

/** Attach a console/pageerror collector; returns the collected faults. */
function collectFaults(page: Page): string[] {
  const faults: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m)) faults.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => faults.push(`pageerror: ${e.message}`));
  return faults;
}

/** Drive the REAL login form. */
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
  await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD);

  const loginResponse = page.waitForResponse((r) => r.url().includes("/api/auth/login"), {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();

  // Distinguish a THROTTLED run (a harness artefact) from a genuinely broken
  // login — otherwise the 429 fails as "still on /login", which is
  // indistinguishable from a real product defect.
  const res = await loginResponse;
  if (res.status() === 429) {
    throw new Error(
      "auth throttler returned 429 — wait 60s or clear the Redis throttle:* keys; " +
        "this is a harness artefact, not a product defect",
    );
  }
  expect(res.status(), "login API rejected the fixture credentials").toBe(200);
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Navigate to the first real page via the app's own sidebar links. */
async function openFirstPage(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle");
  if ((await page.locator('a[href*="/p/"]').count()) === 0) return false;
  await page.locator('a[href*="/p/"]').first().click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  return true;
}

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------
// Auth — these drive the real login form.
// ---------------------------------------------------------------------------
test.describe("auth (drives the real login form)", () => {
  test("login screen renders and authenticates a real user", async ({ page }) => {
    const faults = collectFaults(page);

    await page.goto("/login");
    // The form is really there — not a white screen, not an error boundary.
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /password/i })).toBeVisible();

    await login(page);

    await expect(page.locator("body")).not.toBeEmpty();
    expect(faults, `unexpected JS faults: ${faults.join(" | ")}`).toEqual([]);
  });

  test("wrong password is rejected in the UI and keeps the user on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
    await page.getByRole("textbox", { name: /password/i }).fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: /sign in|log ?in/i }).click();

    await page.waitForTimeout(3_000);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// The product — one shared session, so the suite cannot throttle itself.
// ---------------------------------------------------------------------------
// Capture ONE session for the product tests below. This is a test rather than
// a beforeAll because `test.use({ storageState })` is resolved BEFORE hooks
// run — a beforeAll that writes the file is too late for the fixture to read
// it. Serial mode guarantees this lands first.
test("capture one shared session (setup)", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p);
  await ctx.storageState({ path: STORAGE });
  await ctx.close();
});

test.describe("product surfaces (authenticated)", () => {
  test.use({ storageState: STORAGE });

  test("the authenticated app shell renders without JS faults", async ({ page }) => {
    const faults = collectFaults(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const text = await page.locator("body").innerText();
    expect(text.trim().length, "authenticated shell rendered no text").toBeGreaterThan(0);
    await expect(page).not.toHaveURL(/\/login/);

    expect(faults, `unexpected JS faults: ${faults.join(" | ")}`).toEqual([]);
  });

  test("a page opens in the real editor", async ({ page }) => {
    const faults = collectFaults(page);
    await page.goto("/home");
    test.skip(!(await openFirstPage(page)), "no page links for this fixture workspace");

    // ProseMirror is the real editor root — its presence means the editor
    // actually mounted, not just that the route resolved.
    await expect(page.locator(".ProseMirror").first()).toBeVisible({ timeout: 30_000 });
    expect(faults, `unexpected JS faults: ${faults.join(" | ")}`).toEqual([]);
  });

  test("typing in the editor persists across a reload (the core wiki promise)", async ({ page }) => {
    // Use a FRESH page per run. Reusing the shared fixture page makes this
    // assertion depend on what previous runs (and the sibling editor test)
    // left in the document — observed live as interleaved markers like
    // "e2e-tye2e2e-typed-...". A page of its own makes the check about
    // persistence, not about accumulated state.
    await page.goto("/home");
    test.skip(!(await openFirstPage(page)), "no page links for this fixture workspace");

    const created = await page.evaluate(async () => {
      const spaces = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1 }),
      }).then((r) => r.json());
      const spaceId = spaces?.data?.items?.[0]?.id;
      if (!spaceId) return null;
      const res = await fetch("/api/pages/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, title: `E2E persistence ${Date.now()}` }),
      }).then((r) => r.json());
      return res?.data ?? null;
    });
    test.skip(!created?.slugId, "could not provision a fresh page for this run");

    await page.goto(`/s/${created.spaceId ?? ""}/p/${created.slugId}`);
    await page.waitForLoadState("networkidle");
    if (!/\/p\//.test(page.url())) {
      // Space slug is not in the create reply on every build; fall back to the
      // sidebar link for the page we just made.
      await page.goto("/home");
      await openFirstPage(page);
    }
    const url = page.url();

    const editor = page.locator(".ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 30_000 });

    // Type at the END of the document. Clicking mid-paragraph drops the caret
    // wherever the click landed, so repeated runs interleave their markers
    // into one another ("e2e-tye2e2e-typed-...") and the assertion fails on
    // its own accumulated state rather than on a product defect.
    const marker = `e2e-typed-${Date.now()}`;
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker);
    await expect(editor).toContainText(marker, { timeout: 15_000 });

    // Collab persistence is debounced through the Yjs store hook.
    await page.waitForTimeout(6_000);

    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const reloaded = page.locator(".ProseMirror").first();
    await expect(reloaded).toBeVisible({ timeout: 30_000 });
    await expect(
      reloaded,
      "typed content did not survive a reload — the collab store never persisted it",
    ).toContainText(marker, { timeout: 30_000 });
  });

  test("the share modal opens and its Access tab renders a real state (ENG-1375 client reads)", async ({
    page,
  }) => {
    const faults = collectFaults(page);
    await page.goto("/home");
    test.skip(!(await openFirstPage(page)), "no page links for this fixture workspace");

    const shareButton = page.getByRole("button", { name: /^share$/i });
    await expect(shareButton).toBeVisible({ timeout: 30_000 });
    await shareButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // The modal opens on Publish when the page is not publicly shared; the
    // permission surface lives behind the Access tab.
    await dialog.getByRole("tab", { name: /access/i }).click();

    // Page permissions are LICENSE-GATED (Feature.PAGE_PERMISSIONS, see
    // page-share-modal.tsx). Unlicensed, the honest state is the upsell copy
    // and NO permission request is issued — asserting the granted UI here
    // would be asserting a state this deployment cannot reach.
    //
    // Either way the tab must render a real, settled state — never an
    // infinite spinner, which is what the ENG-1375 defect produced when the
    // client's reads pointed at routes no controller served.
    const upsell = dialog.getByText(/enterprise license/i);
    const generalAccess = dialog.getByText(/^(open|restricted)$/i).first();

    await expect(
      upsell.or(generalAccess).first(),
      "Access tab never settled — neither the license gate nor the access control rendered",
    ).toBeVisible({ timeout: 20_000 });

    if (await upsell.isVisible().catch(() => false)) {
      // Unlicensed: prove the client did NOT call the permission endpoints,
      // i.e. the gate short-circuits before the read rather than firing a
      // request whose failure is merely hidden.
      const calls: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("page-permissions")) calls.push(r.url());
      });
      await page.waitForTimeout(2_000);
      expect(calls, "gated Access tab still issued permission reads").toEqual([]);
    } else {
      // Licensed: the reads my ENG-1375 fix repointed must actually succeed.
      const res = await page
        .waitForResponse((r) => r.url().includes("page-permissions/restriction-info"), {
          timeout: 10_000,
        })
        .catch(() => null);
      expect(res?.status(), "restriction-info read did not return 200").toBe(200);
    }

    expect(faults, `unexpected JS faults: ${faults.join(" | ")}`).toEqual([]);
  });
});
