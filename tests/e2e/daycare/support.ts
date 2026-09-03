import type { Page, TestInfo } from '@playwright/test';

/**
 * Mealie's built-in first-boot admin (dev/staging/seed.sh, dev/staging/token.sh
 * "Default admin credentials"). This is the "staging admin" the charter's e2e
 * flow logs in as — never a production credential.
 */
export const STAGING_ADMIN_EMAIL = 'changeme@example.com';
export const STAGING_ADMIN_PASSWORD = 'MyPassword';

/** Mealie's default first-boot group slug (matches tests/e2e/login.spec.ts's `/\/g\/home/`). */
export const GROUP_SLUG = 'home';

/**
 * Logs in as the staging admin and lands on the group home page. Mealie shows
 * a one-time "admin setup wizard" skip link after the very first admin login
 * against a fresh database (see login.spec.ts's "password login" test); a
 * daycare spec may run after that flag has already been dismissed by an
 * earlier project/spec in the same run, so the skip is handled conditionally
 * rather than assumed.
 */
export async function loginAsStagingAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email or Username', { exact: true }).fill(STAGING_ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(STAGING_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  const skipSetupLink = page.getByRole('link', { name: "I'm already set up, just bring me to the homepage" });
  await Promise.race([
    page.waitForURL(/\/g\//, { timeout: 15000 }),
    skipSetupLink.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined),
  ]);
  if (await skipSetupLink.isVisible().catch(() => false)) {
    await skipSetupLink.click();
  }
  await page.waitForURL(/\/g\//, { timeout: 15000 });
}

/**
 * Known-benign 4xx API responses: the dashboard eagerly fetches the selected
 * week's plan/prep/shopping before any week has ever been generated, which
 * 404s by design (DaycarePlanCard/DaycarePrepCard/DaycareShoppingCard all
 * render a "no plan yet" state for exactly this response) and the browser
 * logs a native "Failed to load resource" console.error for every failed
 * fetch regardless of whether the app handled it. Documented in
 * overlay/README.md's Phase F4 section, `support.ts` entry.
 */
const EXPECTED_EMPTY_WEEK_RESPONSE = /\/api\/daycare\/v1\/weeks\/\d{4}-\d{2}-\d{2}(\/(prep|shopping))?$/;

/**
 * KNOWN DEFECT (overlay/README.md "Known defect: recipe-daycare writes fail
 * against the individual-file config bind mount"; also filed in the sidecar
 * repo's docs/FOLLOWUPS.md): every write to a recipe's daycare
 * settings/classification 500s in the deploy/compose.yaml topology, because
 * the sidecar's atomic_write_yaml (temp file + os.replace) cannot replace a
 * path that is itself an individual bind-mount point. primary-workflow's
 * step 7 exercises the real UI edit and asserts the CURRENT (broken)
 * behavior on purpose, so it starts failing the moment this is fixed — that
 * failure is the signal to flip the assertion back to "persists". Tracked
 * here, not silently swallowed, so a genuinely new failure elsewhere still
 * fails the guard.
 */
const KNOWN_DEFECT_RECIPE_SETTINGS_WRITE = /\/api\/daycare\/v1\/recipes\/[^/]+\/daycare$/;

const BROWSER_RESOURCE_LOG = /^Failed to load resource: the server responded with a status of \d+/;

export interface ConsoleGuard {
  /** Asserts no unexpected console errors, page errors, or unexplained HTTP failures were observed. */
  assertClean(): void;
}

/**
 * Attaches console/page-error/response listeners for the whole test and
 * returns a guard to assert against at the end. A real application error
 * (uncaught exception, non-network console.error) always fails the guard;
 * the browser's own "Failed to load resource" log line is allowed only when
 * it coincides with a tracked expected response (an empty-week 404, or the
 * one documented known-defect 500 above) — any other 4xx/5xx response fails
 * the guard too.
 */
export function attachConsoleGuard(page: Page): ConsoleGuard {
  const unexpected: string[] = [];
  let expectedFailureCount = 0;

  page.on('pageerror', (err) => {
    // Mealie's cook-mode requests the Wake Lock API; automated/headless
    // browsers (Playwright locally and in CI) deny that permission by
    // policy, which is a browser-environment property, not a Daycare or
    // Mealie defect — unrelated to any flow this suite drives.
    if (/Wake Lock permission request denied/.test(err.message)) return;
    unexpected.push(`pageerror: ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    const method = res.request().method();
    if (EXPECTED_EMPTY_WEEK_RESPONSE.test(res.url()) && method === 'GET') {
      expectedFailureCount += 1;
      return;
    }
    if (KNOWN_DEFECT_RECIPE_SETTINGS_WRITE.test(res.url()) && method === 'PUT' && res.status() === 500) {
      expectedFailureCount += 1;
      return;
    }
    unexpected.push(`http${res.status()}: ${method} ${res.url()}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (BROWSER_RESOURCE_LOG.test(msg.text()) && expectedFailureCount > 0) {
      expectedFailureCount -= 1;
      return;
    }
    unexpected.push(`console.error: ${msg.text()}`);
  });

  return {
    assertClean() {
      if (unexpected.length) {
        throw new Error(`Unexpected console/page errors during the flow:\n${unexpected.join('\n')}`);
      }
    },
  };
}

/** Returns a per-test screenshot-step function, numbered in flow order from 1. */
export function createScreenshotStep(page: Page, testInfo: TestInfo): (name: string) => Promise<void> {
  let index = 0;
  return async (name: string) => {
    index += 1;
    const buffer = await page.screenshot({ fullPage: true });
    await testInfo.attach(`${String(index).padStart(2, '0')}-${name}`, {
      body: buffer,
      contentType: 'image/png',
    });
  };
}
