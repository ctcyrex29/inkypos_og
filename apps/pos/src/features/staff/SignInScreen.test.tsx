import { createLocalStore, makePinHash, MemoryDatabase, MemoryDriver, StaffSignIn, uuidv7, type StaffInfo } from '@inkypos/core';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from './SignInScreen';

async function setup() {
  const store = createLocalStore(new MemoryDriver(new MemoryDatabase()));
  await store.migrate();
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const people: StaffInfo[] = [
    { id: uuidv7(), name: 'Zoe', role: 'cashier', active: true, pin: await makePinHash('4821', salt, 10_000), version: 1 },
    { id: uuidv7(), name: 'Amy', role: 'manager', active: true, pin: null, version: 1 },
  ];
  await store.reference.applyPull(people.map((data) => ({ entity: 'staff', op: 'upsert', id: data.id, version: 1, data })), 'log:1');
  const signer = new StaffSignIn(store, () => new Date('2026-10-20T09:00:00Z'));
  const onSignedIn = jest.fn();
  await render(
    <SignInScreen staff={await store.staff.listActive()} signIn={(id, pin) => signer.attempt(id, pin)} onSignedIn={onSignedIn} formatTime={(iso) => iso.slice(11, 19)} />,
  );
  const user = userEvent.setup();
  /** Types a PIN, submits it and waits for the (deliberately slow) check to finish. */
  const attempt = async (pin: string) => {
    await user.type(screen.getByLabelText('PIN'), pin);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn.mock.calls.length > 0 || screen.getByLabelText('PIN').props.value === '').toBe(true));
  };
  return { onSignedIn, people, user, attempt };
}

describe('SignInScreen', () => {
  it('signs a cashier in with their PIN', async () => {
    const { user, onSignedIn, people, attempt } = await setup();
    await user.press(screen.getByRole('button', { name: 'Zoe · Cashier' }));
    await attempt('4821');

    expect(onSignedIn).toHaveBeenCalledWith(people[0]);
  });

  it('counts wrong PINs down to a lockout', async () => {
    const { user, onSignedIn, attempt } = await setup();
    await user.press(screen.getByRole('button', { name: 'Zoe · Cashier' }));
    for (const expected of ['3 more tries', '2 more tries', '1 more try']) {
      await attempt('0000');
      expect(await screen.findByText(new RegExp(expected))).toBeOnTheScreen();
    }
    await attempt('0000');
    await attempt('0000');
    expect(await screen.findByText('Wrong PIN. Too many attempts: try again at 09:00:30.')).toBeOnTheScreen();

    await attempt('4821');
    expect(await screen.findByText('Too many wrong PINs. Try again at 09:00:30.')).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('tells staff without a PIN to ask a manager', async () => {
    const { user } = await setup();
    await user.press(screen.getByRole('button', { name: 'Amy · Manager' }));
    expect(screen.getByText(/Ask a manager to set one/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('PIN')).toBeNull();
  });

  it('explains an empty staff list', async () => {
    await render(<SignInScreen staff={[]} signIn={jest.fn()} onSignedIn={jest.fn()} />);
    expect(screen.getByText('No staff on this till yet')).toBeOnTheScreen();
  });
});

describe('SignInScreen button', () => {
  it('asks for the PIN instead of silently doing nothing', async () => {
    const { user, onSignedIn } = await setup();
    await user.press(screen.getByRole('button', { name: 'Zoe · Cashier' }));
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your 4 to 6 digit PIN.')).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
