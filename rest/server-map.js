const express = require("express");
const axios = require("axios");
const path = require("path");
const soap = require("soap");
const cors = require("cors");

const app = express().use(cors()).use(express.json());
const PORT = process.env.PORT || 3000;

const urlSoap = "https://itineraire-evan-meziere-soap.azurewebsites.net/?wsdl";

// Servir des fichiers statiques (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));
/**
 * prend en parametre une ville et renvoie les information correspondante
 * [
  {
    "place_id": 75345615,
    "licence": "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright",
    "osm_type": "relation",
    "osm_id": 76469,
    "lat": "43.2961743",
    "lon": "5.3699525",
    "class": "boundary",
    "type": "administrative",
    "place_rank": 16,
    "importance": 0.7310634603535818,
    "addresstype": "city",
    "name": "Marseille",
    "display_name": "Marseille, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur, France métropolitaine, France",
    "address": {
      "city": "Marseille",
      "municipality": "Marseille",
      "county": "Bouches-du-Rhône",
      "ISO3166-2-lvl6": "FR-13",
      "state": "Provence-Alpes-Côte d'Azur",
      "ISO3166-2-lvl4": "FR-PAC",
      "region": "France métropolitaine",
      "country": "France",
      "country_code": "fr"
    },
    "boundingbox": ["43.1696228", "43.3910329", "5.2286312", "5.5324758"]
  }
]
 exemple de requete /api/osm/search?q=marseille
 */
// Route pour chercher des informations depuis OpenStreetMap
app.get("/api/osm/search", async (req, res) => {
  const { q } = req.query; // Requête pour le nom de l'endroit
  if (!q) {
    return res.status(400).json({ error: 'Le paramètre "q" est requis.' });
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q,
          format: "json",
          addressdetails: 1, // Inclure les détails d'adresse
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Erreur lors de la requête à OpenStreetMap:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des données." });
  }
});

/*
prend en parametre de l'url :
start : longitude, latitude
end : longitude, latitude 


ce que renvoie 
{
  "geometry": {
    "coordinates": [
        liste des points du trajet
    ],
    "type": "LineString"
  },
  "legs": [
    {
      "steps": [],
      "summary": "",
      "weight": 32816.7,
      "duration": 29540,
      "distance": 771905.5
    }
  ],
  "weight_name": "routability",
  "weight": 32816.7,
  "duration": temps en seconde,
  "distance": distance en metre
}
exemple de requetes /api/osm/route?start=2.3483915,48.8534951&end=5.3699525,43.2961743
*/
// Route pour obtenir un itinéraire via OSRM
app.get("/api/osm/route", async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res
      .status(400)
      .json({ error: 'Les paramètres "start" et "end" sont requis.' });
  }

  try {
    // Construire l'URL pour l'itinéraire
    const routeUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

    const response = await axios.get(routeUrl);
    res.json(response.data.routes[0]); // Renvoie le premier itinéraire
  } catch (error) {
    console.error("Erreur lors de la requête à OSRM:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération de l'itinéraire." });
  }
});

