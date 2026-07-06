import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * Honest empty-state smoke.
 *
 * The database has no workspace, so the app's truthful empty state is the
 * self-hosted setup flow. Visiting "/" client-routes to "/home"; the
 * UserProvider's first API probe returns 404 "workspace not found", and the
 * axios interceptor (src/lib/api-client.ts) hard-navigates the browser to
 * "/setup/register", which renders SetupWorkspaceForm. This test proves that
 * empty state actually renders AND that the boot did not crash.
 *
 * --- Console-error allowlist (decided from REAL observed output) ---
 * Booting the empty state emits exactly these two console messages of type
 * "error", both with the literal text:
 *     "Failed to load resource: the server responded with a status of 404 (Not Found)"
 * They are the browser's network-status log for the unauthenticated workspace
 * probes (`/api/*`) that legitimately 404 because no workspace exists yet — the
 * very signal the app uses to route to setup. They are benign HTTP-status noise,
 * never a JS fault. We therefore allow console "error" messages ONLY when the
 * text matches the "Failed to load resource ... status of 404|401" shape (401 is
 * the documented sibling case for unauthenticated API probes per the interceptor's
 * 401 branch). ANY other console error — a React render error, an uncaught
 * TypeError surfaced via console.error, a failed asset, etc. — is NOT allowed and
 * fails the test. Note the interceptor's own `console.log("workspace not found")`
 * is type "log", not "error", so it is irrelevant to this listener.
 */
const BENIGN_NETWORK_PROBE =
  /Failed to load resource: the server responded with a status of (404|401)/i;

function isAllowedConsoleError(msg: ConsoleMessage): boolean {
  return msg.type() === "error" && BENIGN_NETWORK_PROBE.test(msg.text());
}

test("honest empty state: '/' redirects to setup/register and the form renders without crashing", async ({
  page,
}) => {
  const disallowedConsoleErrors: string[] = [];
  const pageErrors: string[] = [];

  // Attach BEFORE navigation so nothing during boot is missed.
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (isAllowedConsoleError(msg)) return;
    disallowedConsoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.stack ?? err.message);
  });

  // (a) go to '/'
  await page.goto("/");

  // (b) wait for the client-driven redirect to the setup flow.
  await page.waitForURL(/\/setup\/register$/, { timeout: 15_000 });

  // (c) assert the REAL setup form rendered — visible heading + the actual
  //     fields from SetupWorkspaceForm. expect() auto-retries until visible,
  //     so there are no arbitrary sleeps masking a slow render.
  await expect(
    page.getByRole("heading", { level: 2, name: "Create workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Workspace Name")).toBeVisible();
  await expect(page.getByLabel("Your Name")).toBeVisible();
  await expect(page.getByLabel("Your Email")).toBeVisible();
  await expect(page.getByLabel("Your Email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create workspace" }),
  ).toBeVisible();

  // Let the async unauthenticated probes flush so any late console error is
  // captured — networkidle is a real settle signal, not an arbitrary wait.
  await page.waitForLoadState("networkidle");

  // (d) assert NO crash: zero uncaught page errors and zero non-benign
  //     console errors.
  expect(
    pageErrors,
    `Unexpected uncaught page error(s):\n${pageErrors.join("\n")}`,
  ).toEqual([]);
  expect(
    disallowedConsoleErrors,
    `Unexpected console error(s) beyond benign 404/401 probes:\n${disallowedConsoleErrors.join(
      "\n",
    )}`,
  ).toEqual([]);
});
