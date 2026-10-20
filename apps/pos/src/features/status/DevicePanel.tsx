import type { EntitlementState } from '@inkypos/core';
import type { DeviceRecord } from '@/services/device-session';
import { Banner, Card, Heading, Muted } from '@/ui/components';

const date = (iso: string) => new Date(iso).toLocaleString();

/** How the subscription state reads to a cashier. Restricted never hides pending sales. */
export function entitlementMessage(state: EntitlementState): { tone: 'success' | 'warning' | 'danger'; title: string; body?: string } {
  switch (state.mode) {
    case 'active':
      return state.warning === 'past_due'
        ? { tone: 'warning', title: 'Payment overdue', body: 'Selling continues. Ask the owner to settle the subscription.' }
        : { tone: 'success', title: 'Ready to sell', body: `Checked with the server; valid offline until ${date(state.validUntil)}.` };
    case 'grace':
      return {
        tone: 'warning',
        title: 'Offline grace period',
        body: `Connect to the internet before ${date(state.graceUntil)} to keep selling.`,
      };
    case 'restricted': {
      const reasons: Record<typeof state.reason, string> = {
        no_entitlement: 'This till has not confirmed its subscription yet. Connect to the internet.',
        subscription_inactive: 'The subscription is not active. Selling is paused; existing sales still sync.',
        grace_expired: 'This till has been offline too long. Connect to the internet to resume selling.',
        clock_rollback: "The device clock is behind the server's. Correct the date and time.",
        wrong_tenant: 'The subscription on file is for a different business. Re-register this till.',
      };
      return { tone: 'danger', title: 'Selling paused', body: reasons[state.reason] };
    }
  }
}

export function DevicePanel({ device, entitlement }: { device: DeviceRecord; entitlement: EntitlementState }) {
  const message = entitlementMessage(entitlement);
  return (
    <Card>
      <Heading>{device.name}</Heading>
      <Banner tone={message.tone} title={message.title} body={message.body} />
      <Muted>Device {device.device_id}</Muted>
    </Card>
  );
}
