export interface Song {
  name: string;
  interpret: string;
  release_year: string;
}

export function formatInterpret(artists: string[]): string {
  if (artists.length === 0) {
    return "";
  }

  const [primary, ...featured] = artists;
  return featured.length > 0
    ? `${primary} (feat. ${featured.join(", ")})`
    : primary!;
}

export function songsToCsv(songs: Song[]): string {
  const rows = [
    ["name", "interpret", "release_year"],
    ...songs.map((song) => [song.name, song.interpret, song.release_year]),
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n")}\r\n`;
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
