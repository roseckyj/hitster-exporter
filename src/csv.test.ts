import assert from "node:assert/strict";
import test from "node:test";
import { formatInterpret, songsToCsv } from "./csv.ts";

test("formatInterpret puts all additional Spotify artists in feat. brackets", () => {
  assert.equal(formatInterpret(["Primary", "Guest", "Second Guest"]), "Primary (feat. Guest, Second Guest)");
  assert.equal(formatInterpret(["Solo"]), "Solo");
});

test("songsToCsv escapes spreadsheet fields and preserves release years", () => {
  const csv = songsToCsv([{
    name: 'A "song", live',
    interpret: "Artist (feat. Guest)",
    release_year: "1984",
  }]);

  assert.equal(
    csv,
    '\uFEFFname,interpret,release_year\r\n"A ""song"", live",Artist (feat. Guest),1984\r\n',
  );
});
