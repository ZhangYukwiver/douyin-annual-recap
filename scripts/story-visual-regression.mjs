#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PIXEL_MAE = 8;

function manifestPath(rootDirectory) {
  return path.join(rootDirectory, "visual-baseline", "story-pages", "manifest.json");
}

export async function readStoryManifest(rootDirectory = PROJECT_ROOT) {
  return JSON.parse(await readFile(manifestPath(rootDirectory), "utf8"));
}

function pageNumber(id) {
  const number = Number(id);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sheetForPage(manifest, id) {
  const number = pageNumber(id);
  if (number === null) return null;
  const entry = Object.entries(manifest.pages ?? {}).find(([range]) => {
    const [from, to] = range.split("-").map(Number);
    return Number.isInteger(from) && Number.isInteger(to) && number >= from && number <= to;
  });
  return entry ? { range: entry[0], file: entry[1] } : null;
}

function dimensions(value) {
  return Array.isArray(value) && value.length === 2 && value.every((item) => Number.isInteger(item) && item > 0)
    ? { width: value[0], height: value[1] }
    : null;
}

async function cropMae(sheetPath, rectangle, assetPath, assetSize) {
  const source = await sharp(sheetPath)
    .extract(rectangle)
    .resize(assetSize.width, assetSize.height, { kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const asset = await sharp(assetPath).removeAlpha().raw().toBuffer();
  if (source.length !== asset.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < source.length; index += 1) total += Math.abs(source[index] - asset[index]);
  return total / source.length;
}

/**
 * Check every page resource against the manifest and its source sheet.
 * The hi files are 2x exports, so the source crop is enlarged with nearest
 * neighbour only for provenance checking; a small MAE tolerates export
 * resampling while still catching a shifted crop or wrong page assignment.
 */
export async function inspectReferenceAssets(rootDirectory = PROJECT_ROOT, { pixelCheck = true, maxMae = DEFAULT_PIXEL_MAE } = {}) {
  const manifest = await readStoryManifest(rootDirectory);
  const baselineDirectory = path.join(rootDirectory, "visual-baseline", "story-pages");
  const assetDirectory = path.join(rootDirectory, manifest.pageAssets.directory);
  const displayScale = manifest.pageAssets.displayScale;
  const rectangles = manifest.pageAssets.sourceRectangles ?? {};
  const displayDimensions = manifest.pageAssets.displayDimensions ?? {};
  const pageReports = [];
  const errors = [];
  const sheetMetadata = new Map();

  for (const [id, rawRectangle] of Object.entries(rectangles).sort(([left], [right]) => Number(left) - Number(right))) {
    const sheet = sheetForPage(manifest, id);
    const rectangle = Array.isArray(rawRectangle) && rawRectangle.length === 4
      ? { left: rawRectangle[0], top: rawRectangle[1], width: rawRectangle[2], height: rawRectangle[3] }
      : null;
    const expectedDisplay = dimensions(displayDimensions[id]);
    const assetName = `page-${id}${manifest.pageAssets.suffix}`;
    const assetPath = path.join(assetDirectory, assetName);
    const report = { id, assetName, sheet: sheet?.file ?? null, rectangle, display: expectedDisplay, asset: null, mae: null };
    pageReports.push(report);

    if (!sheet) {
      errors.push(`${id}: manifest.pages 中没有对应四宫格`);
      continue;
    }
    if (!rectangle || ![rectangle.left, rectangle.top, rectangle.width, rectangle.height].every((item) => Number.isInteger(item) && item >= 0) || rectangle.width <= 0 || rectangle.height <= 0) {
      errors.push(`${id}: sourceRectangles 不是有效的正整数矩形`);
      continue;
    }
    if (!expectedDisplay) errors.push(`${id}: displayDimensions 缺失或无效`);
    if (expectedDisplay && (expectedDisplay.width !== rectangle.width || expectedDisplay.height !== rectangle.height)) {
      errors.push(`${id}: displayDimensions 与 sourceRectangles 不一致`);
    }
    if (!Number.isInteger(displayScale) || displayScale <= 0) errors.push(`displayScale 必须是正整数，当前为 ${displayScale}`);

    const sheetPath = path.join(baselineDirectory, sheet.file);
    let sheetInfo = sheetMetadata.get(sheetPath);
    try {
      if (!sheetInfo) {
        sheetInfo = await sharp(sheetPath).metadata();
        sheetMetadata.set(sheetPath, sheetInfo);
      }
      if (rectangle.left + rectangle.width > sheetInfo.width || rectangle.top + rectangle.height > sheetInfo.height) {
        errors.push(`${id}: sourceRectangles 超出 ${sheet.file} (${sheetInfo.width}×${sheetInfo.height})`);
      }
    } catch (error) {
      errors.push(`${id}: 无法读取 ${sheet.file}（${error instanceof Error ? error.message : String(error)}）`);
      continue;
    }

    try {
      const assetInfo = await sharp(assetPath).metadata();
      report.asset = { width: assetInfo.width, height: assetInfo.height };
      if (!expectedDisplay || !Number.isInteger(displayScale)) continue;
      if (assetInfo.width !== expectedDisplay.width * displayScale || assetInfo.height !== expectedDisplay.height * displayScale) {
        errors.push(`${id}: ${assetName} 应为 ${expectedDisplay.width * displayScale}×${expectedDisplay.height * displayScale}，实际 ${assetInfo.width}×${assetInfo.height}`);
      }
      if (pixelCheck && rectangle.left + rectangle.width <= sheetInfo.width && rectangle.top + rectangle.height <= sheetInfo.height) {
        report.mae = await cropMae(sheetPath, rectangle, assetPath, {
          width: expectedDisplay.width * displayScale,
          height: expectedDisplay.height * displayScale,
        });
        if (!Number.isFinite(report.mae) || report.mae > maxMae) errors.push(`${id}: 源裁剪与 hi 资源 MAE ${report.mae.toFixed(3)} > ${maxMae}`);
      }
    } catch (error) {
      errors.push(`${id}: 无法读取 ${assetName}（${error instanceof Error ? error.message : String(error)}）`);
    }
  }

  return { manifest, pages: pageReports, errors, maxMae, pixelCheck };
}

export async function assertReferenceAssets(rootDirectory = PROJECT_ROOT, options = {}) {
  const result = await inspectReferenceAssets(rootDirectory, options);
  if (result.errors.length) throw new Error(["故事页视觉基线校验失败：", ...result.errors.map((error) => `- ${error}`)].join("\n"));
  return result;
}

function styleValue(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : value;
}

/**
 * Contract for explicitly marked animated layers after they settle.
 * A browser adapter can collect `{ id, transform, opacity }` from
 * `getComputedStyle(element)` for `[data-static-frame]` nodes and pass it here.
 */
export function assertStaticFrame(states, { expectedTransform = "none", expectedOpacity = 1, opacityTolerance = 0.001 } = {}) {
  const violations = [];
  for (const state of states) {
    const transform = String(styleValue(state.transform, "none")).trim();
    const opacity = Number(styleValue(state.opacity, expectedOpacity));
    if (transform !== expectedTransform) violations.push(`${state.id ?? "?"}.transform=${transform}`);
    if (!Number.isFinite(opacity) || Math.abs(opacity - expectedOpacity) > opacityTolerance) violations.push(`${state.id ?? "?"}.opacity=${state.opacity}`);
  }
  if (violations.length) throw new Error(`静态帧约束失败：${violations.join(", ")}`);
  return true;
}

/** Compare two settled snapshots so an animation cannot keep changing pixels. */
export function assertStableFrames(before, after, { opacityTolerance = 0.001 } = {}) {
  const left = new Map(before.map((state) => [state.id, state]));
  const right = new Map(after.map((state) => [state.id, state]));
  const violations = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id);
    const b = right.get(id);
    if (!a || !b) {
      violations.push(`${id ?? "?"} 节点集合变化`);
      continue;
    }
    if (String(styleValue(a.transform, "none")) !== String(styleValue(b.transform, "none"))) violations.push(`${id ?? "?"}.transform 变化`);
    const aOpacity = Number(styleValue(a.opacity, 1));
    const bOpacity = Number(styleValue(b.opacity, 1));
    if (!Number.isFinite(aOpacity) || !Number.isFinite(bOpacity) || Math.abs(aOpacity - bOpacity) > opacityTolerance) violations.push(`${id ?? "?"}.opacity 变化`);
  }
  if (violations.length) throw new Error(`静态帧稳定性校验失败：${violations.join(", ")}`);
  return true;
}

async function main() {
  const result = await assertReferenceAssets();
  const maxMae = Math.max(...result.pages.map((page) => page.mae ?? 0));
  console.log(`故事页视觉基线通过：${result.pages.length} 页，最大裁剪 MAE ${maxMae.toFixed(3)}。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
