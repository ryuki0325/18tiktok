import { defineConfig, devices } from "@playwright/test";

/** E2E：本番ビルドを使い、空のDB（.data-e2e）で起動する */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3200", ...devices["iPhone 13"], browserName: "chromium", locale: "ja-JP" },
  webServer: {
    command: "rm -rf .data && npx next start -p 3200",
    url: "http://localhost:3200/age-gate",
    reuseExistingServer: false,
    timeout: 120_000,
    // E2E_DATABASE_URL を指定すると本物の PostgreSQL で試せる（未指定なら組み込みの PGlite）
    env: { AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef", ADMIN_PASSWORD: "glow-admin-e2e", DATABASE_URL: process.env.E2E_DATABASE_URL ?? "", ALLOW_EMBEDDED_DB: "true", UPLOAD_CHUNK_KB: "128", MEDIA_PROVIDER: "local", LOGIN_MAX_PER_IP: "200", CRON_SECRET: "e2e-cron-secret-0123456789", BUNNY_WEBHOOK_SECRET: "e2e-bunny-hook-0123456789", DB_SCHEMA: process.env.E2E_DB_SCHEMA ?? "" },
  },
});
