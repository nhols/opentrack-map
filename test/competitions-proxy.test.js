import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpstreamParams,
  handleCompetitionRequest
} from "../worker/competitions.js";

test("requires the server-side API token", async () => {
  const response = await handleCompetitionRequest({
    request: new Request("https://example.com/api/competitions"),
    env: {},
    fetchImpl: () => assert.fail("fetch should not run")
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    detail: "OpenTrack API access is not configured"
  });
});

test("normalizes and restricts upstream query parameters", () => {
  const input = new URLSearchParams({
    country: "gbr",
    date_from: "2026-08-01",
    date_to: "2026-09-01",
    ordering: "date",
    limit: "100",
    offset: "0",
    ignored: "secret"
  });

  assert.equal(
    buildUpstreamParams(input).toString(),
    "country=GBR&date_from=2026-08-01&date_to=2026-09-01&limit=100&offset=0&ordering=date"
  );
  assert.throws(
    () => buildUpstreamParams(new URLSearchParams({ country: "USA" })),
    /Only Great Britain/
  );
  assert.throws(
    () => buildUpstreamParams(new URLSearchParams({ date_from: "2026-02-31" })),
    /valid date/
  );
});

test("authenticates upstream requests without exposing the token", async () => {
  let upstreamRequest;
  const response = await handleCompetitionRequest({
    request: new Request(
      "https://example.com/api/competitions?date_from=2026-08-01&date_to=2026-09-01&limit=100"
    ),
    env: { OPENTRACK_API_TOKEN: "test-token" },
    cache: null,
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, headers: new Headers(options.headers) };
      return Response.json({ count: 0, next: null, previous: null, results: [] });
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-opentrack-cache"), "MISS");
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  assert.equal(upstreamRequest.headers.get("authorization"), "Token test-token");
  assert.match(upstreamRequest.url, /country=GBR/);
  assert.doesNotMatch(await response.text(), /test-token/);
});

test("serves matching responses from cache", async () => {
  const cachedResponse = Response.json({ count: 1, results: [{ slug: "cached" }] });
  const cache = {
    async match() {
      return cachedResponse;
    },
    async put() {
      assert.fail("cache.put should not run on a hit");
    }
  };

  const response = await handleCompetitionRequest({
    request: new Request("https://example.com/api/competitions?limit=100"),
    env: { OPENTRACK_API_TOKEN: "test-token" },
    cache,
    fetchImpl: () => assert.fail("fetch should not run on a cache hit")
  });

  assert.equal(response.headers.get("x-opentrack-cache"), "HIT");
  assert.deepEqual(await response.json(), {
    count: 1,
    results: [{ slug: "cached" }]
  });
});

test("does not cache upstream errors", async () => {
  let cacheWrites = 0;
  const response = await handleCompetitionRequest({
    request: new Request("https://example.com/api/competitions?limit=100"),
    env: { OPENTRACK_API_TOKEN: "bad-token" },
    cache: {
      async match() {
        return null;
      },
      async put() {
        cacheWrites += 1;
      }
    },
    fetchImpl: async () =>
      Response.json({ detail: "Authentication credentials were not provided." }, { status: 403 })
  });

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheWrites, 0);
});