/*
prend en parametre de l'url :
start : longitude, latitude
end : longitude, latitude
carRange : autonomie de la voiture

renvoie le json correspondant :
{
  "geometry": {
    "coordinates": [
        liste des points du trajets
    ],
    "type": "LineString"
  },
  "waypoints": [
    les points d'arret donc ceux ou on commence et on finit les bornes ou on s'arrete pour recharger la voiture. deja trier dnas l'ordre de rencontre
  ],
  "time": temps du trajet en voiture sans les pause,
  "distance": distance du tajet,
  "bornes": une liste de bornes que vous verrez le template de json sur /api/bornes
}

exemple de requete 
/api/osm/routeWithCharging?start=2.3483915,48.8534951&end=5.3699525,43.2961743&carRange=277
*/
// Route pour calculer l'itinéraire avec arrêts de recharge
app.get("/api/osm/routeWithCharging", async (req, res) => {
  const { start, end, carRange } = req.query;
  const carRangeKm = parseInt(carRange) || 100;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: 'Les paramètres "start" et "end" sont requis.' });
  }

  try {
    const routeUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;
    const routeResponse = await axios.get(routeUrl);
    const routeData = routeResponse.data.routes[0];
    const time = routeData.duration;
    const distance = routeData.distance;

    const waypoints = [];
    waypoints.push(start);

    const totalDistance = routeData.distance;
    let remainingDistance = totalDistance;
    let currentCoords = start.split(",");
    let addedStations = new Set();
    let bornes = [];

    const destinationCoords = end.split(",");

    while (remainingDistance > carRangeKm * 1000) {
      const response = await axios.get(`http://localhost:${PORT}/api/borne`, {
        params: {
          lat: currentCoords[1],
          lon: currentCoords[0],
          range: carRangeKm,
        },
      });

      const chargingStations = response.data;

      if (chargingStations.length === 0) {
        throw new Error("Aucune borne de recharge trouvée à proximité.");
      }

      // Fonction pour filtrer les stations alignées avec la direction
      const isStationAligned = (station) => {
        const stationCoords = [
          parseFloat(station.fields.xlongitude),
          parseFloat(station.fields.ylatitude),
        ];
        const angle = calculateAngle(
          currentCoords.map(Number),
          stationCoords,
          destinationCoords.map(Number)
        );

        // Seuil : rejeter si l'angle est supérieur à 45° (par exemple)
        return angle <= Math.PI / 4;
      };

      // Trier par distance décroissante
      chargingStations.sort(
        (a, b) => parseFloat(b.fields.dist) - parseFloat(a.fields.dist)
      );

      const farthestStation = chargingStations.find(
        (station) =>
          isStationAligned(station) &&
          !addedStations.has(
            `${station.fields.xlongitude},${station.fields.ylatitude}`
          )
      );

      if (!farthestStation) {
        throw new Error(
          "Impossible de trouver une borne de recharge alignée avec le trajet."
        );
      }

      const stationCoords = `${farthestStation.fields.xlongitude},${farthestStation.fields.ylatitude}`;
      waypoints.push(stationCoords);
      addedStations.add(stationCoords);
      bornes.push(farthestStation);
      currentCoords = stationCoords.split(",");

      const distanceToStation = parseFloat(farthestStation.fields.dist);
      remainingDistance -= distanceToStation;
    }

    waypoints.push(end);

    const fullRouteUrl = `http://router.project-osrm.org/route/v1/driving/${waypoints.join(
      ";"
    )}?overview=full&geometries=geojson`;
    const fullRouteResponse = await axios.get(fullRouteUrl);

    res.json({
      geometry: fullRouteResponse.data.routes[0].geometry,
      waypoints: waypoints.map((coord) => {
        const [lon, lat] = coord.split(",");
        return { lat: parseFloat(lat), lon: parseFloat(lon) };
      }),
      time: time,
      distance: distance,
      bornes: bornes,
    });
  } catch (error) {
    console.error(
      "Erreur lors du calcul de l'itinéraire avec recharge:",
      error
    );
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération de l'itinéraire." });
  }
});

// Fonction pour calculer l'angle
function calculateAngle(current, candidate, destination) {
  const toRadians = (deg) => (deg * Math.PI) / 180;

  const [lon1, lat1] = current.map(toRadians);
  const [lon2, lat2] = candidate.map(toRadians);
  const [lon3, lat3] = destination.map(toRadians);

  const vector1 = [lon2 - lon1, lat2 - lat1];
  const vector2 = [lon3 - lon2, lat3 - lat2];

  const dotProduct = vector1[0] * vector2[0] + vector1[1] * vector2[1];
  const magnitude1 = Math.sqrt(vector1[0] ** 2 + vector1[1] ** 2);
  const magnitude2 = Math.sqrt(vector2[0] ** 2 + vector2[1] ** 2);

  const angle = Math.acos(dotProduct / (magnitude1 * magnitude2));
  return angle;
}

