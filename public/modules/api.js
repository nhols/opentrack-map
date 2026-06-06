const API_ROOT = "https://data.opentrack.run/api/competitions/";
export const PAGE_LIMIT = 10;

export async function fetchCompetitionsIncrementally(params, { signal, onPage } = {}) {
  const firstParams = new URLSearchParams(params);
  firstParams.delete("page_size");
  firstParams.delete("limit");
  firstParams.delete("offset");
  firstParams.set("limit", String(PAGE_LIMIT));
  firstParams.set("offset", "0");

  let nextUrl = `${API_ROOT}?${firstParams}`;
  let pageIndex = 0;

  while (nextUrl) {
    const page = await fetchJson(nextUrl, { signal });
    const pageResults = Array.isArray(page.results) ? page.results : [];
    const count = Number(page.count);

    await onPage?.({
      results: pageResults,
      count: Number.isFinite(count) ? count : pageResults.length,
      next: page.next,
      pageIndex
    });

    if (!page.next || !pageResults.length) break;
    nextUrl = new URL(page.next, API_ROOT).href;
    pageIndex += 1;
  }
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json" }
  });
  const type = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  if (!type.includes("application/json")) {
    throw new Error("OpenTrack returned a browser challenge instead of JSON");
  }

  return response.json();
}
