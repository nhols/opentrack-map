const API_ROOT = "https://data.opentrack.run/api/competitions/";
const LOCAL_PROXY = "/api/opentrack";

const state = {
  competitions: [],
  markers: [],
  markerLayer: null,
  map: null,
  activeUrl: null
};

const elements = {
  filters: document.querySelector("#filters"),
  refreshButton: document.querySelector("#refreshButton"),
  fitButton: document.querySelector("#fitButton"),
  list: document.querySelector("#competitionList"),
  status: document.querySelector("#status")
};

window.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  initMap();
  bindEvents();
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
}

async function loadCompetitions() {
  setStatus("Loading competitions...");
  elements.list.innerHTML = "";
  state.markerLayer.clearLayers();
  state.markers = [];

  const params = buildParams(new FormData(elements.filters));

  try {
    const data = await fetchCompetitions(params);
    const competitions = normalizeCompetitions(data.results || []);
    state.competitions = competitions;
    renderCompetitions(competitions);
    renderMarkers(competitions);
    updateLoadedStatus(data.count, competitions);
    fitMarkers();
  } catch (error) {
    setStatus(error.message);
    renderEmptyState();
  }
}

function buildParams(formData) {
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    const clean = String(value).trim();
    if (clean) params.set(key, clean);
  }

  if (!params.has("page_size")) params.set("page_size", "100");
  params.set("ordering", "date");
  return params;
}

async function fetchCompetitions(params) {
  const liveUrl = `${API_ROOT}?${params}`;
  const proxyUrl = `${LOCAL_PROXY}?${params}`;
  const errors = [];

  for (const url of [liveUrl, proxyUrl]) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const type = response.headers.get("content-type") || "";

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      if (!type.includes("application/json")) {
        throw new Error("OpenTrack returned a browser challenge instead of JSON");
      }

      return response.json();
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`Could not load OpenTrack data: ${errors.at(-1) || "unknown error"}`);
}

function normalizeCompetitions(results) {
  return results.map((item) => {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    const country = extractCode(item.country);
    const name = item.full_name || item.short_name || item.slug || "Untitled competition";

    return {
      ...item,
      name,
      countryCode: country,
      lat,
      lng,
      hasLocation: Number.isFinite(lat) && Number.isFinite(lng),
      displayDate: formatDateRange(item.date, item.finish_date),
      locationLabel: [item.city, country].filter(Boolean).join(", ")
    };
  });
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
  competitions.filter((competition) => competition.hasLocation).forEach((competition) => {
    const marker = L.circleMarker([competition.lat, competition.lng], {
      radius: 7,
      color: "#135846",
      weight: 2,
      fillColor: "#1d7561",
      fillOpacity: 0.82
    }).addTo(state.markerLayer);
    marker.bindPopup(popupHtml(competition));
    marker.on("click", () => setActiveCompetition(competition));
    state.markers.push(marker);
  });
}

function focusCompetition(competition) {
  setActiveCompetition(competition);

  if (!competition.hasLocation) return;

  state.map.setView([competition.lat, competition.lng], Math.max(state.map.getZoom(), 10), {
    animate: true
  });

  const marker = state.markers.find((candidate) => {
    const position = candidate.getLatLng();
    return position.lat === competition.lat && position.lng === competition.lng;
  });
  marker?.openPopup();
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

function updateLoadedStatus(totalCount, competitions) {
  const mapped = competitions.filter((competition) => competition.hasLocation).length;
  const total = Number.isFinite(totalCount) ? totalCount.toLocaleString() : "many";
  setStatus(`${competitions.length} loaded, ${mapped} mapped, ${total} available`);
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
