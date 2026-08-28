import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMITS,
  parseArguments,
  parseProcessSnapshot,
  processTree,
  summarizeUsage,
} from "./process-watchdog.mjs";

describe("process watchdog", () => {
  it("keeps command flags separate from watchdog flags", () => {
    const parsed = parseArguments([
      "--interval-ms", "250", "--max-rss-mb", "512", "--",
      "npm", "run", "web", "--", "--port", "8081",
    ]);

    expect(parsed.limits).toMatchObject({ intervalMs: 250, maxRssMb: 512 });
    expect(parsed.command).toEqual(["npm", "run", "web", "--", "--port", "8081"]);
  });

  it("finds descendants and sums their CPU and RSS", () => {
    const snapshot = parseProcessSnapshot([
      "100 1 0.2 1000",
      "101 100 12.5 2000",
      "102 101 7.5 3000",
      "200 1 99.0 9000",
    ].join("\n"));

    const pids = processTree(snapshot, 100);
    expect(pids).toEqual([100, 101, 102]);
    expect(summarizeUsage(snapshot, pids)).toEqual({ cpuPercent: 20.2, rssKb: 6000 });
  });

  it("uses bounded defaults and rejects missing commands", () => {
    expect(DEFAULT_LIMITS).toMatchObject({
      intervalMs: 1_000,
      maxCpuPercent: 500,
      maxRssMb: 2_048,
      breachSamples: 3,
    });
    expect(() => parseArguments([])).toThrow(/缺少要监控的命令/u);
  });
});
