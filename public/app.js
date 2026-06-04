const API_ROOT = "https://data.opentrack.run/api/competitions/";
const LOCAL_PROXY = "/api/opentrack";

const state = {
  competitions: [],
  markers: [],
  markerByKey: new Map(),
  markerLayer: null,
  map: null,
  activeUrl: null,
  datePicker: null,
  totalCount: null,
  sort: {
    field: "date",
    direction: "asc"
  }
};

const elements = {
  filters: document.querySelector("#filters"),
  refreshButton: document.querySelector("#refreshButton"),
  fitButton: document.querySelector("#fitButton"),
  clearDatesButton: document.querySelector("#clearDatesButton"),
  dateFromInput: document.querySelector("#dateFromInput"),
  dateToInput: document.querySelector("#dateToInput"),
  dateRangeInput: document.querySelector("#dateRangeInput"),
  sortButtons: document.querySelectorAll(".sort-toggle"),
  list: document.querySelector("#competitionList"),
  status: document.querySelector("#status")
};

window.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  initMap();
  initDatePicker();
  bindEvents();
  updateSortButtons();
  loadCompetitions();
});

function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    worldCopyJump: true
  }).setView([54.7, -2.4], 5);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);
}

function bindEvents() {
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadCompetitions();
  });

  elements.refreshButton.addEventListener("click", () => loadCompetitions());
  elements.fitButton.addEventListener("click", () => fitMarkers());
  elements.sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      cycleSort(button.dataset.sortField);
      renderCurrentCompetitions();
    });
  });
  elements.clearDatesButton.addEventListener("click", () => {
    state.datePicker?.clear();
    elements.dateFromInput.value = "";
    elements.dateToInput.value = "";
    loadCompetitions();
  });
}

async function loadCompetitions() {
  setStatus("Loading competitions...");
  elements.list.innerHTML = "";
  state.markerLayer.clearLayers();
  state.markers = [];
  state.markerByKey.clear();

  const formData = new FormData(elements.filters);
  const params = buildParams(formData);

  try {
    const data = await fetchCompetitions(params);
    state.competitions = normalizeCompetitions(data.results || []);
    state.totalCount = data.count;
    renderCurrentCompetitions();
  } catch (error) {
    setStatus(error.message);
    renderEmptyState();
  }
}

function renderCurrentCompetitions() {
  const competitions = sortCompetitions(applyLocalFilters(state.competitions, new FormData(elements.filters)));
  renderCompetitions(competitions);
  renderMarkers(competitions);
  updateLoadedStatus(state.totalCount, competitions);
  fitMarkers();
}

function buildParams(formData) {
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    const clean = String(value).trim();
    if (clean) params.set(key, clean);
  }

  if (!params.has("page_size")) params.set("page_size", "100");
  if (!params.has("when") && !params.has("date_from") && !params.has("date_to")) {
    params.set("when", "future");
  }
  params.set("ordering", state.sort.field === "date" && state.sort.direction === "desc" ? "-date" : "date");
  return params;
}

