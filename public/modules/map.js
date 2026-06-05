import {
  groupCompetitionsByLocation,
  locationTitle,
  locationTooltip
} from "./competitions.js";
import { elements } from "./elements.js";
import { popupHtml } from "./render.js";
import { DEFAULT_CENTER, DEFAULT_ZOOM, state } from "./state.js";
import { escapeHtml } from "./utils.js";

export function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    worldCopyJump: true
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);

  state.markerLayer = createMarkerLayer().addTo(state.map);
}

export function renderMarkers(competitions) {
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

export function focusCompetition(competition) {
  setActiveCompetition(competition);

  if (!competition.hasLocation) return;

  const target = [competition.lat, competition.lng];
  state.map.setView(target, Math.max(state.map.getZoom(), 10), {
    animate: true
  });

  const marker = state.markerByKey.get(competition.key);
  openMarkerPopup(marker, target);
}

export function fitMarkers() {
  if (!state.markers.length) {
    state.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  const group = L.featureGroup(state.markers);
  state.map.fitBounds(group.getBounds().pad(0.18), {
    animate: true,
    maxZoom: 12
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
  elements.list.querySelectorAll(".competition-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.url === state.activeUrl);
  });
}
