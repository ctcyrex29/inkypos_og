// Type declaration for device.native.ts / device.web.ts; Metro picks the platform file at bundle time.
import type { SecureStore } from '@inkypos/core';
import type { DeviceSigner } from './device-signer';

export declare function createDevicePorts(): { vault: SecureStore; signer: DeviceSigner };
