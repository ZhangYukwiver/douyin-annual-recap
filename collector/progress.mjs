export function createEndpointProgress() {
  return {
    matchedCount: 0,
    processedCount: 0,
    terminalSeen: false,
    cursorStalled: false,
    paginationMissing: false,
    verifiedEmpty: false,
    cursors: new Set(),
    lastCursor: null,
    pageFingerprints: new Set(),
    duplicatePageCounts: new Map(),
    duplicateResponseCount: 0,
    repeatedPageFingerprint: false,
    uniqueAddedCount: 0,
    responseGrowth: [],
    visualSurfaceMissing: false,
    responseProgressStalled: false,
  };
}

export function recordVerifiedEmpty(progress) {
  if (progress.matchedCount === 0) progress.verifiedEmpty = true;
  return progress;
}

export function recordEndpointMatch(progress) {
  progress.verifiedEmpty = false;
  progress.matchedCount += 1;
  return progress;
}

export function recordEndpointResult(progress, { hasMore, cursor }, {
  added = 0,
  pageSize = 0,
  pageFingerprint = null,
} = {}) {
  progress.processedCount += 1;
  const safeAdded = Number.isSafeInteger(added) && added >= 0 ? added : 0;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize >= 0 ? pageSize : 0;
  let repeated = false;
  if (typeof pageFingerprint === "string" && pageFingerprint.length > 0) {
    repeated = progress.pageFingerprints.has(pageFingerprint);
    if (repeated && safeAdded === 0) {
      const duplicateCount = (progress.duplicatePageCounts.get(pageFingerprint) ?? 0) + 1;
      progress.duplicatePageCounts.set(pageFingerprint, duplicateCount);
      progress.duplicateResponseCount += 1;
      if (progress.responseGrowth.length < 100) {
        progress.responseGrowth.push({ added: 0, pageSize: safePageSize, repeated: true });
      }
      if (duplicateCount > 1) progress.repeatedPageFingerprint = true;
      return progress;
    }
    progress.pageFingerprints.add(pageFingerprint);
    if (repeated) progress.repeatedPageFingerprint = true;
  }
  progress.uniqueAddedCount += safeAdded;
  if (progress.responseGrowth.length < 100) {
    progress.responseGrowth.push({ added: safeAdded, pageSize: safePageSize, repeated });
  }

  if (hasMore === false) {
    progress.terminalSeen = true;
    return progress;
  }

  if (hasMore !== true) {
    progress.paginationMissing = true;
    return progress;
  }

  progress.terminalSeen = false;

  if (typeof cursor !== "string" || cursor.length === 0) {
    progress.paginationMissing = true;
    progress.lastCursor = null;
    return progress;
  }

  if (progress.cursors.has(cursor)) progress.cursorStalled = true;
  progress.cursors.add(cursor);
  progress.lastCursor = cursor;
  return progress;
}

export function isEndpointComplete(progress) {
  return progress.verifiedEmpty || (progress.matchedCount > 0
    && progress.processedCount === progress.matchedCount
    && progress.terminalSeen
    && !progress.cursorStalled
    && !progress.paginationMissing
    && !progress.repeatedPageFingerprint);
}
