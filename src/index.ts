import "dotenv/config";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { TrackCache } from "./cache.ts";
import { songsToCsv, type Song } from "./csv.ts";
import { packFilename, type Gameset, type GamesetDatabase } from "./gamesets.ts";
import { QuotaExceededError, SpotifyClient } from "./spotify.ts";

const SOURCE_URL = "https://hitster.jumboplay.com/hitster-assets/gameset_database.json";
const DATA_FILE = path.resolve("data/gameset_database.json");
const OUTPUT_DIRECTORY = path.resolve("output");
const CACHE_FILE = path.resolve(".cache/spotify-tracks.json");
const COMPLETION_FILE = path.resolve("output/.complete");
const CONCURRENT_REQUESTS = 4;
const CHECKPOINT_SIZE = 200;
const shutdownController = new AbortController();
let cache: TrackCache | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}; saving cached progress before exiting.`);
    shutdownController.abort();
  });
}

async function main(): Promise<void> {
  const offline = process.argv.includes("--offline");
  const waitForQuota = process.argv.includes("--wait");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!offline && (!clientId || !clientSecret)) {
    throw new Error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.");
  }

  const database = await downloadDatabase();
  validateDatabase(database);
  console.log(`Downloaded ${database.gamesets.length} packs.`);

  const trackCache = new TrackCache(CACHE_FILE);
  cache = trackCache;
  await trackCache.load();
  const trackIds = [...new Set(
    database.gamesets.flatMap((gameset) =>
      gameset.gameset_data.cards.map((card) => card.Spotify)),
  )];
  const missingIds = trackIds.filter((trackId) => !trackCache.has(trackId));
  console.log(`${trackIds.length} unique tracks; ${trackCache.size} cached; ${missingIds.length} to fetch.`);

  if (missingIds.length > 0 && !offline) {
    const spotify = new SpotifyClient(clientId!, clientSecret!);
    let completed = 0;

    try {
      for (let offset = 0; offset < missingIds.length; offset += CHECKPOINT_SIZE) {
        const chunk = missingIds.slice(offset, offset + CHECKPOINT_SIZE);
        for (let requestOffset = 0; requestOffset < chunk.length; requestOffset += CONCURRENT_REQUESTS) {
          shutdownController.signal.throwIfAborted();
          const requestIds = chunk.slice(requestOffset, requestOffset + CONCURRENT_REQUESTS);
          const songs = await Promise.all(requestIds.map((trackId) => spotify.getTrack(trackId)));
          for (const [index, trackId] of requestIds.entries()) {
            trackCache.add(trackId, songs[index]!);
          }
        }
        await trackCache.flush();
        completed += chunk.length;
        console.log(`Fetched ${completed}/${missingIds.length} tracks.`);
      }
    } catch (error) {
      await trackCache.flush();
      if (shutdownController.signal.aborted) {
        console.log("Cached progress saved. Exiting after shutdown request.");
        return;
      }
      if (waitForQuota && error instanceof QuotaExceededError) {
        const resumeAt = new Date(Date.now() + error.retryAfterMs + 5000);
        console.log(`${error.message} Waiting until ${resumeAt.toISOString()} to resume.`);
        await sleep(error.retryAfterMs + 5000, undefined, { signal: shutdownController.signal })
          .catch((sleepError: unknown) => {
            if (!shutdownController.signal.aborted) {
              throw sleepError;
            }
          });
        console.log("Quota wait finished; resuming from cached progress.");
        return main();
      }
      throw error;
    }
  }

  if (offline && missingIds.length > 0) {
    console.warn(`Offline export: ${missingIds.length} uncached tracks will have blank metadata.`);
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const filenames = new Set<string>();
  for (const gameset of database.gamesets) {
    const filename = packFilename(gameset);
    if (filenames.has(filename)) {
      throw new Error(`Duplicate output filename: ${filename}`);
    }
    filenames.add(filename);

    const songs = gameset.gameset_data.cards.map((card): Song => {
      const song = trackCache.get(card.Spotify);
      if (!song) {
        if (!offline) {
          throw new Error(`Missing cached metadata for Spotify track ${card.Spotify}.`);
        }
        return { name: "", interpret: "", release_year: "" };
      }
      return song;
    });
    const outputPath = path.join(OUTPUT_DIRECTORY, filename);
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, songsToCsv(songs), "utf8");
    await rename(temporaryPath, outputPath);
  }

  if (!offline) {
    await writeFile(COMPLETION_FILE, `${new Date().toISOString()}\n`, "utf8");
  }
  console.log(`Exported ${database.gamesets.length} CSV files to ${OUTPUT_DIRECTORY}.`);
}

async function downloadDatabase(): Promise<GamesetDatabase> {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Gameset download failed with HTTP ${response.status}.`);
  }

  const contents = await response.text();
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, contents, "utf8");
  return JSON.parse(contents) as GamesetDatabase;
}

function validateDatabase(database: GamesetDatabase): void {
  if (!Array.isArray(database.gamesets)) {
    throw new Error("The downloaded gameset database has an invalid structure.");
  }

  for (const gameset of database.gamesets) {
    validateGameset(gameset);
  }
}

function validateGameset(gameset: Gameset): void {
  if (!gameset.sku || !gameset.gameset_data || !Array.isArray(gameset.gameset_data.cards)) {
    throw new Error("A gameset is missing its SKU, metadata, or cards.");
  }

  for (const card of gameset.gameset_data.cards) {
    if (!card.CardNumber || !/^[A-Za-z0-9_-]+$/.test(card.Spotify)) {
      throw new Error(`Pack ${gameset.sku} contains an invalid card.`);
    }
  }
}

await main();
