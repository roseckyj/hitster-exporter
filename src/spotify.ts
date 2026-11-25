import { setTimeout as sleep } from "node:timers/promises";
import { formatInterpret, type Song } from "./csv.ts";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TRACKS_URL = "https://api.spotify.com/v1/tracks";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export class QuotaExceededError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Spotify quota is exhausted. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = "QuotaExceededError";
    this.retryAfterMs = retryAfterMs;
  }
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    release_date: string;
    release_date_precision: "year" | "month" | "day";
  };
}

export class SpotifyClient {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #fetch: typeof fetch;
  #accessToken = "";
  #tokenExpiresAt = 0;

  constructor(clientId: string, clientSecret: string, fetchImplementation = fetch) {
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#fetch = fetchImplementation;
  }

  async getTrack(trackId: string): Promise<Song> {
    const response = await this.#request(`${TRACKS_URL}/${trackId}`);
    const track = (await response.json()) as SpotifyTrack;

    if (track.id !== trackId) {
      throw new Error(`Spotify returned track ${track.id} instead of ${trackId}.`);
    }

    return {
      name: track.name,
      interpret: formatInterpret(track.artists.map((artist) => artist.name)),
      release_year: parseReleaseYear(track.album.release_date),
    };
  }

  async #request(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.#fetch(url, {
        headers: { Authorization: `Bearer ${await this.#getAccessToken()}` },
      });

      if (response.status === 401 && attempt === 0) {
        this.#accessToken = "";
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1000
          : Math.min(1000 * 2 ** attempt, 30_000);
        if (delay > 60_000) {
          throw new QuotaExceededError(delay);
        }
        if (attempt >= 5) {
          throw new Error(`Spotify request failed with HTTP ${response.status} after retries.`);
        }
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Spotify request failed with HTTP ${response.status}: ${await response.text()}`);
      }

      return response;
    }
  }

  async #getAccessToken(): Promise<string> {
    if (this.#accessToken && Date.now() < this.#tokenExpiresAt) {
      return this.#accessToken;
    }

    const credentials = Buffer.from(`${this.#clientId}:${this.#clientSecret}`).toString("base64");
    const response = await this.#fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`Spotify authentication failed with HTTP ${response.status}. Check .env credentials.`);
    }

    const token = (await response.json()) as TokenResponse;
    this.#accessToken = token.access_token;
    this.#tokenExpiresAt = Date.now() + Math.max(0, token.expires_in - 60) * 1000;
    return this.#accessToken;
  }
}

function parseReleaseYear(releaseDate: string): string {
  const year = releaseDate.match(/^(\d{4})/)?.[1];
  if (!year) {
    throw new Error(`Spotify returned an invalid release date: ${releaseDate}`);
  }
  return year;
}
