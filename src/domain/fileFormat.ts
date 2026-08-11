export type PersonalArchiveFormat = "zip" | "json" | "unknown";

export type PersonalArchiveInspection =
  | { status: "inspecting" }
  | { status: "complete"; format: PersonalArchiveFormat }
  | { status: "failed" };

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function isJsonWhitespace(value: number | undefined): boolean {
  return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d;
}

export function detectPersonalArchiveFormat(bytes: Uint8Array): PersonalArchiveFormat {
  if (ZIP_SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    return "zip";
  }

  let index = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (index < bytes.length && isJsonWhitespace(bytes[index])) {
    index += 1;
  }

  return bytes[index] === 0x7b || bytes[index] === 0x5b ? "json" : "unknown";
}

export function describeArchiveInspection(inspection: PersonalArchiveInspection): string {
  if (inspection.status === "inspecting") return "正在识别文件格式";
  if (inspection.status === "failed") return "本机文件检查未完成";
  if (inspection.format === "zip") return "已识别 ZIP 容器，尚未解析记录";
  if (inspection.format === "json") return "已识别 JSON 文件，尚未解析记录";
  return "格式未知，尚未解析记录";
}
