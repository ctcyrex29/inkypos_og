// Type declaration for pin-cache.native.ts / pin-cache.web.ts; Metro picks the platform file at bundle time.
import type { PinCheckCache } from '@inkypos/core';

/** Quick PIN checks after a first sign-in; null where there is no safe place to keep them. */
export declare const pinCheckCache: PinCheckCache | null;
