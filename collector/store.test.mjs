import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createEmptyRecords } from "./normalizer.mjs";
import { CollectorStore } from "./store.mjs";

describe("CollectorStore", () => {
  it("atomically replaces an existing snapshot without storing raw session data", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "douyin-collector-store-"));
    try {
      const store = new CollectorStore(directory);
      const records = createEmptyRecords();
      records.liked_videos.push({
        id: "liked_videos:1",
        title: "记录",
        author: null,
        occurredAt: null,
        url: "https://www.douyin.com/video/1",
      });

      await store.save(records, ["第一次"]);
      await store.save(records, ["第二次"]);

      const loaded = await store.load();
      const raw = await readFile(path.join(directory, "records.json"), "utf8");
      expect(loaded.schemaVersion).toBe(2);
      expect(loaded.records.liked_videos).toHaveLength(1);
      expect(loaded.warnings).toEqual(["第二次"]);
      expect(raw).not.toMatch(/cookie|msToken|a_bogus|x-bogus/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates a v1 snapshot without clearing its records", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "douyin-collector-store-v1-"));
    try {
      const filePath = path.join(directory, "records.json");
      await writeFile(filePath, JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2025-01-01T00:00:00.000Z",
        records: {
          watch_history: [{
            id: "watch_history:legacy-video",
            title: "legacy record",
            author: "legacy creator",
            occurredAt: "2024-12-31T16:00:00.000Z",
            url: "https://www.douyin.com/video/legacy-video",
          }],
          liked_videos: [],
          favorite_videos: [],
        },
        warnings: ["legacy warning"],
      }), "utf8");

      const loaded = await new CollectorStore(directory).load();
      const persisted = JSON.parse(await readFile(filePath, "utf8"));

      expect(loaded).toMatchObject({
        schemaVersion: 2,
        updatedAt: "2025-01-01T00:00:00.000Z",
        warnings: ["legacy warning"],
      });
      expect(loaded.records.watch_history[0]).toMatchObject({
        id: "watch_history:legacy-video",
        videoId: "legacy-video",
        title: "legacy record",
        occurredAtSource: "platform_action",
      });
      expect(persisted.schemaVersion).toBe(2);
      expect(persisted.records.watch_history).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
