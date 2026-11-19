import type { PinCheckCache } from '@inkypos/core';

// Browsers have no encrypted store for this, and their JavaScript is fast enough for the full check.
export const pinCheckCache: PinCheckCache | null = null;
