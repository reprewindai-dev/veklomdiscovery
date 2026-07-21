import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, test } from "node:test";

import {
  __resetNotificationRateLimitState,
  getNotificationUsers,
} from "../server/baseNotifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

beforeEach(() => {
  __resetNotificationRateLimitState?.();
});

test("python backend starts with a valid docstring", () => {
  const source = readFileSync(path.join(repoRoot, "api", "veklom_backend.py"), "utf8");
  assert.match(source, /^"""/);
  assert.equal(source.includes("VEKLOM DISCOVERY — FastAPI Backend\n"""), false);
});

test("health route exists only once", () => {
  const healthDir = path.join(repoRoot, "app", "health");
  const files = readdirSync(healthDir).filter((name) => name.startsWith("route."));

  assert.deepEqual(files, ["route.ts"]);
  assert.equal(existsSync(path.join(healthDir, "route.js")), false);
});

test("base notifications rate limit kicks in after 20 requests", async () => {
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
    assert.notEqual(response.status, 429);
  }

  const limited = await getNotificationUsers(request("203.0.113.10"));
  assert.equal(limited.status, 429);
});
