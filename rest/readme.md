# Documentation de l'API

## Introduction

Cette API permet d'obtenir des informations géographiques, des itinéraires et des données liées aux véhicules électriques.

## Installation et Démarrage

1. Installez les dépendances :
   ```sh
   npm install
   ```
2. Lancez le serveur :
   ```sh
   node server.js
   ```
   Le serveur démarre sur `http://localhost:3000`

## Routes de l'API

### 1. Recherche de ville (OpenStreetMap)

- **URL** : `/api/osm/search?q=ville`
- **Méthode** : `GET`
- **Exemple** : `/api/osm/search?q=marseille`
- **Réponse** :
  ```json
  [
    {
      "lat": "43.2961743",
      "lon": "5.3699525",
      "name": "Marseille",
      "display_name": "Marseille, France",
      "address": { ... }
    }
  ]
  ```

### 2. Calcul d'itinéraire

- **URL** : `/api/osm/route?start=longitude,latitude&end=longitude,latitude`
- **Méthode** : `GET`
- **Exemple** : `/api/osm/route?start=2.35,48.85&end=5.37,43.29`
- **Réponse** :
  ```json
  {
    "geometry": { "coordinates": [[...]] },
    "duration": 29540,
    "distance": 771905.5
  }
  ```

### 3. Itinéraire avec bornes de recharge

- **URL** : `/api/osm/routeWithCharging?start=lon,lat&end=lon,lat&carRange=autonomie`
- **Méthode** : `GET`
- **Exemple** : `/api/osm/routeWithCharging?start=2.35,48.85&end=5.37,43.29&carRange=277`
- **Réponse** :
  ```json
  {
    "waypoints": [{"lat": 48.85, "lon": 2.35}, ...],
    "bornes": [ { "id": 1, "power": 50 }, ... ]
  }
  ```

### 4. Liste des bornes de recharge

- **URL** : `/api/borne?lat=latitude&lon=longitude&range=distance`
- **Méthode** : `GET`
- **Exemple** : `/api/borne?lat=48.85&lon=2.35&range=10`
- **Réponse** :
  ```json
  [ { "id": 1, "power": 50, "location": "Paris" }, ... ]
  ```

### 5. Liste des véhicules

- **URL** : `/api/vehicule`
- **Méthode** : `GET`
- **Réponse** :
  ```json
  {
    "vehicleList": [
      {
        "id": "1",
        "naming": { "make": "Tesla", "model": "Model 3" },
        "range": { "chargetrip_range": { "worst": 400 } }
      }
    ]
  }
  ```

### 6. Calcul du temps total de trajet

- **URL** : `/api/time`
- **Méthode** : `POST`
- **Exemple d'entrée** :
  ```json
  {
    "bornes": [{ "puiss_max": 50 }],
    "car": { "rechargeTime": 30, "autonomie": 400 },
    "distanceTime": 180
  }
  ```
- **Réponse** :
  ```json
  { "time": { "PriceResult": { "float": [210] } } }
  ```

### 7. Calcul du prix du trajet

- **URL** : `/api/price`
- **Méthode** : `POST`
- **Exemple d'entrée** :
  ```json
  {
    "bornes": [{ "puiss_max": 50 }],
    "car": { "rechargeTime": 30, "autonomie": 400 }
  }
  ```
- **Réponse** :
  ```json
  { "price": { "PriceResult": { "float": [15.75] } } }
  ```
