const API_ROOT = "https://data.opentrack.run/api/competitions/";

const state = {
  competitions: [],
  eventsOpen: true,
  filtersOpen: false,
  markers: [],
  markerByKey: new Map(),
  markerLayer: null,
  map: null,
  activeUrl: null,
  datePicker: null,
  totalCount: null,
  userLocation: null,
  sort: {
    field: "date",
    direction: "asc"
  }
};

const elements = {
  panel: document.querySelector(".panel"),
  filters: document.querySelector("#filters"),
  filterToggle: document.querySelector("#filterToggle"),
  filterSummary: document.querySelector("#filterSummary"),
  eventsToggle: document.querySelector("#eventsToggle"),
  refreshButton: document.querySelector("#refreshButton"),
  fitButton: document.querySelector("#fitButton"),
  clearDatesButton: document.querySelector("#clearDatesButton"),
  dateFromInput: document.querySelector("#dateFromInput"),
  dateToInput: document.querySelector("#dateToInput"),
  dateRangeInput: document.querySelector("#dateRangeInput"),
  sortRow: document.querySelector("#sortRow"),
  sortButtons: document.querySelectorAll(".sort-toggle"),
  sortHint: document.querySelector("#sortHint"),
  list: document.querySelector("#competitionList"),
  status: document.querySelector("#status")
};

window.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  initMap();
  initDatePicker();
  bindEvents();
  setEventsOpen(!window.matchMedia("(max-width: 760px)").matches);
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

  state.markerLayer = createMarkerLayer().addTo(state.map);
}

function bindEvents() {
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadCompetitions();
    setFiltersOpen(false);
  });

  elements.filters.addEventListener("change", () => {
    updateFilterSummary();
  });

  elements.filters.addEventListener("input", () => {
    updateFilterSummary();
  });

  elements.filterToggle.addEventListener("click", () => {
    setFiltersOpen(!state.filtersOpen);
  });
  elements.eventsToggle.addEventListener("click", () => {
    setEventsOpen(!state.eventsOpen);
  });
  elements.refreshButton.addEventListener("click", () => loadCompetitions());
  elements.fitButton.addEventListener("click", () => fitMarkers());
  elements.sortButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const shouldRender = await cycleSort(button.dataset.sortField);
      if (!shouldRender) return;
      renderCurrentCompetitions();
    });
  });
  elements.clearDatesButton.addEventListener("click", () => {
    state.datePicker?.clear();
    elements.dateFromInput.value = "";
    elements.dateToInput.value = "";
    updateFilterSummary();
    loadCompetitions();
  });
}

async function loadCompetitions() {
  setLoading(true);
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
  } finally {
    setLoading(false);
  }
}

function renderCurrentCompetitions() {
  const competitions = sortCompetitions(applyLocalFilters(state.competitions, new FormData(elements.filters)));
  renderCompetitions(competitions);
  renderMarkers(competitions);
  updateLoadedStatus(state.totalCount, competitions);
  fitMarkers();
}

function setFiltersOpen(open) {
  state.filtersOpen = open;
  elements.panel.classList.toggle("is-filters-open", open);
  elements.filterToggle.setAttribute("aria-expanded", String(open));
}

function setEventsOpen(open) {
  state.eventsOpen = open;
  elements.panel.classList.toggle("is-events-open", open);
  elements.eventsToggle.setAttribute("aria-expanded", String(open));
  requestAnimationFrame(() => state.map.invalidateSize());
}

function updateFilterSummary() {
  const summary = [];
  const search = document.querySelector("#searchInput")?.value.trim();
  const country = document.querySelector("#countryInput")?.value;
  const type = document.querySelector("#typeInput")?.value;
  const limit = document.querySelector("#limitInput")?.value;
  const dateRange = getVisibleDateRange();

  if (dateRange) summary.push(dateRange);
  if (country) summary.push(country);
  if (type) summary.push(typeLabel(type));
  if (search) summary.push(`"${search}"`);
  if (limit) summary.push(`Limit ${limit}`);

  elements.filterSummary.replaceChildren(
    ...summary.map((text) => {
      const chip = document.createElement("span");
      chip.className = "summary-chip";
      chip.textContent = text;
      return chip;
    })
  );
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
  return fetchCompetitionPages(liveUrl, Number(params.get("page_size") || 100));
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
  return new URL(nextUrl, firstUrl).href;
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
    if (field === "added") {
      return compareAdded(a, b, direction);
    }
    if (field === "near") {
      return compareDistance(a, b, direction) || compareDates(a, b);
    }

    return direction === "desc" ? compareDates(b, a) : compareDates(a, b);
  });

  return sorted;
}

