import assert from "node:assert/strict";
import test from "node:test";
import { packFilename, type Gameset } from "./gamesets.ts";

const gameset: Gameset = {
  sku: "test0001",
  gameset_data: {
    gameset_language: " Czechia/Slovakia ",
    gameset_name: " Hitster   Original ",
    cards: [],
  },
};

test("packFilename prefixes the SKU and makes the name filesystem-safe", () => {
  assert.equal(packFilename(gameset), "test0001 - Czechia-Slovakia - Hitster Original.csv");
});
