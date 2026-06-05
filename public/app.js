import { fetchCompetitions } from "./modules/api.js";
import { elements } from "./modules/elements.js";
import { getUserLocation } from "./modules/geo.js";
import {
  addMonths,
  applyLocalFilters,
  normalizeCompetitions,
  startOfToday,
  typeLabel
} from "./modules/competitions.js";
import { fitMarkers, focusCompetition, initMap, renderMarkers } from "./modules/map.js";
import {
  renderCompetitions,
  renderEmptyState,
  setLoading,
  setStatus,
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

  elements.filters.addEventListener("change", updateFilterSummary);
  elements.filters.addEventListener("input", updateFilterSummary);

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
      if (shouldRender) renderCurrentCompetitions();
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
  const formData = new FormData(elements.filters);
  const competitions = sortCompetitions(applyLocalFilters(state.competitions, formData));
  renderCompetitions(competitions, { onFocus: focusCompetition });
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
}

function setEventsOpen(open) {
  state.eventsOpen = open;
  elements.panel.classList.toggle("is-events-open", open);
  elements.eventsToggle.setAttribute("aria-expanded", String(open));
  requestAnimationFrame(() => state.map.invalidateSize());
}

function updateFilterSummary() {
  const summary = [];
  const search = elements.searchInput.value.trim();
  const country = elements.countryInput.value;
  const type = elements.typeInput.value;
  const limit = elements.limitInput.value;
  const dateRange = getVisibleDateRange();

  if (dateRange) summary.push(dateRange);
  if (country) summary.push(country);
  if (type) summary.push(typeLabel(elements.typeInput, type));
  if (search) summary.push(`"${search}"`);
  if (limit) summary.push(`Limit ${limit}`);

  elements.filterSummary.replaceChildren(...summary.map(summaryChip));
}

function summaryChip(text) {
  const chip = document.createElement("span");
  chip.className = "summary-chip";
  chip.textContent = text;
  return chip;
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

function setDateInputs(from, to, picker) {
  elements.dateFromInput.value = from ? picker.formatDate(from, "Y-m-d") : "";
  elements.dateToInput.value = to ? picker.formatDate(to, "Y-m-d") : "";
  updateFilterSummary();
}

function getVisibleDateRange() {
  const visibleInput = document.querySelector(".date-field input:not(#dateRangeInput)");
  return visibleInput?.value || elements.dateRangeInput.value;
}