app.get("/api/borne", async (req, res) => {
  const { lat, lon, range } = req.query; // Requête pour le nom de l'endroit
  if (!lat || !lon || !range) {
    return res
      .status(400)
      .json({ error: 'Le paramètre "lat" "lon" et "range" sont requis.' });
  }

  try {
    const url = "https://odre.opendatasoft.com/api/records/1.0/search/";
    const response = await axios.get(url, {
      params: {
        dataset: "bornes-irve",
        "geofilter.distance": `${lat},${lon},${range * 1000}`,
        rows: 10000,
      },
    });
    res.json(response.data.records); // Renvoie le premier itinéraire
  } catch (error) {
    console.error("Erreur lors de la requête à opendatasoft", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des bornes." });
  }
});

/*
Ne prend aucun paramètre en renvoie la liste des vehicules
renvoie un json de ce type :
{
  "vehicleList": [
    {
      "id": id de la voiture,
      "naming": {
        "make": nom de la marque,
        "model": modele,
        "chargetrip_version": version
      },
      "range": {
        "chargetrip_range": {
          "worst": autonomie de la voiture
        }
      },
      "connectors": [
        {
          "time": temps de recharge max
        },
        {
          "time": temps de recharge minimum
        }
      ],
      "media": {
        "image": {
          "thumbnail_url": lien de l'image de la voiture
        }
      }
    }
  ]
}

*/

app.get("/api/vehicule", async (req, res) => {
  const query = `
    query {
      vehicleList(
        page: 0, 
        size: 50, 
        search: "" 
      ) {
        id
        naming {
          make
          model
          chargetrip_version
        }
        range {
          chargetrip_range{
            worst
          }
        }
        connectors {
          time
        }
        media {
          image {
            thumbnail_url
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      "https://api.chargetrip.io/graphql",
      { query },
      {
        headers: {
          "x-client-id": "678a8a6d6f014f34da844883",
          "x-app-id": "678a8a6d6f014f34da844885",
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data.data);
  } catch (error) {
    console.error("Erreur GraphQL :", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || "Erreur inconnue" });
  }
});
/*
prend en paramètre le json suivant :
{
	"bornes" : [
		liste des bornes avec la puiss_max
	],
	"car" : {
		"rechargeTime" : temps de recharge de la voiture en minutes,
		"autonomie" :autonomie de la voiture en km
	}
	"distanceTime" : temps du trajet ce temps doit être en minutes
}

renvoie
{
	"price": {
		"PriceResult": {
			"float": [
				temps du trajet totale en minutes
			]
		}
	}
}

*/
// Route pour récupérer le temps total
app.post("/api/time", async (req, res) => {
  try {
    const { bornes, car, distanceTime } = req.body;
    const client = await soap.createClientAsync(urlSoap);

    const args = {
      bornes: { float: bornes },
      car: car,
      distanceTime: distanceTime,
    };

    const [result] = await client.TimeAsync(args);
    res.json({ time: result });
  } catch (error) {
    console.error("Erreur lors de la récupération du temps:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/*
prend en paramètre le json correspondant 
{
	"bornes" : [
		liste des bornes avec la puiss_max
	],
	"car" : {
		"rechargeTime" : temps de recharge de la voiture en minutes,
		"autonomie" :autonomie de la voiture en km
	}
}

et renvoie 
{
	"price": {
		"PriceResult": {
			"float": [
				prix du voyage
			]
		}
	}
}
*/
// Route pour récupérer le prix total
app.post("/api/price", async (req, res) => {
  try {
    const { bornes, car } = req.body;
    const client = await soap.createClientAsync(urlSoap);
    const args = {
      bornes: { float: bornes },
      car: car,
    };

    const [result] = await client.PriceAsync(args);
    res.json({ price: result });
  } catch (error) {
    console.error("Erreur lors de la récupération du prix:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
