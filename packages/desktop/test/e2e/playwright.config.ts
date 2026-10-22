import { defineConfig } from '@playwright/test'

// Local runs keep app windows off-screen and unfocused (src/main/e2eBackground.ts).
// CI keeps visible windows under xvfb. Set MARKTEXT_E2E_BACKGROUND=0 to watch a run.
if (!process.env.CI) process.env.MARKTEXT_E2E_BACKGROUND ??= '1'

export default defineConfig({
  workers: 1,
  testMatch: '**/*.spec.ts',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  timeout: 30000
})
