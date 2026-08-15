import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startStaticServer } from "./staticServer.mjs";

const temporaryDirectories = [];
const runtimes = [];

afterEach(async () => {
  await Promise.allSettled(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "content-insights-static-"));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Desktop fixture</title>");
  await writeFile(path.join(directory, "assets", "app.js"), "console.log('fixture');");
  return directory;
}

describe("desktop static server", () => {
  it("serves exported assets with security headers", async () => {
    const runtime = await startStaticServer({ rootDirectory: await fixture() });
    runtimes.push(runtime);

    const response = await fetch(`${runtime.url}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    await expect(response.text()).resolves.toContain("fixture");
  });

  it("falls back to the app shell only for HTML navigation", async () => {
    const runtime = await startStaticServer({ rootDirectory: await fixture() });
    runtimes.push(runtime);

    const navigation = await fetch(`${runtime.url}/annual/2025`, { headers: { Accept: "text/html" } });
    expect(navigation.status).toBe(200);
    await expect(navigation.text()).resolves.toContain("Desktop fixture");

    const missingAsset = await fetch(`${runtime.url}/assets/missing.js`);
    expect(missingAsset.status).toBe(404);
  });
});
