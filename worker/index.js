import { handleCompetitionRequest } from "./competitions.js";

const APP_ORIGIN = "https://nhols.github.io";
const API_PATHS = new Set(["/api/competitions", "/api/competitions/"]);

export default {
  async fetch(request, env, context) {
    return handleWorkerRequest(request, env, context);
  }
};

export async function handleWorkerRequest(
  request,
  env,
  context,
  handleCompetitions = handleCompetitionRequest
) {
  const origin = request.headers.get("origin");
  if (origin !== APP_ORIGIN) {
    return Response.json(
      { detail: "Forbidden" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  const url = new URL(request.url);
  if (!API_PATHS.has(url.pathname)) {
    return withCors(Response.json({ detail: "Not found" }, { status: 404 }), origin);
  }

  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), origin, true);
  }

  if (request.method !== "GET") {
    return withCors(
      Response.json(
        { detail: "Method not allowed" },
        { status: 405, headers: { allow: "GET, OPTIONS" } }
      ),
      origin
    );
  }

  const response = await handleCompetitions({
    request,
    env,
    waitUntil: (promise) => context.waitUntil(promise)
  });
  return withCors(response, origin);
}

function withCors(response, origin, preflight = false) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");

  if (preflight) {
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "Accept");
    headers.set("access-control-max-age", "86400");
  } else {
    headers.set("access-control-expose-headers", "X-OpenTrack-Cache");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
