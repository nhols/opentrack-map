const OPENTRACK_COMPETITIONS_URL = "https://data.opentrack.run/api/competitions/";
const API_COUNTRY = "GBR";
const EDGE_CACHE_SECONDS = 300;
const BROWSER_CACHE_SECONDS = 60;
const MAX_DATE_RANGE_DAYS = 366;

export async function handleCompetitionRequest({
  request,
  env,
  waitUntil = ignorePromise,
  fetchImpl = fetch,
  cache = globalThis.caches?.default
}) {
  const token = env?.OPENTRACK_API_TOKEN?.trim();
  if (!token) {
    return jsonError(503, "OpenTrack API access is not configured");
  }

  let upstreamParams;
  try {
    upstreamParams = buildUpstreamParams(new URL(request.url).searchParams);
  } catch (error) {
    return jsonError(400, error.message);
  }

  const cacheKey = buildCacheKey(request.url, upstreamParams);
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return clientResponse(cached, "HIT");

  let upstream;
  try {
    upstream = await fetchImpl(`${OPENTRACK_COMPETITIONS_URL}?${upstreamParams}`, {
      headers: {
        accept: "application/json",
        authorization: `Token ${token}`
      }
    });
  } catch {
    return jsonError(502, "OpenTrack could not be reached");
  }

  const contentType = upstream.headers.get("content-type") || "";
  const body = await upstream.arrayBuffer();

  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "cache-control": "no-store",
        "content-type": contentType || "application/json; charset=utf-8"
      }
    });
  }

  if (!contentType.includes("application/json")) {
    return jsonError(502, "OpenTrack returned an unexpected response");
  }

  const cacheResponse = new Response(body, {
    status: upstream.status,
    headers: {
      "cache-control": `public, max-age=${EDGE_CACHE_SECONDS}`,
      "content-type": contentType
    }
  });

  if (cache) {
    waitUntil(cache.put(cacheKey, cacheResponse.clone()));
  }

  return clientResponse(cacheResponse, "MISS");
}

export function buildUpstreamParams(input) {
  const params = new URLSearchParams();
  const requestedCountry = input.get("country")?.trim().toUpperCase();

  if (requestedCountry && requestedCountry !== API_COUNTRY) {
    throw new Error("Only Great Britain competitions are available");
  }

  copyDate(input, params, "date_from");
  copyDate(input, params, "date_to");
  validateDateRange(params);

  copyEnum(input, params, "when", ["future", "past"]);
  copyEnum(input, params, "ordering", [
    "date",
    "-date",
    "created",
    "-created",
    "full_name",
    "-full_name"
  ]);
  copyPattern(input, params, "type", /^[A-Z_]{1,32}$/);
  copyText(input, params, "search", 100);
  copyInteger(input, params, "limit", { min: 1, max: 100 });
  copyInteger(input, params, "offset", { min: 0, max: 100000 });

  params.set("country", API_COUNTRY);
  params.sort();
  return params;
}

function copyDate(input, output, name) {
  const value = input.get(name)?.trim();
  if (!value) return;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  const isExactDate =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
  if (!isExactDate) {
    throw new Error(`${name} must be a valid date`);
  }
  output.set(name, value);
}

function validateDateRange(params) {
  const from = params.get("date_from");
  const to = params.get("date_to");
  if (!from || !to) return;

  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (toTime < fromTime) throw new Error("date_to must not be before date_from");

  const days = (toTime - fromTime) / 86400000;
  if (days > MAX_DATE_RANGE_DAYS) {
    throw new Error(`Date ranges cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
  }
}

function copyEnum(input, output, name, allowed) {
  const value = input.get(name)?.trim();
  if (!value) return;
  if (!allowed.includes(value)) throw new Error(`${name} is invalid`);
  output.set(name, value);
}

function copyPattern(input, output, name, pattern) {
  const value = input.get(name)?.trim();
  if (!value) return;
  if (!pattern.test(value)) throw new Error(`${name} is invalid`);
  output.set(name, value);
}

function copyText(input, output, name, maxLength) {
  const value = input.get(name)?.trim();
  if (!value) return;
  if (value.length > maxLength) throw new Error(`${name} is too long`);
  output.set(name, value);
}

function copyInteger(input, output, name, { min, max }) {
  const value = input.get(name)?.trim();
  if (!value) return;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);

  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  output.set(name, String(number));
}

function buildCacheKey(requestUrl, params) {
  const url = new URL(requestUrl);
  url.search = params.toString();
  return new Request(url.toString(), { method: "GET" });
}

function clientResponse(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${BROWSER_CACHE_SECONDS}`);
  headers.set("x-opentrack-cache", cacheStatus);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonError(status, detail) {
  return Response.json(
    { detail },
    {
      status,
      headers: { "cache-control": "no-store" }
    }
  );
}

function ignorePromise(promise) {
  promise.catch(() => {});
}
