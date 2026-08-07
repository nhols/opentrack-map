const LOCAL_API_ROOT = "/api/competitions";
export const PAGE_LIMIT = 100;
const BACKGROUND_PAGE_CONCURRENCY = 5;

export async function fetchCompetitionsIncrementally(params, { signal, onPage } = {}) {
  const apiRoot = competitionApiRoot();
  const firstParams = new URLSearchParams(params);
  firstParams.delete("page_size");
  firstParams.delete("limit");
  firstParams.delete("offset");
  firstParams.set("limit", String(PAGE_LIMIT));
  firstParams.set("offset", "0");

  const firstPage = await fetchJson(`${apiRoot}?${firstParams}`, { signal });
  const firstResults = Array.isArray(firstPage.results) ? firstPage.results : [];
  const firstCount = Number(firstPage.count);
  const totalCount = Number.isFinite(firstCount) ? firstCount : firstResults.length;

  await onPage?.({
    results: firstResults,
    count: totalCount,
    next: firstPage.next,
    pageIndex: 0
  });

  const totalPages = Math.ceil(totalCount / PAGE_LIMIT);
  if (!firstPage.next || !firstResults.length || totalPages <= 1) return;

  const remainingPages = [];
  for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
    const pageParams = new URLSearchParams(firstParams);
    pageParams.set("offset", String(pageIndex * PAGE_LIMIT));
    remainingPages.push({
      pageIndex,
      url: `${apiRoot}?${pageParams}`
    });
  }

  await fetchPagesConcurrently(remainingPages, {
    count: totalCount,
    onPage,
    signal
  });
}

function competitionApiRoot() {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return LOCAL_API_ROOT;
  }

  const configured = window.OPENTRACK_MAP_CONFIG?.apiRoot?.trim().replace(/\/$/, "");
  if (!configured || configured.includes("__OPENTRACK_API_ROOT__")) {
    throw new Error("Competition API endpoint is not configured");
  }
  return configured;
}

async function fetchPagesConcurrently(pages, { count, onPage, signal }) {
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(BACKGROUND_PAGE_CONCURRENCY, pages.length);

  async function worker() {
    while (nextIndex < pages.length && !firstError) {
      if (signal?.aborted) throw abortError();

      const pageInfo = pages[nextIndex];
      nextIndex += 1;

      try {
        const page = await fetchJson(pageInfo.url, { signal });
        await onPage?.({
          results: Array.isArray(page.results) ? page.results : [],
          count: Number.isFinite(Number(page.count)) ? Number(page.count) : count,
          next: page.next,
          pageIndex: pageInfo.pageIndex
        });
      } catch (error) {
        firstError = error;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  if (firstError) throw firstError;
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

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
