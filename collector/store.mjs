import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createEmptyRecords, normalizeRecord } from "./normalizer.mjs";

export const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const RECORD_TYPES = ["watch_history", "liked_videos", "favorite_videos"];
const LEGACY_DIRECT_COMPLETE_WARNING_PREFIX = "无界面读取完成：";

function validRecordCollection(value) {
  return value &&
    typeof value === "object" &&
    Array.isArray(value.watch_history) &&
    Array.isArray(value.liked_videos) &&
    Array.isArray(value.favorite_videos);
}

function normalizeRecordCollection(value, timestampSource = "unknown") {
  if (!validRecordCollection(value)) return null;
  const records = createEmptyRecords();
  for (const type of Object.keys(records)) {
    records[type] = value[type].flatMap((item) => {
      const record = normalizeRecord(item, timestampSource);
      return record ? [record] : [];
    });
  }
  return records;
}

function normalizedWarnings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.slice(0, 500)))]
    : [];
}

export function normalizeDirectSyncState(value, warnings = []) {
  const legacyComplete = Array.isArray(warnings)
    && warnings.some((warning) => typeof warning === "string"
      && warning.startsWith(LEGACY_DIRECT_COMPLETE_WARNING_PREFIX));
  return Object.fromEntries(RECORD_TYPES.map((type) => [
    type,
    value?.[type] === true || legacyComplete,
  ]));
}

export function emptyStoredSnapshot() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    records: createEmptyRecords(),
    warnings: [],
    directSync: normalizeDirectSyncState(null),
  };
}

export class CollectorStore {
  constructor(dataDirectory) {
    this.dataDirectory = dataDirectory;
    this.filePath = path.join(dataDirectory, "records.json");
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (
        !parsed ||
        ![LEGACY_SCHEMA_VERSION, SCHEMA_VERSION].includes(parsed.schemaVersion) ||
        !validRecordCollection(parsed.records)
      ) {
        return emptyStoredSnapshot();
      }
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
        records: normalizeRecordCollection(
          parsed.records,
          parsed.schemaVersion === LEGACY_SCHEMA_VERSION ? "platform_action" : "unknown",
        ),
        warnings: normalizedWarnings(parsed.warnings),
        directSync: normalizeDirectSyncState(parsed.directSync, parsed.warnings),
      };
      if (!snapshot.records) return emptyStoredSnapshot();
      // Persist the canonical v2 shape after reading a v1 snapshot.  Failure to
      // rewrite must not make an otherwise valid legacy snapshot disappear.
      if (parsed.schemaVersion === LEGACY_SCHEMA_VERSION) {
        try {
          await this.writeSnapshot(snapshot);
        } catch {
          // The caller can still use the in-memory migrated snapshot.
        }
      }
      return snapshot;
    } catch (error) {
      if (error && error.code === "ENOENT") return emptyStoredSnapshot();
      throw error;
    }
  }

  async save(records, warnings = [], { directSync } = {}) {
    const normalizedRecords = normalizeRecordCollection(records) ?? createEmptyRecords();
    await mkdir(this.dataDirectory, { recursive: true });
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      records: normalizedRecords,
      warnings: normalizedWarnings(warnings),
      directSync: normalizeDirectSyncState(directSync),
    };
    await this.writeSnapshot(snapshot);
    return snapshot;
  }

  async writeSnapshot(snapshot) {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async clear() {
    return this.save(createEmptyRecords(), []);
  }
}