async function fetchCompetitions(params) {
  const liveUrl = `${API_ROOT}?${params}`;
  const proxyUrl = `${LOCAL_PROXY}?${params}`;
  const errors = [];

  for (const url of [liveUrl, proxyUrl]) {
    try {
      return await fetchCompetitionPages(url, Number(params.get("page_size") || 100));
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`Could not load OpenTrack data: ${errors.at(-1) || "unknown error"}`);
}

async function fetchCompetitionPages(firstUrl, limit) {
  const results = [];
  let count = 0;
  let nextUrl = firstUrl;
  let pagesRead = 0;

  while (nextUrl && results.length < limit && pagesRead < 10) {
    const page = await fetchJson(nextUrl);
    const pageResults = Array.isArray(page.results) ? page.results : [];
    count = Number.isFinite(page.count) ? page.count : results.length + pageResults.length;
    results.push(...pageResults);
    pagesRead += 1;

    if (!page.next || !pageResults.length) break;
    nextUrl = normalizeNextUrl(page.next, firstUrl);
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

function normalizeNextUrl(nextUrl, firstUrl) {
  if (!firstUrl.startsWith(LOCAL_PROXY)) return nextUrl;
  const search = new URL(nextUrl, API_ROOT).search;
  return `${LOCAL_PROXY}${search}`;
}

function normalizeCompetitions(results) {
  return results.map((item) => {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    const country = extractCode(item.country);
    const name = item.full_name || item.short_name || item.slug || "Untitled competition";
    const hasLocation = isMappableCoordinate(lat, lng);

    return {
      ...item,
      key: competitionKey(item),
      name,
      countryCode: country,
      lat,
      lng,
      hasLocation,
      displayDate: formatDateRange(item.date, item.finish_date),
      locationLabel: [item.city, country].filter(Boolean).join(", ")
    };
  });
}

function applyLocalFilters(competitions, formData) {
  const dateFrom = parseFilterDate(formData.get("date_from"));
  const dateTo = parseFilterDate(formData.get("date_to"));

  return competitions.filter((competition) => {
    if (dateFrom || dateTo) {
      const start = parseFilterDate(competition.date);
      const finish = parseFilterDate(competition.finish_date || competition.date);
      if (!start || !finish) return false;
      if (dateFrom && finish < dateFrom) return false;
      if (dateTo && start > dateTo) return false;
    }

    return true;
  });
}

function sortCompetitions(competitions) {
  const sorted = [...competitions];
  const { field, direction } = state.sort;

  if (!field || !direction) return sorted;

  sorted.sort((a, b) => {
    if (field === "mapped") {
      const mappedOrder = direction === "asc" ? compareMapped(b, a) : compareMapped(a, b);
      return mappedOrder || compareDates(a, b);
    }

    return direction === "desc" ? compareDates(b, a) : compareDates(a, b);
  });

  return sorted;
}

function cycleSort(field) {
  if (state.sort.field !== field) {
    state.sort = { field, direction: "asc" };
  } else if (state.sort.direction === "asc") {
    state.sort.direction = "desc";
  } else if (state.sort.direction === "desc") {
    state.sort = { field: null, direction: null };
  } else {
    state.sort = { field, direction: "asc" };
  }

  updateSortButtons();
}

function updateSortButtons() {
  elements.sortButtons.forEach((button) => {
    const isActive = button.dataset.sortField === state.sort.field;
    const direction = isActive ? state.sort.direction : null;
    const label = button.dataset.sortField === "mapped" ? "Mapped" : "Date";
    const description =
      direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "off";

    button.dataset.direction = direction || "off";
    button.classList.toggle("is-active", Boolean(direction));
    button.setAttribute("aria-pressed", String(Boolean(direction)));
    button.setAttribute("title", `${label} sort ${description}`);
  });
}

function compareDates(a, b) {
  const aTime = parseFilterDate(a.date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bTime = parseFilterDate(b.date)?.getTime() ?? Number.POSITIVE_INFINITY;
  return aTime - bTime || String(a.name).localeCompare(String(b.name));
}

function compareMapped(a, b) {
  return Number(a.hasLocation) - Number(b.hasLocation);
}

function renderCompetitions(competitions) {
  elements.list.innerHTML = "";

  if (!competitions.length) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  competitions.forEach((competition) => {
    const item = document.createElement("li");
    item.className = "competition-item";
    item.dataset.url = competition.url || competition.home_page_url || "";

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => focusCompetition(competition));

    const name = document.createElement("span");
    name.className = "competition-name";
    name.textContent = competition.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.append(
      pill(competition.displayDate || "Date TBC"),
      pill(competition.locationLabel || "Location TBC"),
      pill(competition.hasLocation ? "Mapped" : "No coordinates", !competition.hasLocation)
    );

    button.append(name, meta);
    item.append(button);
    fragment.append(item);
  });

  elements.list.append(fragment);
}

function renderMarkers(competitions) {
  state.markerLayer.clearLayers();
  state.markers = [];
  state.markerByKey.clear();

  competitions.filter((competition) => competition.hasLocation).forEach((competition) => {
    const marker = L.circleMarker([competition.lat, competition.lng], {
      radius: 7,
      color: "#135846",
      weight: 2,
      fillColor: "#1d7561",
      fillOpacity: 0.82
    }).addTo(state.markerLayer);
    marker.bindPopup(popupHtml(competition), { autoPan: false });
    marker.on("click", () => setActiveCompetition(competition));
    state.markers.push(marker);
    state.markerByKey.set(competition.key, marker);
  });
}

function focusCompetition(competition) {
  setActiveCompetition(competition);

  if (!competition.hasLocation) return;

  const target = [competition.lat, competition.lng];
  state.map.setView(target, Math.max(state.map.getZoom(), 10), {
    animate: true
  });

  const marker = state.markerByKey.get(competition.key);
  marker?.openPopup();
  state.map.panTo(target, { animate: true });
}

function setActiveCompetition(competition) {
  state.activeUrl = competition.url || competition.home_page_url || "";
  document.querySelectorAll(".competition-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.url === state.activeUrl);
  });
}

function fitMarkers() {
  if (!state.markers.length) {
    state.map.setView([54.7, -2.4], 5);
    return;
  }

  const group = L.featureGroup(state.markers);
  state.map.fitBounds(group.getBounds().pad(0.18), {
    animate: true,
    maxZoom: 12
  });
}

function updateLoadedStatus(totalCount, visibleCompetitions) {
  const mapped = visibleCompetitions.filter((competition) => competition.hasLocation).length;
  const shown = visibleCompetitions.length;

  if (Number.isFinite(totalCount) && totalCount > shown) {
    setStatus(`Showing ${shown.toLocaleString()} of ${totalCount.toLocaleString()} matches; ${mapped.toLocaleString()} mapped.`);
    return;
  }

  setStatus(`Showing ${shown.toLocaleString()} matches; ${mapped.toLocaleString()} mapped.`);
}

function renderEmptyState() {
  const item = document.createElement("li");
  item.className = "competition-item";

  const name = document.createElement("span");
  name.className = "competition-name";
  name.textContent = "No competitions to show";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.append(pill("Try another filter"));

  item.append(name, meta);
  elements.list.append(item);
}

function popupHtml(competition) {
  const link = competition.home_page_url || competition.url || "";
  const safeName = escapeHtml(competition.name);
  const safeMeta = escapeHtml(
    [competition.displayDate, competition.locationLabel, competition.type].filter(Boolean).join(" • ")
  );

  return `
    <span class="popup-title">${safeName}</span>
    <span class="popup-meta">${safeMeta}</span>
    ${link ? `<a class="popup-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">Open</a>` : ""}
  `;
}

function pill(text, missing = false) {
  const span = document.createElement("span");
  span.className = `pill${missing ? " is-missing" : ""}`;
  span.textContent = text;
  return span;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function formatDateRange(start, finish) {
  if (!start) return "";
  if (!finish || start === finish) return formatDate(start);
  return `${formatDate(start)} to ${formatDate(finish)}`;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function initDatePicker() {
  if (!window.flatpickr) return;

  state.datePicker = window.flatpickr(elements.dateRangeInput, {
    mode: "range",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "D j M Y",
    showMonths: window.matchMedia("(min-width: 900px)").matches ? 2 : 1,
    monthSelectorType: "static",
    disableMobile: true,
    locale: {
      firstDayOfWeek: 1
    },
    onChange: (selectedDates, _dateStr, instance) => {
      const [from, to] = selectedDates;
      setDateInputs(from, to, instance);
      if (selectedDates.length === 2) loadCompetitions();
    },
    onClose: (selectedDates) => {
      if (selectedDates.length !== 1) return;
      elements.dateToInput.value = elements.dateFromInput.value;
      loadCompetitions();
    }
  });

  const start = startOfToday();
  const end = addMonths(start, 1);
  state.datePicker.setDate([start, end], false);
  setDateInputs(start, end, state.datePicker);
}

function parseFilterDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function setDateInputs(from, to, picker) {
  elements.dateFromInput.value = from ? picker.formatDate(from, "Y-m-d") : "";
  elements.dateToInput.value = to ? picker.formatDate(to, "Y-m-d") : "";
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function addMonths(date, months) {
  const next = new Date(date);
  const targetMonth = next.getMonth() + months;
  next.setMonth(targetMonth);

  if (next.getMonth() !== targetMonth % 12) {
    next.setDate(0);
  }

  return next;
}

function isMappableCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function competitionKey(item) {
  return [item.url, item.home_page_url, item.slug, item.date, item.full_name || item.short_name]
    .filter(Boolean)
    .join("|");
}

function extractCode(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/\/([A-Z]{3})\/?$/);
  return match?.[1] || text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
