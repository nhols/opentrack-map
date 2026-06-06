import {
  competitionMeta,
  competitorCountPillLabel,
  createdAgoPillLabel,
  totalCompetitorsLabel
} from "./competitions.js";
import { elements } from "./elements.js";
import { competitionDistanceLabel } from "./geo.js";
import { escapeHtml, safeExternalUrl } from "./utils.js";

export function renderCompetitions(competitions, { onFocus }) {
  elements.list.innerHTML = "";

  if (!competitions.length) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  competitions.forEach((competition) => {
    fragment.append(competitionItem(competition, onFocus));
  });

  elements.list.append(fragment);
  if (window.lucide) window.lucide.createIcons();
}

export function updateLoadedStatus(totalCount, visibleCompetitions) {
  const mapped = visibleCompetitions.filter((competition) => competition.hasLocation).length;
  const shown = visibleCompetitions.length;

  if (Number.isFinite(totalCount) && totalCount > shown) {
    setStatus(`Showing ${shown.toLocaleString()} of ${totalCount.toLocaleString()} matches; ${mapped.toLocaleString()} mapped.`);
    return;
  }

  setStatus(`Showing ${shown.toLocaleString()} matches; ${mapped.toLocaleString()} mapped.`);
}

export function renderEmptyState() {
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

export function popupHtml(competitions) {
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

export function setStatus(message) {
  elements.status.textContent = message;
}

export function setLoading(loading) {
  elements.status.classList.toggle("is-loading", loading);
}

function competitionItem(competition, onFocus) {
  const item = document.createElement("li");
  item.className = "competition-item";
  item.dataset.url = competition.url || competition.home_page_url || "";

  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => onFocus(competition));
  button.append(competitionName(competition), competitionMetaPills(competition));

  item.append(button, competitionActions(competition));
  return item;
}

function competitionName(competition) {
  const name = document.createElement("span");
  name.className = "competition-name";
  name.textContent = competition.name;
  return name;
}

function competitionMetaPills(competition) {
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.append(
    pill(competition.displayDate || "Date TBC", { icon: "calendar-days" }),
    pill(competition.locationLabel || "Location TBC", {
      icon: "map-pin",
      missing: !competition.locationLabel
    })
  );
  if (!competition.hasLocation) meta.append(pill("Unmapped", { icon: "map-pin-off", missing: true }));

  const competitorLabel = competitorCountPillLabel(competition);
  if (competitorLabel) meta.append(pill(competitorLabel, { icon: "users" }));

  const createdLabel = createdAgoPillLabel(competition);
  if (createdLabel) meta.append(pill(createdLabel, { icon: "clock" }));

  const distanceLabel = competitionDistanceLabel(competition);
  if (distanceLabel) meta.append(pill(distanceLabel, { icon: "navigation" }));

  return meta;
}

function competitionActions(competition) {
  const action = document.createElement("span");
  action.className = "competition-actions";

  const link = safeExternalUrl(competition.home_page_url || competition.url);
  if (!link) return action;

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
  return action;
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
