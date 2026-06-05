import { state } from "./state.js";

export function getUserLocation() {
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

export function distanceFromUser(competition) {
  if (!state.userLocation || !competition.hasLocation) return Number.POSITIVE_INFINITY;
  return distanceKm(state.userLocation.lat, state.userLocation.lng, competition.lat, competition.lng);
}

export function competitionDistanceLabel(competition) {
  if (state.sort.field !== "near" || !state.userLocation || !competition.hasLocation) return "";
  const distance = distanceFromUser(competition);
  if (!Number.isFinite(distance)) return "";
  return distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance).toLocaleString()} km`;
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
