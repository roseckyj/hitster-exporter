import assert from "node:assert/strict";
import test from "node:test";
import { QuotaExceededError, SpotifyClient } from "./spotify.ts";

test("getTrack maps Spotify metadata to the requested song fields", async () => {
  const requestedUrls: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url === "https://accounts.spotify.com/api/token") {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }

    requestedUrls.push(url);
    return Response.json({
      id: "track0",
      name: "Song track0",
      artists: [{ name: "Primary" }, { name: "Guest" }],
      album: { release_date: "2001-07-09", release_date_precision: "day" },
    });
  };
  const spotify = new SpotifyClient("id", "secret", mockFetch);

  const song = await spotify.getTrack("track0");

  assert.deepEqual(song, {
    name: "Song track0",
    interpret: "Primary (feat. Guest)",
    release_year: "2001",
  });
  assert.deepEqual(requestedUrls, ["https://api.spotify.com/v1/tracks/track0"]);
});

test("getTrack reports the quota retry interval for the persistent worker", async () => {
  const mockFetch: typeof fetch = async (input) => {
    if (String(input) === "https://accounts.spotify.com/api/token") {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    return Response.json(
      { error: { status: 429, reason: "QUOTA_EXCEEDED" } },
      { status: 429, headers: { "retry-after": "7200" } },
    );
  };
  const spotify = new SpotifyClient("id", "secret", mockFetch);

  await assert.rejects(
    spotify.getTrack("track0"),
    (error: unknown) => error instanceof QuotaExceededError && error.retryAfterMs === 7_200_000,
  );
});
