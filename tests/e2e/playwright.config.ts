import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './.',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:9000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },

    /*
     * Daycare overlay specs (tests/e2e/daycare/**, overlay/README.md).
     * Scoped to these two projects only via testDir + testMatch, and kept
     * out of chromium/firefox/webkit above (which are left untouched) by
     * naming these specs "*.dc-spec.ts" instead of the default "*.spec.ts"
     * glob those projects match. Run against a real daycare-stack gateway
     * (deploy/compose.yaml + compose.rehearsal.yaml in the sidecar repo,
     * never dev/staging directly, never production) — set DAYCARE_BASE_URL
     * to that gateway's loopback URL before running.
     */
    {
      name: 'Daycare Mobile Safari',
      testDir: './daycare',
      testMatch: /.*\.dc-spec\.ts/,
      use: {
        ...devices['iPhone 14'],
        baseURL: process.env.DAYCARE_BASE_URL || 'http://127.0.0.1:19926',
      },
    },
    {
      name: 'Daycare Desktop Chrome',
      testDir: './daycare',
      testMatch: /.*\.dc-spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.DAYCARE_BASE_URL || 'http://127.0.0.1:19926',
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
