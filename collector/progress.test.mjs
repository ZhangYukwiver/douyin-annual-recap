import { describe, expect, it } from "vitest";

import {
  createEndpointProgress,
  isEndpointComplete,
  recordEndpointMatch,
  recordEndpointResult,
  recordVerifiedEmpty,
} from "./progress.mjs";

function record(progress, pagination) {
  recordEndpointMatch(progress);
  recordEndpointResult(progress, pagination);
}

describe("endpoint progress", () => {
  it("starts empty and incomplete", () => {
    const progress = createEndpointProgress();

    expect(progress).toEqual({
      matchedCount: 0,
      processedCount: 0,
      terminalSeen: false,
      cursorStalled: false,
      paginationMissing: false,
      verifiedEmpty: false,
      cursors: new Set(),
      lastCursor: null,
      pageFingerprints: new Set(),
      repeatedPageFingerprint: false,
      uniqueAddedCount: 0,
      responseGrowth: [],
      visualSurfaceMissing: false,
    });
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("accepts a separately verified empty webpage panel without a response", () => {
    const progress = createEndpointProgress();

    recordVerifiedEmpty(progress);

    expect(progress.verifiedEmpty).toBe(true);
    expect(progress.matchedCount).toBe(0);
    expect(isEndpointComplete(progress)).toBe(true);
  });

  it("invalidates verified empty state when a late response arrives", () => {
    const progress = createEndpointProgress();
    recordVerifiedEmpty(progress);

    recordEndpointMatch(progress);

    expect(progress.verifiedEmpty).toBe(false);
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("accepts a terminal empty page as complete", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: false, cursor: null });

    expect(progress.matchedCount).toBe(1);
    expect(progress.processedCount).toBe(1);
    expect(progress.terminalSeen).toBe(true);
    expect(isEndpointComplete(progress)).toBe(true);
  });

  it("becomes complete after a continuing page reaches a terminal page", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: true, cursor: "page-2" });
    expect(isEndpointComplete(progress)).toBe(false);

    record(progress, { hasMore: false, cursor: null });

    expect(progress.lastCursor).toBe("page-2");
    expect(progress.cursors).toEqual(new Set(["page-2"]));
    expect(isEndpointComplete(progress)).toBe(true);
  });

  it("resets terminal state when a new cursor chain starts", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: false, cursor: null });
    expect(isEndpointComplete(progress)).toBe(true);

    record(progress, { hasMore: true, cursor: "new-page-2" });

    expect(progress.terminalSeen).toBe(false);
    expect(progress.lastCursor).toBe("new-page-2");
    expect(progress.cursors).toEqual(new Set(["new-page-2"]));
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("marks a repeated cursor in one chain as stalled", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: true, cursor: "same-cursor" });
    record(progress, { hasMore: true, cursor: "same-cursor" });
    record(progress, { hasMore: false, cursor: null });

    expect(progress.cursorStalled).toBe(true);
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("marks a continuing page without a cursor as missing pagination", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: true, cursor: null });
    record(progress, { hasMore: false, cursor: null });

    expect(progress.paginationMissing).toBe(true);
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("remains incomplete while a matched response is unprocessed", () => {
    const progress = createEndpointProgress();

    record(progress, { hasMore: false, cursor: null });
    recordEndpointMatch(progress);

    expect(progress.matchedCount).toBe(2);
    expect(progress.processedCount).toBe(1);
    expect(isEndpointComplete(progress)).toBe(false);
  });

  it("tracks unique growth and repeated pages without exposing record ids", () => {
    const progress = createEndpointProgress();

    recordEndpointMatch(progress);
    recordEndpointResult(progress, { hasMore: true, cursor: "page-2" }, {
      added: 19,
      pageSize: 19,
      pageFingerprint: "irreversible-page-fingerprint",
    });
    recordEndpointMatch(progress);
    recordEndpointResult(progress, { hasMore: true, cursor: "page-3" }, {
      added: 0,
      pageSize: 19,
      pageFingerprint: "irreversible-page-fingerprint",
    });

    expect(progress.uniqueAddedCount).toBe(19);
    expect(progress.repeatedPageFingerprint).toBe(true);
    expect(progress.responseGrowth).toEqual([
      { added: 19, pageSize: 19, repeated: false },
      { added: 0, pageSize: 19, repeated: true },
    ]);
    expect(isEndpointComplete(progress)).toBe(false);
  });
});