async function cycleSort(field) {
  const nextSort = nextSortForField(field);

  if (nextSort.field === "near" && nextSort.direction && !state.userLocation) {
    setLoading(true);
    setStatus("Waiting for location permission...");
    try {
      state.userLocation = await getUserLocation();
    } catch (error) {
      setStatus(error.message);
      setLoading(false);
      return false;
    }
    setLoading(false);
  }

  state.sort = nextSort;
  updateSortButtons();
  return true;
}

function nextSortForField(field) {
  const defaultDirection = defaultSortDirection(field);
  const alternateDirection = defaultDirection === "asc" ? "desc" : "asc";

  if (state.sort.field !== field) {
    return {
      field,
      direction: defaultDirection
    };
  } else if (state.sort.direction === defaultDirection) {
    return { field, direction: alternateDirection };
  } else if (state.sort.direction === alternateDirection) {
    return { field: null, direction: null };
  }

  return {
    field,
    direction: defaultDirection
  };
}

function defaultSortDirection(field) {
  return field === "added" ? "desc" : "asc";
}

function updateSortButtons() {
  elements.sortButtons.forEach((button) => {
    const isActive = button.dataset.sortField === state.sort.field;
    const direction = isActive ? state.sort.direction : null;
    const label = sortLabel(button.dataset.sortField);
    const description =
      direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "off";

    button.dataset.direction = direction || "off";
    button.classList.toggle("is-active", Boolean(direction));
    button.setAttribute("aria-pressed", String(Boolean(direction)));
    button.setAttribute("title", `${label} sort ${description}`);
  });
  const hint = sortHintText();
  elements.sortHint.textContent = hint;
  elements.sortRow.classList.toggle("has-sort-hint", Boolean(hint));
}

function sortLabel(field) {
  return {
    added: "Added",
    date: "Date",
    near: "Near me"
  }[field] || field;
}

function sortHintText() {
  const { field, direction } = state.sort;
  if (!field || !direction) return "";

  if (field === "near") {
    return direction === "desc" ? "closest last" : "closest first";
  }
  if (field === "added") {
    return direction === "asc" ? "newest last" : "newest first";
  }
  if (field === "date") {
    return direction === "desc" ? "soonest last" : "soonest first";
  }

  return "";
}

function compareDates(a, b) {
  const aTime = parseFilterDate(a.date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bTime = parseFilterDate(b.date)?.getTime() ?? Number.POSITIVE_INFINITY;
  return aTime - bTime || String(a.name).localeCompare(String(b.name));
}

function compareAdded(a, b, direction) {
  const aTime = parseDateTime(a.created)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bTime = parseDateTime(b.created)?.getTime() ?? Number.POSITIVE_INFINITY;
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);

  if (aHasTime && !bHasTime) return -1;
  if (!aHasTime && bHasTime) return 1;
  if (!aHasTime && !bHasTime) return compareDates(a, b);

  const timeOrder = direction === "desc" ? bTime - aTime : aTime - bTime;
  return timeOrder || compareDates(a, b);
}

function compareDistance(a, b, direction) {
  const aDistance = distanceFromUser(a);
  const bDistance = distanceFromUser(b);
  const aHasDistance = Number.isFinite(aDistance);
  const bHasDistance = Number.isFinite(bDistance);

  if (aHasDistance && !bHasDistance) return -1;
  if (!aHasDistance && bHasDistance) return 1;
  if (!aHasDistance && !bHasDistance) return 0;

  return direction === "desc" ? bDistance - aDistance : aDistance - bDistance;
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
    const link = safeExternalUrl(competition.home_page_url || competition.url);

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => focusCompetition(competition));

    const action = document.createElement("span");
    action.className = "competition-actions";
    if (link) {
      const openLink = document.createElement("a");
      openLink.href = link;
      openLink.target = "_blank";
      openLink.rel = "noreferrer noopener";
      openLink.className = "competition-link";
      openLink.setAttribute("aria-label", `Open ${competition.name}`);

      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "external-link");
      icon.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "sr-only";
      label.textContent = "Open";

      openLink.append(icon, label);
      action.append(openLink);
    }

    const name = document.createElement("span");
    name.className = "competition-name";
    name.textContent = competition.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.append(
      pill(competition.displayDate || "Date TBC", { icon: "calendar-days" }),
      pill(competition.locationLabel || "Location TBC", {
        icon: "map-pin",
        missing: !competition.locationLabel
      })
    );
    const competitorLabel = competitorCountPillLabel(competition);
    if (competitorLabel) meta.append(pill(competitorLabel, { icon: "users" }));
    const distanceLabel = competitionDistanceLabel(competition);
    if (distanceLabel) meta.append(pill(distanceLabel, { icon: "navigation" }));

    button.append(name, meta);
    item.append(button, action);
    fragment.append(item);
  });

  elements.list.append(fragment);
  if (window.lucide) window.lucide.createIcons();
}

