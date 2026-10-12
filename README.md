# UrbexAtlas

Eine lokale Webanwendung zum Erfassen und Verbinden von Lost-Place-Spots auf einer interaktiven Leaflet-Karte.

## Funktionen

- Google-Satellitenansicht als Standardkarte
- Interaktive Karte auf Basis von [Leaflet](https://leafletjs.com/)
- Zwischen OpenStreetMap-Straßenkarte und Google-Satellitenansicht umschalten
- Mobile Ansicht mit ausklappbarer Seitenleiste
- Spots direkt per Kartenklick anlegen
- Name und Beschreibung pro Spot
- Gerichtete Pfeile zwischen zwei Spots spannen
- Pfeilspitzen mit gut sichtbaren, doppelt langen Schenkeln
- Individuelle Marker- und Pfeilfarben mit Speicherung in SQLite
- Spots und Pfeile dauerhaft in SQLite speichern
- Einträge über die Seitenleiste verwalten und löschen
- Keine externen Python-Abhängigkeiten erforderlich
- Zugriff im Heimnetz über `0.0.0.0:8765`

## Voraussetzungen

- Python 3.10 oder neuer
- Internetzugriff im Browser für Leaflet und OpenStreetMap-Kacheln

## Start

```bash
git clone https://github.com/NoggerCooker/UrbexAtlas.git
cd UrbexAtlas
python3 server.py
```

Danach öffnen:

```text
http://127.0.0.1:8765
```

Für den Zugriff von anderen Geräten im gleichen Heimnetz:

```text
http://<IP-DES-SERVERS>:8765
```

Der Server bindet standardmäßig an `0.0.0.0`. Der Port kann über die Umgebungsvariable `PORT` geändert werden:

```bash
PORT=9000 python3 server.py
```

## Bedienung

1. **Spot markieren** auswählen.
2. Auf die gewünschte Position der Karte klicken.
3. Namen und optional eine Beschreibung eingeben.
4. Für eine Verbindung **Pfeil spannen** auswählen.
5. Zuerst den Startspot, danach den Zielspot anklicken.

Die Datenbank `lost_place_map.sqlite3` wird beim ersten Start automatisch mit den Tabellen `spots` und `arrows` angelegt.

## Mobile Bedienung

Auf Bildschirmbreiten bis 760 Pixel wird die Seitenleiste standardmäßig ausgeblendet und die Karte nutzt die gesamte verfügbare Fläche. Über das Menü-Symbol oben links wird die Seitenleiste eingeblendet. Nach Auswahl einer Aktion schließt sie sich wieder, damit die Karte vollständig bedienbar bleibt.

## Projektstruktur

```text
UrbexAtlas/
├── server.py                 # Python-Backend und SQLite-API
├── static/
│   ├── index.html            # Frontend-Struktur
│   ├── styles.css            # Oberfläche und Layout
│   └── app.js                # Kartenlogik und API-Aufrufe
├── README.md
└── .gitignore
```

## API-Überblick

- `GET /api/data` – alle Spots und Pfeile laden
- `POST /api/spots` – Spot anlegen
- `POST /api/arrows` – Pfeil zwischen zwei Spots anlegen
- `PATCH /api/spots/<id>` – Markerfarbe eines Spots speichern
- `PATCH /api/arrows/<id>` – Pfeilfarbe eines Pfeils speichern
- `DELETE /api/spots/<id>` – Spot inklusive abhängiger Pfeile löschen
- `DELETE /api/arrows/<id>` – Pfeil löschen

## Hinweise

- Kartenkacheln werden von OpenStreetMap geladen; bitte die Nutzungsbedingungen und die Attribution beachten.
- Das Projekt ist für den lokalen bzw. privaten Heimnetz-Betrieb ausgelegt. Für einen öffentlichen Betrieb sollten mindestens Authentifizierung, HTTPS und Zugriffsschutz ergänzt werden.
- Die lokale SQLite-Datenbank wird nicht in Git versioniert, damit private Spot-Daten nicht versehentlich veröffentlicht werden.

## Lizenz

Dieses Projekt enthält derzeit keine separate Lizenzdatei. Für eine öffentliche Weiterverwendung sollte eine Lizenz ergänzt werden.
