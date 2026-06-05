export function normalizeCompetitions(results) {
  return results.map((item) => {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    const country = extractCode(item.country);
    const name = item.full_name || item.short_name || item.slug || "Untitled competition";

    return {
      ...item,
      key: competitionKey(item),
      name,
      countryCode: country,
      lat,
      lng,
      hasLocation: isMappableCoordinate(lat, lng),
      displayDate: formatDateRange(item.date, item.finish_date),
      locationLabel: [item.city, country].filter(Boolean).join(", ")
    };
  });
}

export function applyLocalFilters(competitions, formData) {
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

export function groupCompetitionsByLocation(competitions) {
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

export function locationTitle(group) {
  const location = group.competitions[0]?.locationLabel || "Competition location";
  const count = group.competitions.length;
  const competitorLabel = totalCompetitorsLabel(group.competitions);
  const eventText = count > 1 ? `${count.toLocaleString()} events` : "1 event";
  return [location, eventText, competitorLabel].filter(Boolean).join(": ");
}

export function locationTooltip(group) {
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

export function competitionMeta(competition, includeLocation = true) {
  return [
    competition.displayDate,
    includeLocation ? competition.locationLabel : "",
    competitorCountMetaLabel(competition),
    competition.type
  ]
    .filter(Boolean)
    .join(" • ");
}

export function competitorCountPillLabel(competition) {
  const count = competitorCount(competition);
  return Number.isFinite(count) ? count.toLocaleString() : "";
}

export function totalCompetitorsLabel(competitions) {
  const counts = competitions.map(competitorCount).filter(Number.isFinite);
  if (!counts.length) return "";

  const total = counts.reduce((sum, count) => sum + count, 0);
  const label = total === 1 ? "competitor" : "competitors";
  return `${total.toLocaleString()} ${label}`;
}

export function formatDateRange(start, finish) {
  if (!start) return "";
  if (!finish || start === finish) return formatDate(start);
  return `${formatDate(start)} to ${formatDate(finish)}`;
}

export function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function parseFilterDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function addMonths(date, months) {
  const next = new Date(date);
  const targetMonth = next.getMonth() + months;
  next.setMonth(targetMonth);

  if (next.getMonth() !== targetMonth % 12) {
    next.setDate(0);
  }

  return next;
}

export function typeLabel(typeInput, type) {
  const option = typeInput.querySelector(`option[value="${CSS.escape(type)}"]`);
  return option?.textContent || type;
}

function competitorCount(competition) {
  const count = Number(competition.num_competitors);
  return Number.isFinite(count) && count >= 0 ? count : NaN;
}

function competitorCountMetaLabel(competition) {
  const count = competitorCount(competition);
  if (!Number.isFinite(count)) return "";
  const label = count === 1 ? "competitor" : "competitors";
  return `${count.toLocaleString()} ${label}`;
}

function locationKey(competition) {
  return `${competition.lat.toFixed(6)},${competition.lng.toFixed(6)}`;
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