function renderMarkers(competitions) {
  state.markerLayer.clearLayers();
  state.markers = [];
  state.markerByKey.clear();

  groupCompetitionsByLocation(competitions).forEach((group) => {
    const marker = L.marker([group.lat, group.lng], {
      icon: pinIcon(group.competitions.length),
      title: locationTitle(group)
    }).addTo(state.markerLayer);
    marker.eventCount = group.competitions.length;

    marker.bindPopup(popupHtml(group.competitions), {
      autoPan: false,
      maxWidth: 320
    });
    marker.bindTooltip(escapeHtml(locationTooltip(group)), {
      direction: "top",
      offset: [0, -18]
    });
    marker.on("click", () => setActiveCompetition(group.competitions[0]));
    state.markers.push(marker);
    group.competitions.forEach((competition) => {
      state.markerByKey.set(competition.key, marker);
    });
  });
}

function createMarkerLayer() {
  if (!L.markerClusterGroup) return L.layerGroup();

  return L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 46,
    showCoverageOnHover: false,
    spiderfyDistanceMultiplier: 1.25,
    iconCreateFunction: clusterIcon
  });
}

function clusterIcon(cluster) {
  const count = cluster.getAllChildMarkers().reduce((total, marker) => total + (marker.eventCount || 1), 0);
  const size = count >= 100 ? "large" : count >= 10 ? "medium" : "small";

  return L.divIcon({
    className: "",
    html: `<span class="map-cluster map-cluster-${size}">${count.toLocaleString()}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
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
  openMarkerPopup(marker, target);
}

function openMarkerPopup(marker, target) {
  if (!marker) return;

  if (state.markerLayer.zoomToShowLayer) {
    state.markerLayer.zoomToShowLayer(marker, () => {
      marker.openPopup();
      state.map.panTo(target, { animate: true });
    });
    return;
  }

  marker.openPopup();
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

function popupHtml(competitions) {
  if (competitions.length === 1) return competitionPopupHtml(competitions[0]);

  const [first] = competitions;
  const safeLocation = escapeHtml(first.locationLabel || "Shared location");
  const eventLabel = competitions.length === 1 ? "event" : "events";
  const competitorLabel = totalCompetitorsLabel(competitions);

  return `
    <span class="popup-title">${safeLocation}</span>
    <span class="popup-meta">${escapeHtml(
      [competitions.length.toLocaleString() + " " + eventLabel + " at this location", competitorLabel]
        .filter(Boolean)
        .join(" • ")
    )}</span>
    <span class="popup-event-list">
      ${competitions.map((competition) => popupEventHtml(competition)).join("")}
    </span>
  `;
}

function competitionPopupHtml(competition) {
  const safeMeta = escapeHtml(competitionMeta(competition));

  return `
    <span class="popup-event">
      ${popupCompetitionNameHtml(competition)}
      <span class="popup-meta">${safeMeta}</span>
    </span>
  `;
}

function popupEventHtml(competition) {
  const safeMeta = escapeHtml(competitionMeta(competition, false));

  return `
    <span class="popup-event">
      ${popupCompetitionNameHtml(competition)}
      <span class="popup-meta">${safeMeta}</span>
    </span>
  `;
}

function popupCompetitionNameHtml(competition) {
  const link = safeExternalUrl(competition.home_page_url || competition.url);
  const safeName = escapeHtml(competition.name);
  return link
    ? `<a class="popup-event-name" href="${escapeHtml(link)}" target="_blank" rel="noreferrer noopener">${safeName}</a>`
    : `<span class="popup-event-name">${safeName}</span>`;
}

function competitionMeta(competition, includeLocation = true) {
  return [
    competition.displayDate,
    includeLocation ? competition.locationLabel : "",
    competitorCountMetaLabel(competition),
    competition.type
  ]
    .filter(Boolean)
    .join(" • ");
}

function locationTooltip(group) {
  const location = group.competitions[0]?.locationLabel || "Competition location";
  const eventLabel = group.competitions.length === 1 ? "event" : "events";
  return [
    location,
    `${group.competitions.length.toLocaleString()} ${eventLabel}`,
    totalCompetitorsLabel(group.competitions)
  ]
    .filter(Boolean)
    .join(" • ");
}

function groupCompetitionsByLocation(competitions) {
  const groups = new Map();

  competitions.filter((competition) => competition.hasLocation).forEach((competition) => {
    const key = locationKey(competition);
    const group = groups.get(key) || {
      key,
      lat: competition.lat,
      lng: competition.lng,
      competitions: []
    };

    group.competitions.push(competition);
    groups.set(key, group);
  });

  return [...groups.values()];
}

function locationKey(competition) {
  return `${competition.lat.toFixed(6)},${competition.lng.toFixed(6)}`;
}

function locationTitle(group) {
  const location = group.competitions[0]?.locationLabel || "Competition location";
  const count = group.competitions.length;
  const competitorLabel = totalCompetitorsLabel(group.competitions);
  const eventText = count > 1 ? `${count.toLocaleString()} events` : "1 event";
  return [location, eventText, competitorLabel].filter(Boolean).join(": ");
}

function pinIcon(count) {
  const hasMultiple = count > 1;
  const label = hasMultiple ? `<span class="map-pin-count">${count.toLocaleString()}</span>` : "";

  return L.divIcon({
    className: "",
    html: `<span class="map-pin${hasMultiple ? " has-multiple" : ""}">${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
}

function pill(text, options = {}) {
  const { icon, missing = false } = options;
  const span = document.createElement("span");
  span.className = `pill${missing ? " is-missing" : ""}`;
  if (icon) {
    const iconElement = document.createElement("i");
    iconElement.setAttribute("data-lucide", icon);
    iconElement.setAttribute("aria-hidden", "true");
    span.append(iconElement);
  }
  span.append(document.createTextNode(text));
  return span;
}

function competitorCountPillLabel(competition) {
  const count = Number(competition.num_competitors);
  if (!Number.isFinite(count) || count < 0) return "";
  return count.toLocaleString();
}

function competitorCountMetaLabel(competition) {
  const count = Number(competition.num_competitors);
  if (!Number.isFinite(count) || count < 0) return "";
  const label = count === 1 ? "competitor" : "competitors";
  return `${count.toLocaleString()} ${label}`;
}

function totalCompetitorsLabel(competitions) {
  const total = competitions.reduce((sum, competition) => {
    const count = Number(competition.num_competitors);
    return Number.isFinite(count) && count >= 0 ? sum + count : sum;
  }, 0);

  if (!competitions.some((competition) => {
    const count = Number(competition.num_competitors);
    return Number.isFinite(count) && count >= 0;
  })) return "";
  const label = total === 1 ? "competitor" : "competitors";
  return `${total.toLocaleString()} ${label}`;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setLoading(loading) {
  elements.status.classList.toggle("is-loading", loading);
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
  updateFilterSummary();
}

function parseFilterDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getUserLocation() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Location is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => reject(new Error("Location permission was not granted.")),
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 10000
      }
    );
  });
}

function distanceFromUser(competition) {
  if (!state.userLocation || !competition.hasLocation) return Number.POSITIVE_INFINITY;
  return distanceKm(state.userLocation.lat, state.userLocation.lng, competition.lat, competition.lng);
}

function distanceKm(fromLat, fromLng, toLat, toLng) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function competitionDistanceLabel(competition) {
  if (state.sort.field !== "near" || !state.userLocation || !competition.hasLocation) return "";
  const distance = distanceFromUser(competition);
  if (!Number.isFinite(distance)) return "";
  return distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance).toLocaleString()} km`;
}

function setDateInputs(from, to, picker) {
  elements.dateFromInput.value = from ? picker.formatDate(from, "Y-m-d") : "";
  elements.dateToInput.value = to ? picker.formatDate(to, "Y-m-d") : "";
  updateFilterSummary();
}

function getVisibleDateRange() {
  const visibleInput = document.querySelector(".date-field input:not(#dateRangeInput)");
  return visibleInput?.value || elements.dateRangeInput.value;
}

function typeLabel(type) {
  const option = document.querySelector(`#typeInput option[value="${CSS.escape(type)}"]`);
  return option?.textContent || type;
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

function safeExternalUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
