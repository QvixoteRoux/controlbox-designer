import { HealthResponse } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const app = await buildApp({ pingDb: () => Promise.resolve() });

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ status: "ok", db: "up" });
    await app.close();
  });

  it("reports degraded with 503 when the database is down", async () => {
    const app = await buildApp({ pingDb: () => Promise.reject(new Error("ECONNREFUSED")) });

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(503);
    const body = HealthResponse.parse(res.json());
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("down");
    // Internal error details stay in the server log.
    expect(body.error).not.toContain("ECONNREFUSED");
    await app.close();
  });
});
