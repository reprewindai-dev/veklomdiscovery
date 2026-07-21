import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  __resetNotificationRateLimitState,
  getNotificationUsers,
} from "../server/baseNotifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function check(condition, message) {
  assert.ok(condition, message);
}

async function main() {
  __resetNotificationRateLimitState?.();

  const source = readFileSync(path.join(repoRoot, "api", "veklom_backend.py"), "utf8");
  check(/^"""/.test(source), "backend should start with a docstring");
  check(!source.includes(`VEKLOM DISCOVERY — FastAPI Backend\n"""`), "backend docstring should not be malformed");

  const healthDir = path.join(repoRoot, "app", "health");
  const files = readdirSync(healthDir).filter((name) => name.startsWith("route."));
  check(JSON.stringify(files) === JSON.stringify(["route.ts"]), "health route should exist only once");
  check(!existsSync(path.join(healthDir, "route.js")), "health route.js should be removed");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, users: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const request = (ip) =>
      new Request("http://localhost/api/base-notifications/users?limit=1", {
        headers: {
          authorization: "Bearer secret",
          "x-forwarded-for": ip,
        },
      });

    process.env.VEKLOM_ADMIN_API_KEY = "secret";
    process.env.BASE_DASHBOARD_API_KEY = "dashboard";

    for (let i = 0; i < 20; i += 1) {
      const response = await getNotificationUsers(request("203.0.113.10"));
      check(response.status !== 429, "first 20 requests should not be rate-limited");
    }

    const limited = await getNotificationUsers(request("203.0.113.10"));
    check(limited.status === 429, "21st request should be rate-limited");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
