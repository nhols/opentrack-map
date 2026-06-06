import { fetchCompetitionsIncrementally } from "./modules/api.js";
import { elements } from "./modules/elements.js";
import { getUserLocation } from "./modules/geo.js";
import {
  addMonths,
  applyLocalFilters,
  normalizeCompetitions,
  startOfToday
} from "./modules/competitions.js";
import { fitMarkers, focusCompetition, initMap, refreshMapLayout, renderMarkers } from "./modules/map.js";
import {
  renderCompetitions,
  renderEmptyState,
  completeProgress,
  setLoading,
  setProgressVisible,
  setStatus,
  updateLoadProgress,
  updateLoadedStatus
} from "./modules/render.js";
import { state } from "./modules/state.js";
import { nextSortForField, sortCompetitions, sortHintText, sortLabel } from "./modules/sorting.js";

window.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  initMap();
  initDatePicker();
  bindEvents();
  setEventsOpen(!window.matchMedia("(max-width: 760px)").matches);
  updateSortButtons();
  loadCompetitions();
});

function bindEvents() {
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadCompetitions();
    setFiltersOpen(false);
  });

  elements.filterToggle.addEventListener("click", () => {
    const nextOpen = !state.filtersOpen;
    setFiltersOpen(nextOpen);
    if (nextOpen && isMobilePanel()) setEventsOpen(false);
  });
  elements.eventsToggle.addEventListener("click", () => {
    const nextOpen = !state.eventsOpen;
    setEventsOpen(nextOpen);
    if (nextOpen && isMobilePanel()) setFiltersOpen(false);
  });
  elements.refreshButton.addEventListener("click", () => loadCompetitions());
  elements.fitButton.addEventListener("click", () => fitMarkers());
  elements.sortButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const shouldRender = await cycleSort(button.dataset.sortField);
      if (shouldRender) renderCurrentCompetitions();
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
  state.loadController?.abort();

  const requestId = state.loadRequestId + 1;
  state.loadRequestId = requestId;

  const controller = new AbortController();
  state.loadController = controller;
  state.isLoadingMore = true;

  setLoading(true);
  setStatus("Loading competitions...");
  setProgressVisible(false);

  const formData = new FormData(elements.filters);
  const params = buildParams(formData);
  let hasRenderedFirstPage = false;

  try {
    await fetchCompetitionsIncrementally(params, {
      signal: controller.signal,
      onPage: ({ results, count, pageIndex }) => {
        if (requestId !== state.loadRequestId) return;

        const normalized = normalizeCompetitions(results);

        if (pageIndex === 0) {
          state.competitions = mergeUniqueCompetitions([], normalized);
          state.totalCount = count;
          hasRenderedFirstPage = true;
          setProgressVisible(true);
          renderCurrentCompetitions({ fit: true });
        } else {
          state.competitions = mergeUniqueCompetitions(state.competitions, normalized);
          renderCurrentCompetitions();
        }

        updateLoadProgress(state.competitions.length, state.totalCount);
      }
    });

    if (requestId !== state.loadRequestId) return;

    state.totalCount = state.competitions.length;
    renderCurrentCompetitions();
    completeProgress();
  } catch (error) {
    if (error.name === "AbortError") return;

    if (hasRenderedFirstPage && state.competitions.length) {
      const total = Number.isFinite(state.totalCount) ? state.totalCount : state.competitions.length;
      setStatus(
        `Loaded ${state.competitions.length.toLocaleString()} of ${total.toLocaleString()} competitions. OpenTrack failed while loading more results.`
      );
    } else {
      setStatus(error.message);
      if (!state.competitions.length) renderEmptyState();
    }
  } finally {
    if (requestId === state.loadRequestId) {
      setLoading(false);
      state.isLoadingMore = false;
      state.loadController = null;
    }
  }
}

function renderCurrentCompetitions({ fit = false } = {}) {
  const formData = new FormData(elements.filters);
  const competitions = sortCompetitions(applyLocalFilters(state.competitions, formData));
  renderCompetitions(competitions, { onFocus: focusCompetition });
  renderMarkers(competitions);
  updateLoadedStatus(state.totalCount, competitions);
  if (fit) fitMarkers();
}

function mergeUniqueCompetitions(current, next) {
  const merged = [...current];
  const seen = new Set(current.map((competition) => competition.key).filter(Boolean));

  next.forEach((competition) => {
    if (!competition.key || !seen.has(competition.key)) {
      merged.push(competition);
      if (competition.key) seen.add(competition.key);
    }
  });

  return merged;
}

function buildParams(formData) {
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    const clean = String(value).trim();
    if (clean) params.set(key, clean);
  }

  params.delete("page_size");
  params.delete("limit");
  params.delete("offset");
  if (!params.has("when") && !params.has("date_from") && !params.has("date_to")) {
    params.set("when", "future");
  }
  params.set("ordering", state.sort.field === "date" && state.sort.direction === "desc" ? "-date" : "date");
  return params;
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
      setLoading(state.isLoadingMore);
      return false;
    }
    setLoading(state.isLoadingMore);
  }

  state.sort = nextSort;
  updateSortButtons();
  return true;
}

function updateSortButtons() {
  elements.sortButtons.forEach((button) => {
    const isActive = button.dataset.sortField === state.sort.field;
    const direction = isActive ? state.sort.direction : null;
    const description =
      direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "off";

    button.dataset.direction = direction || "off";
    button.classList.toggle("is-active", Boolean(direction));
    button.setAttribute("aria-pressed", String(Boolean(direction)));
    button.setAttribute("title", `${sortLabel(button.dataset.sortField)} sort ${description}`);
  });

  const hint = sortHintText();
  elements.sortHint.textContent = hint;
  elements.sortRow.classList.toggle("has-sort-hint", Boolean(hint));
}

function setFiltersOpen(open) {
  state.filtersOpen = open;
  elements.panel.classList.toggle("is-filters-open", open);
  elements.filterToggle.setAttribute("aria-expanded", String(open));
  refreshMapLayout();
}

function setEventsOpen(open) {
  state.eventsOpen = open;
  elements.panel.classList.toggle("is-events-open", open);
  elements.eventsToggle.setAttribute("aria-expanded", String(open));
  refreshMapLayout();
}

function isMobilePanel() {
  return window.matchMedia("(max-width: 760px)").matches;
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

function setDateInputs(from, to, picker) {
  elements.dateFromInput.value = from ? picker.formatDate(from, "Y-m-d") : "";
  elements.dateToInput.value = to ? picker.formatDate(to, "Y-m-d") : "";
}
