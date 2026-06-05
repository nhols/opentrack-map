import { parseDateTime, parseFilterDate } from "./competitions.js";
import { distanceFromUser } from "./geo.js";
import { state } from "./state.js";

const SORTS = {
  added: {
    label: "Added",
    defaultDirection: "desc",
    hint: {
      asc: "newest last",
      desc: "newest first"
    }
  },
  date: {
    label: "Date",
    defaultDirection: "asc",
    hint: {
      asc: "soonest first",
      desc: "soonest last"
    }
  },
  near: {
    label: "Near me",
    defaultDirection: "asc",
    hint: {
      asc: "closest first",
      desc: "closest last"
    }
  }
};

export function sortCompetitions(competitions) {
  const sorted = [...competitions];
  const { field, direction } = state.sort;

  if (!field || !direction) return sorted;

  sorted.sort((a, b) => {
    if (field === "added") return compareAdded(a, b, direction);
    if (field === "near") return compareDistance(a, b, direction) || compareDates(a, b);
    return direction === "desc" ? compareDates(b, a) : compareDates(a, b);
  });

  return sorted;
}

export function nextSortForField(field) {
  const defaultDirection = defaultSortDirection(field);
  const alternateDirection = defaultDirection === "asc" ? "desc" : "asc";

  if (state.sort.field !== field) {
    return { field, direction: defaultDirection };
  }
  if (state.sort.direction === defaultDirection) {
    return { field, direction: alternateDirection };
  }
  if (state.sort.direction === alternateDirection) {
    return { field: null, direction: null };
  }

  return { field, direction: defaultDirection };
}

export function sortLabel(field) {
  return SORTS[field]?.label || field;
}

export function sortHintText() {
  const { field, direction } = state.sort;
  return SORTS[field]?.hint[direction] || "";
}

function defaultSortDirection(field) {
  return SORTS[field]?.defaultDirection || "asc";
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
