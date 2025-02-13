let isRequesting = false; // Loader state
let map; // Variable pour la carte
let routeLayer; // Variable pour la couche de l'itinéraire
let markers = []; // Tableau pour conserver les marqueurs
let currentVehicleIndex = 0; // Index actuel du véhicule affiché
let vehicles = [];

// Initialisation de la carte
map = L.map("map").setView([48.8566, 2.3522], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// Créer un loader persistant
const loader = document.createElement("div");
loader.className = "loader";
loader.innerHTML = "Chargement...";
document.body.appendChild(loader);

document.addEventListener("DOMContentLoaded", async () => {
  await loadVehicles(); // Charger les véhicules au chargement
});

async function loadVehicles() {
  showLoader();

  try {
    const response = await fetch("/api/vehicule");
    const data = await response.json();
    console.log(data);
    const vehicles = data.vehicleList;
    if (vehicles.length) populateVehicleCarousel(vehicles);
  } catch (error) {
    console.error("Erreur lors du chargement des véhicules:", error);
    showNotification("Erreur lors du chargement des véhicules.", "error");
  } finally {
    hideLoader();
  }
}

function populateVehicleCarousel(vehicleList) {
  vehicles = vehicleList; // Sauvegarder les véhicules pour la navigation
  updateCarousel();
}

function updateCarousel() {
  const vehicleCarousel = document.getElementById("vehicle-carousel");
  vehicleCarousel.innerHTML = ""; // Réinitialiser le carrousel

  if (vehicles.length) {
    const vehicle = vehicles[currentVehicleIndex];
    const card = document.createElement("div");
    card.className = "vehicle-card";
    card.dataset.range = vehicle.range.chargetrip_range.worst;
    card.innerHTML = `
      <img src="${vehicle.media.image.thumbnail_url}" alt="${vehicle.naming.make} ${vehicle.naming.model}">
      <h4>${vehicle.naming.make} ${vehicle.naming.model}</h4>
      <p>Recharge : ${vehicle.connectors[0].time} min</p>
      <p>Autonomie : ${vehicle.range.chargetrip_range.worst} km</p>
    `;
    vehicleCarousel.appendChild(card);
  }
}

// Navigation entre les véhicules
document.getElementById("nextVehicle").addEventListener("click", () => {
  if (vehicles.length) {
    currentVehicleIndex = (currentVehicleIndex + 1) % vehicles.length;
    updateCarousel();
  }
});

document.getElementById("prevVehicle").addEventListener("click", () => {
  if (vehicles.length) {
    currentVehicleIndex =
      (currentVehicleIndex - 1 + vehicles.length) % vehicles.length;
    updateCarousel();
  }
});

async function searchRoute() {
  if (isRequesting) return; // Empêche les requêtes simultanées
  isRequesting = true;
  showLoader();

  const startQuery = document.getElementById("start");
  const endQuery = document.getElementById("end");

  [startQuery, endQuery].forEach((input) => input.classList.remove("error"));

  if (!startQuery.value || !endQuery.value) {
    [startQuery, endQuery].forEach((input) => {
      if (!input.value) input.classList.add("error");
    });
    showNotification("Veuillez remplir tous les champs.", "error");
    hideLoader();
    isRequesting = false;
    return;
  }

  try {
    const [startCoords, endCoords] = await Promise.all([
      fetch(`/api/osm/search?q=${encodeURIComponent(startQuery.value)}`).then(
        (res) => res.json()
      ),
      fetch(`/api/osm/search?q=${encodeURIComponent(endQuery.value)}`).then(
        (res) => res.json()
      ),
    ]);

    if (!startCoords.length || !endCoords.length) {
      showNotification(
        "Points de départ ou destination introuvables.",
        "error"
      );
      hideLoader();
      isRequesting = false;
      return;
    }

    const start = {
      lat: parseFloat(startCoords[0].lat),
      lon: parseFloat(startCoords[0].lon),
    };
    const end = {
      lat: parseFloat(endCoords[0].lat),
      lon: parseFloat(endCoords[0].lon),
    };
    const selectedVehicleRange =
      vehicles[currentVehicleIndex].range.chargetrip_range.worst;
    console.log(
      `/api/osm/routeWithCharging?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}&carRange=${selectedVehicleRange}`
    );
    try {
      const routeResponse = await fetch(
        `/api/osm/routeWithCharging?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}&carRange=${selectedVehicleRange}`
      );

      if (!routeResponse.ok) throw new Error("Aucune borne trouvée.");

      const routeData = await routeResponse.json();
      await updateMap(
        routeData.geometry,
        "green",
        routeData.waypoints,
        routeData
      );
    } catch (error) {
      // Requête itinéraire sans bornes
      const routeFallbackResponse = await fetch(
        `/api/osm/route?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}`
      );
      const fallbackData = await routeFallbackResponse.json();
      await updateMap(fallbackData.geometry, "red", [], fallbackData);
      showNotification(
        "Aucune borne trouvée sur le trajet. Affichage du trajet sans bornes.",
        "warning"
      );
    }
  } catch (error) {
    console.log(error);
    showNotification("Erreur lors de la recherche du trajet.", "error");
  } finally {
    hideLoader();
    isRequesting = false;
  }
}

document
  .getElementById("routeWithChargingIcon")
  .addEventListener("click", searchRoute);

// Ajout des écouteurs d'événements pour la touche Entrée
document.getElementById("start").addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    searchRoute();
  }
});

