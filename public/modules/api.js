const API_ROOT = "https://data.opentrack.run/api/competitions/";
const MAX_PAGES = 10;

export async function fetchCompetitions(params) {
  const liveUrl = `${API_ROOT}?${params}`;
  return fetchCompetitionPages(liveUrl, Number(params.get("page_size") || 100));
}

async function fetchCompetitionPages(firstUrl, limit) {
  const results = [];
  let count = 0;
  let nextUrl = firstUrl;
  let pagesRead = 0;

  while (nextUrl && results.length < limit && pagesRead < MAX_PAGES) {
    const page = await fetchJson(nextUrl);
    const pageResults = Array.isArray(page.results) ? page.results : [];
    count = Number.isFinite(page.count) ? page.count : results.length + pageResults.length;
    results.push(...pageResults);
    pagesRead += 1;

    if (!page.next || !pageResults.length) break;
    nextUrl = new URL(page.next, firstUrl).href;
  }

  return {
    count,
    results: results.slice(0, limit)
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const type = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  if (!type.includes("application/json")) {
    throw new Error("OpenTrack returned a browser challenge instead of JSON");
  }

  return response.json();
}
