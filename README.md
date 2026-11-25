# Hitster CSV exporter

Downloads the Hitster gameset database, retrieves song metadata from Spotify, and writes one CSV per pack to `output/`.

## Requirements

- Node.js 22.18 or newer
- A Spotify application with access to the single-track Web API endpoint

## Setup

```sh
npm install
cp .env.example .env
```

Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`.

## Run

```sh
npm start
```

The exporter downloads `data/gameset_database.json`, caches track metadata in `.cache/spotify-tracks.json`, and creates CSV files named:

```text
<sku> - <country> - <pack>.csv
```

Each CSV contains `name`, `interpret`, and `release_year`, in the original card order. The first Spotify artist is the primary interpret; remaining artists are formatted as `(feat. …)`. Release years come from the album release date returned by Spotify.

Rerunning the command reuses cached tracks. If Spotify reports quota exhaustion, wait for the reported retry interval and run the command again.

To export immediately from the local cache without contacting Spotify:

```sh
npm start -- --offline
```

Offline mode writes every pack, but rows whose tracks are not cached have blank metadata. Run `npm start` after the Spotify quota resets to fill them in.

## Docker Compose: wait for quota resets

With credentials in `.env`, start the persistent exporter:

```sh
docker compose up --build
```

Or leave it running in the background:

```sh
docker compose up --build -d
docker compose logs -f exporter
```

When Spotify returns a quota-exhaustion response, the container saves its cache, waits for the API's `Retry-After` interval plus five seconds, and resumes automatically. It repeats this until every track is downloaded and all CSVs are complete. The cache, downloaded database, and CSVs are persisted in the host's `.cache/`, `data/`, and `output/` directories.

A successful full export creates `output/.complete`. Stop the worker with `docker compose stop`; it saves progress before exiting. `docker compose down` also stops and removes the container without deleting the host files.

## Validate

```sh
npm run build
npm test
```
