import { describe, expect, it } from "vitest";

import { detectPersonalArchiveFormat, describeArchiveInspection } from "./fileFormat";

describe("detectPersonalArchiveFormat", () => {
  it.each([
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ])("recognizes a ZIP container signature", (...signature) => {
    expect(detectPersonalArchiveFormat(Uint8Array.from(signature))).toBe("zip");
  });

  it("recognizes JSON after a UTF-8 BOM and whitespace", () => {
    expect(
      detectPersonalArchiveFormat(Uint8Array.from([0xef, 0xbb, 0xbf, 0x20, 0x0a, 0x7b])),
    ).toBe("json");
  });

  it("recognizes a JSON array", () => {
    expect(detectPersonalArchiveFormat(Uint8Array.from([0x09, 0x5b]))).toBe("json");
  });

  it("does not guess an undocumented format", () => {
    expect(detectPersonalArchiveFormat(Uint8Array.from([0x44, 0x4f, 0x55, 0x59, 0x49, 0x4e]))).toBe(
      "unknown",
    );
    expect(detectPersonalArchiveFormat(new Uint8Array())).toBe("unknown");
  });
});

describe("describeArchiveInspection", () => {
  it("does not claim recognized containers have been parsed", () => {
    expect(describeArchiveInspection({ status: "complete", format: "zip" })).toContain("尚未解析记录");
    expect(describeArchiveInspection({ status: "complete", format: "json" })).toContain("尚未解析记录");
  });
});
