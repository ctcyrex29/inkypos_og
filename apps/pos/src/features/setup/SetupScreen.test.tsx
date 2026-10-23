import { ApiError, uuidv7 } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { DeviceSession, ManagerSession } from '@/services/device-session';
import { entitlementMessage } from '@/features/status/DevicePanel';
import { SetupScreen } from './SetupScreen';

const tenantId = uuidv7();
const free = { id: uuidv7(), branch_id: uuidv7(), name: 'Till 1', code: 'T1', active_device_id: null };
const taken = { id: uuidv7(), branch_id: free.branch_id, name: 'Till 2', code: 'T2', active_device_id: uuidv7() };
const manager = { tenants: [{ id: tenantId, name: 'Shop' }] } as unknown as ManagerSession;

function fakeSession(overrides: Partial<Record<keyof DeviceSession, jest.Mock>> = {}) {
  return {
    signInManager: jest.fn(async () => manager),
    listRegisters: jest.fn(async () => [taken, free]),
    enroll: jest.fn(async () => ({})),
    ...overrides,
  } as unknown as DeviceSession & Record<string, jest.Mock>;
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'm@shop.test');
  await user.type(screen.getByLabelText('Password'), 'secret');
  await user.press(screen.getByRole('button', { name: 'Continue' }));
}

describe('SetupScreen', () => {
  it('explains a wrong password without leaving the sign-in step', async () => {
    const user = userEvent.setup();
    const session = fakeSession({
      signInManager: jest.fn(async () => {
        throw new ApiError('Invalid email or password.', 'unauthenticated', 401, 'r', false);
      }),
    });
    await render(<SetupScreen session={session} onEnrolled={jest.fn()} />);

    await signIn(user);

    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
  });

  it('enrols the till on the free register', async () => {
    const user = userEvent.setup();
    const onEnrolled = jest.fn();
    const session = fakeSession();
    await render(<SetupScreen session={session} onEnrolled={onEnrolled} />);

    await signIn(user);
    expect(await screen.findByText('Already has a till')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Register this till' }));

    expect(session.enroll).toHaveBeenCalledWith(manager, expect.objectContaining({ tenantId, registerId: free.id }));
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('does not let a taken register be chosen', async () => {
    const user = userEvent.setup();
    await render(<SetupScreen session={fakeSession()} onEnrolled={jest.fn()} />);
    await signIn(user);

    const option = await screen.findByRole('radio', { name: 'Till 2 · T2' });
    expect(option).toBeDisabled();
  });
});

describe('entitlementMessage', () => {
  it('never tells a restricted till to stop syncing', () => {
    const msg = entitlementMessage({ mode: 'restricted', reason: 'subscription_inactive' });
    expect(msg.tone).toBe('danger');
    expect(msg.body).toMatch(/still sync/);
  });

  it('asks a till in grace to reconnect', () => {
    expect(entitlementMessage({ mode: 'grace', graceUntil: '2026-10-30T08:00:00+00:00' }).title).toBe('Offline grace period');
  });
});

describe('SetupScreen sign-in button', () => {
  it('says what is missing instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    const session = fakeSession();
    await render(<SetupScreen session={session} onEnrolled={jest.fn()} />);

    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Enter the manager’s email and password.')).toBeOnTheScreen();
    expect(session.signInManager).not.toHaveBeenCalled();
  });

  it('signs in with Enter from the password box', async () => {
    const user = userEvent.setup();
    const session = fakeSession();
    await render(<SetupScreen session={session} onEnrolled={jest.fn()} />);

    await user.type(screen.getByLabelText('Email'), 'm@shop.test');
    await user.type(screen.getByLabelText('Password'), 'secret', { submitEditing: true });

    expect(session.signInManager).toHaveBeenCalledWith('m@shop.test', 'secret', expect.any(String));
  });
});
