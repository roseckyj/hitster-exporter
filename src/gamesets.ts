export interface Card {
  CardNumber: string;
  Spotify: string;
  ArtistType?: string;
}

export interface Gameset {
  sku: string;
  gameset_data: {
    gameset_language: string;
    gameset_name: string;
    cards: Card[];
  };
}

export interface GamesetDatabase {
  updated_on: number;
  gamesets: Gameset[];
}

export function packFilename(gameset: Gameset): string {
  const country = normalizeName(gameset.gameset_data.gameset_language);
  const pack = normalizeName(gameset.gameset_data.gameset_name);
  const filename = `${gameset.sku} - ${country} - ${pack}`
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[. ]+$/g, "");

  if (!filename) {
    throw new Error(`Pack ${gameset.sku} has no usable filename.`);
  }

  return `${filename}.csv`;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
