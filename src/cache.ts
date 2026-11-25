import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Song } from "./csv.ts";

export class TrackCache {
  readonly #filePath: string;
  readonly #tracks = new Map<string, Song>();
  #writes = Promise.resolve();

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  get size(): number {
    return this.#tracks.size;
  }

  get(trackId: string): Song | undefined {
    return this.#tracks.get(trackId);
  }

  has(trackId: string): boolean {
    return this.#tracks.has(trackId);
  }

  async load(): Promise<void> {
    let contents: string;
    try {
      contents = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    const saved = JSON.parse(contents) as Record<string, Song>;
    for (const [trackId, song] of Object.entries(saved)) {
      this.#tracks.set(trackId, song);
    }
  }

  add(trackId: string, song: Song): void {
    this.#tracks.set(trackId, song);
  }

  flush(): Promise<void> {
    this.#writes = this.#writes.then(() => this.#write());
    return this.#writes;
  }

  async #write(): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    const saved = Object.fromEntries(
      [...this.#tracks.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
    await writeFile(temporaryPath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
  }
}
