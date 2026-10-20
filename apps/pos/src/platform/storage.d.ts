// Type declaration for storage.native.ts / storage.web.ts; Metro picks the platform file at bundle time.
import type { HarnessFactory, LocalStore } from '@inkypos/core';

export declare function openLocalStore(): Promise<LocalStore>;
export declare function requestPersistentStorage(): Promise<boolean>;
export declare const storageHarness: HarnessFactory;
