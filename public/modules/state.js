export const DEFAULT_CENTER = [54.7, -2.4];
export const DEFAULT_ZOOM = 5;

export const state = {
  competitions: [],
  eventsOpen: true,
  filtersOpen: false,
  markers: [],
  markerByKey: new Map(),
  markerLayer: null,
  map: null,
  activeUrl: null,
  datePicker: null,
  loadController: null,
  loadRequestId: 0,
  isLoadingMore: false,
  totalCount: null,
  userLocation: null,
  sort: {
    field: "date",
    direction: "asc"
  }
};
