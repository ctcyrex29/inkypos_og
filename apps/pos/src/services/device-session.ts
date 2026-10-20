import {
  ApiError,
  deviceAuthMessage,
  evaluateEntitlement,
  EntitlementError,
  signedEntitlementSchema,
  verifyEntitlement,
  type ApiClient,
  type EntitlementPayload,
  type EntitlementState,
  type Register,
  type SecureStore,
  type Session,
  type TrustedEntitlementKeys,
} from '@inkypos/core';
import type { DeviceSigner } from '@/platform/device-signer';

export interface DeviceRecord {
  device_id: string;
  tenant_id: string;
  branch_id: string;
  register_id: string;
  name: string;
}

export type SessionStatus =
  | { phase: 'unenrolled' }
  | { phase: 'revoked'; device: DeviceRecord }
  | { phase: 'ready'; device: DeviceRecord; entitlement: EntitlementState; plan: EntitlementPayload | null };

/** A manager signed in on the till only to enrol it. Held in memory, never persisted. */
export interface ManagerSession {
  session: Session;
  /** Businesses where this user may register devices. */
  tenants: { id: string; name: string }[];
  client: (tenantId: string) => ApiClient;
}

export interface ClientAuth {
  token: () => string | null;
  tenantId?: () => string | null;
}

export interface DeviceSessionDeps {
  createClient: (auth: ClientAuth) => ApiClient;
  vault: SecureStore;
  signer: DeviceSigner;
  trustedKeys: TrustedEntitlementKeys;
  now?: () => number;
}

const REFRESH_MARGIN_MS = 60_000;

export class DeviceSession {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly now: () => number;
  private readonly deviceClient: ApiClient;

  constructor(private readonly deps: DeviceSessionDeps) {
    this.now = deps.now ?? Date.now;
    this.deviceClient = deps.createClient({ token: () => this.token?.value ?? null });
  }

  // ── Enrolment ────────────────────────────────────────────────────────────

  async signInManager(email: string, password: string, deviceName: string): Promise<ManagerSession> {
    const session = await this.deps.createClient({ token: () => null }).login({ email, password, device_name: deviceName });
    const tenants = session.memberships
      .filter((m) => m.role === 'owner' || m.role === 'manager')
      .map((m) => ({ id: m.tenant_id, name: m.tenant_name }));
    const token = session.tokens.access_token;
    return {
      session,
      tenants,
      client: (tenantId) => this.deps.createClient({ token: () => token, tenantId: () => tenantId }),
    };
  }

  listRegisters(manager: ManagerSession, tenantId: string): Promise<Register[]> {
    return manager.client(tenantId).listRegisters();
  }

  async enroll(
    manager: ManagerSession,
    input: { tenantId: string; registerId: string; name: string; platform: 'android' | 'ios' | 'web' | 'windows' | 'macos' },
  ): Promise<DeviceRecord> {
    const client = manager.client(input.tenantId);
    const publicKey = await this.deps.signer.create();
    const device = await client.registerDevice({
      register_id: input.registerId,
      name: input.name,
      platform: input.platform,
      public_key: publicKey,
    });

    const record: DeviceRecord = {
      device_id: device.id,
      tenant_id: device.tenant_id,
      branch_id: device.branch_id,
      register_id: device.register_id,
      name: device.name,
    };
    await this.deps.vault.set('device.record', JSON.stringify(record));
    await this.deps.vault.delete('device.revoked');
    await this.deps.vault.delete('device.entitlement');

    // The till keeps no manager credentials once it is enrolled.
    await client.logout().catch(() => undefined);

    await this.refreshEntitlement().catch(() => undefined);
    return record;
  }

  // ── Device sign-in ───────────────────────────────────────────────────────

  async authenticate(): Promise<string> {
    const record = await this.record();
    if (!record) throw new Error('Device is not enrolled.');
    try {
      const { challenge } = await this.deviceClient.deviceChallenge(record.device_id);
      const signature = await this.deps.signer.sign(deviceAuthMessage(record.device_id, challenge));
      const result = await this.deviceClient.deviceToken(record.device_id, challenge, signature);
      this.token = { value: result.access_token, expiresAt: Date.parse(result.access_expires_at) };
      await this.recordServerTime(result.server_time);
      return result.access_token;
    } catch (e) {
      await this.handleRevocation(e);
      throw e;
    }
  }

  async refreshEntitlement(): Promise<EntitlementPayload> {
    const record = await this.record();
    if (!record) throw new Error('Device is not enrolled.');

    const fetchDoc = async () => {
      if (!this.token || this.token.expiresAt - REFRESH_MARGIN_MS < this.now()) await this.authenticate();
      return this.deviceClient.entitlements();
    };

    let doc;
    try {
      doc = await fetchDoc();
    } catch (e) {
      await this.handleRevocation(e);
      if (!(e instanceof ApiError && e.code === 'unauthenticated')) throw e;
      this.token = null; // token expired or was revoked server-side: sign in once more
      doc = await fetchDoc();
    }

    // Verify before storing; a bad document never replaces a good one.
    const payload = verifyEntitlement(doc, this.deps.trustedKeys);
    if (payload.tenant_id !== record.tenant_id) throw new EntitlementError('Entitlement is for a different business');
    await this.deps.vault.set('device.entitlement', JSON.stringify(doc));
    await this.recordServerTime(payload.issued_at);
    return payload;
  }

  // ── State ────────────────────────────────────────────────────────────────

  async status(): Promise<SessionStatus> {
    const record = await this.record();
    if (!record) return { phase: 'unenrolled' };
    if (await this.deps.vault.get('device.revoked')) return { phase: 'revoked', device: record };

    const plan = await this.storedEntitlement();
    const last = Number(await this.deps.vault.get('device.last_server_time')) || null;
    const entitlement = evaluateEntitlement({
      entitlement: plan,
      tenantId: record.tenant_id,
      now: this.now(),
      lastTrustedServerTime: last,
    });
    return { phase: 'ready', device: record, entitlement, plan };
  }

  private async record(): Promise<DeviceRecord | null> {
    const raw = await this.deps.vault.get('device.record');
    return raw ? (JSON.parse(raw) as DeviceRecord) : null;
  }

  /** Stored documents are re-verified on every read; local tampering yields "no entitlement". */
  private async storedEntitlement(): Promise<EntitlementPayload | null> {
    const raw = await this.deps.vault.get('device.entitlement');
    if (!raw) return null;
    try {
      return verifyEntitlement(signedEntitlementSchema.parse(JSON.parse(raw)), this.deps.trustedKeys);
    } catch {
      return null;
    }
  }

  /** Only ever moves forward, so winding the device clock back cannot hide past server contact. */
  private async recordServerTime(iso: string): Promise<void> {
    const incoming = Date.parse(iso);
    const current = Number(await this.deps.vault.get('device.last_server_time')) || 0;
    if (incoming > current) await this.deps.vault.set('device.last_server_time', String(incoming));
  }

  private async handleRevocation(e: unknown): Promise<void> {
    if (e instanceof ApiError && e.code === 'device_revoked') {
      this.token = null;
      await this.deps.vault.set('device.revoked', new Date(this.now()).toISOString());
    }
  }
}