document.getElementById("end").addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    searchRoute();
  }
});

function showLoader() {
  loader.classList.add("show");
}

function hideLoader() {
  loader.classList.remove("show");
}

document.getElementById("swapIcon").addEventListener("click", () => {
  const startInput = document.getElementById("start");
  const endInput = document.getElementById("end");
  [startInput.value, endInput.value] = [endInput.value, startInput.value];
});

async function updateMap(geometry, color, waypoints = [], routeData) {
  if (routeLayer) map.removeLayer(routeLayer);
  markers.forEach((marker) => map.removeLayer(marker));
  markers = [];

  routeLayer = L.geoJSON(geometry, {
    style: { color, weight: 4 },
  }).addTo(map);

  if (waypoints.length) {
    waypoints.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lon]).addTo(map);
      markers.push(marker);
      marker.bindPopup(
        index === 0
          ? "Départ"
          : index === waypoints.length - 1
          ? "Arrivée"
          : `Borne ${index}`
      );
    });
  }

  // Afficher la distance totale
  const totalDistance = routeData.distance / 1000; // Conversion de m à km
  document.getElementById("total-distance").textContent =
    totalDistance.toFixed(2);

  // Préparer les données des bornes pour la requête de prix
  const bornesPuissance = routeData.bornes
    ? routeData.bornes.map((borne) => borne.fields.puiss_max)
    : [];

  // Requête pour obtenir le prix
  try {
    const priceResponse = await fetch("/api/price", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bornes: bornesPuissance,
        car: {
          rechargeTime: vehicles[currentVehicleIndex].connectors[0].time,
          autonomie: vehicles[currentVehicleIndex].range.chargetrip_range.worst,
        },
      }),
    });
    const priceData = await priceResponse.json();
    const totalPrice = priceData.price.PriceResult.float[0];
    document.getElementById("total-price").textContent = totalPrice.toFixed(2);
  } catch (error) {
    console.error("Erreur lors de la récupération du prix:", error);
    document.getElementById("total-price").textContent = "N/A";
  }

  // Requête pour obtenir le temps
  try {
    const timeResponse = await fetch("/api/time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bornes: bornesPuissance,
        car: {
          rechargeTime: vehicles[currentVehicleIndex].connectors[0].time,
          autonomie: vehicles[currentVehicleIndex].range.chargetrip_range.worst,
        },
        distanceTime: routeData.time / 60, // Conversion de secondes à minutes
      }),
    });
    const timeData = await timeResponse.json();
    const totalTimeInMinutes = timeData.time.TimeResult.float[0];
    const hours = Math.floor(totalTimeInMinutes / 60);
    const minutes = Math.round(totalTimeInMinutes % 60);
    document.getElementById(
      "total-time"
    ).textContent = `${hours}h ${minutes}min`;
  } catch (error) {
    console.error("Erreur lors de la récupération du temps:", error);
    document.getElementById("total-time").textContent = "N/A";
  }
}

function showNotification(message, type = "info") {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.style.display = "block";

  // Ajuster la couleur en fonction du type de notification
  if (type === "error") {
    notification.style.backgroundColor = "#ffcccb";
    notification.style.color = "#721c24";
  } else if (type === "warning") {
    notification.style.backgroundColor = "#fff3cd";
    notification.style.color = "#856404";
  } else {
    notification.style.backgroundColor = "#d4edda";
    notification.style.color = "#155724";
  }

  setTimeout(() => {
    notification.style.display = "none";
  }, 5000);
}
