import assert from "node:assert/strict";
import test from "node:test";
import { handleWorkerRequest } from "../worker/index.js";

const APP_ORIGIN = "https://nhols.github.io";
const API_URL = "https://opentrack-map-api.example.workers.dev/api/competitions";

test("rejects requests from other origins", async () => {
  const response = await handleWorkerRequest(
    new Request(API_URL, { headers: { origin: "https://example.com" } }),
    {},
    { waitUntil() {} },
    () => assert.fail("competition handler should not run")
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("answers preflight requests for the GitHub Pages origin", async () => {
  const response = await handleWorkerRequest(
    new Request(API_URL, { method: "OPTIONS", headers: { origin: APP_ORIGIN } }),
    {},
    { waitUntil() {} }
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), APP_ORIGIN);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
});

test("adds CORS headers to competition responses", async () => {
  let receivedContext;
  const context = { waitUntil() {} };
  const response = await handleWorkerRequest(
    new Request(`${API_URL}?country=GBR`, { headers: { origin: APP_ORIGIN } }),
    { OPENTRACK_API_TOKEN: "test-token" },
    context,
    async (handlerContext) => {
      receivedContext = handlerContext;
      return Response.json({ count: 0, results: [] });
    }
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), APP_ORIGIN);
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(receivedContext.env.OPENTRACK_API_TOKEN, "test-token");
  assert.deepEqual(await response.json(), { count: 0, results: [] });
});
