import { ApiError, uuidv7, type StaffMember } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { BackOfficeApi } from './shared';
import { StaffTab } from './StaffTab';

const person = (name: string, role: StaffMember['role'], extra: Partial<StaffMember> = {}): StaffMember => ({
  id: uuidv7(), name, email: `${name.toLowerCase()}@shop.test`, till_only: false, role, active: true, has_pin: false, pin_set_at: null, version: 1, ...extra,
});

function setup(people: StaffMember[]) {
  const api = {
    listStaff: jest.fn(async () => people),
    setStaffPin: jest.fn(async (id: string) => ({ ...people.find((p) => p.id === id)!, has_pin: true, pin_set_at: '2026-10-23T10:00:00Z', version: 2 })),
    clearStaffPin: jest.fn(async (id: string) => ({ ...people.find((p) => p.id === id)!, has_pin: false, pin_set_at: null })),
    setStaffActive: jest.fn(async (id: string, active: boolean) => ({ ...people.find((p) => p.id === id)!, active })),
    createTillStaff: jest.fn(async (input: { name: string; role?: StaffMember['role']; pin?: string }) =>
      person(input.name, input.role ?? 'cashier', { email: null, till_only: true, has_pin: Boolean(input.pin) })),
    renameStaff: jest.fn(async (id: string, name: string) => ({ ...people.find((p) => p.id === id)!, name })),
  };
  return { api, user: userEvent.setup() };
}

describe('StaffTab', () => {
  it('sets a PIN after checking it is strong enough and typed twice', async () => {
    const zoe = person('Zoe', 'cashier');
    const { api, user } = setup([zoe]);
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    expect(await screen.findByText('No PIN: cannot sign in on tills')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Set PIN for Zoe' }));

    await user.type(screen.getByLabelText('New PIN for Zoe'), '1234');
    expect(screen.getByText('The PIN cannot be a run of consecutive digits.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save PIN' })).toBeDisabled();

    await user.clear(screen.getByLabelText('New PIN for Zoe'));
    await user.type(screen.getByLabelText('New PIN for Zoe'), '4821');
    await user.type(screen.getByLabelText('Repeat the PIN'), '4822');
    expect(screen.getByText('The two PINs are different.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Repeat the PIN'));
    await user.type(screen.getByLabelText('Repeat the PIN'), '4821');
    await user.press(screen.getByRole('button', { name: 'Save PIN' }));

    expect(api.setStaffPin).toHaveBeenCalledWith(zoe.id, '4821');
    expect(await screen.findByText('PIN set for Zoe.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Change PIN for Zoe' })).toBeOnTheScreen();
  });

  it('removes a PIN and deactivates someone', async () => {
    const amy = person('Amy', 'manager', { has_pin: true, pin_set_at: '2026-10-20T10:00:00Z' });
    const { api, user } = setup([amy]);
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    await user.press(await screen.findByRole('button', { name: 'Remove PIN for Amy' }));
    expect(api.clearStaffPin).toHaveBeenCalledWith(amy.id);
    expect(await screen.findByText(/can no longer sign in on tills/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Deactivate Amy' }));
    expect(api.setStaffActive).toHaveBeenCalledWith(amy.id, false);
    expect(await screen.findByText('Deactivated')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reactivate Amy' })).toBeOnTheScreen();
  });

  it('adds a till-only cashier with a PIN', async () => {
    const { api, user } = setup([person('Olive', 'manager')]);
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    await user.press(await screen.findByRole('button', { name: 'Add till-only staff' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Tendai');
    await user.type(screen.getByLabelText('PIN (optional, can be set later)'), '5813');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled(); // not repeated yet
    await user.type(screen.getByLabelText('Repeat the PIN'), '5813');
    await user.press(screen.getByRole('button', { name: 'Add' }));

    expect(api.createTillStaff).toHaveBeenCalledWith({ name: 'Tendai', role: 'cashier', pin: '5813' });
    expect(await screen.findByText(/Tendai added\. They can sign in on the tills/)).toBeOnTheScreen();
    expect(screen.getByText('Till only (no back-office login)')).toBeOnTheScreen();
  });

  it('adds a till-only manager without a PIN and renames till-only staff', async () => {
    const rudo = person('Rudo', 'cashier', { email: null, till_only: true });
    const { api, user } = setup([rudo]);
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    await user.press(await screen.findByRole('button', { name: 'Rename Rudo' }));
    await user.clear(screen.getByLabelText('New name for Rudo'));
    await user.type(screen.getByLabelText('New name for Rudo'), 'Rudo M.');
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(api.renameStaff).toHaveBeenCalledWith(rudo.id, 'Rudo M.');
    expect(await screen.findByText('Renamed to Rudo M..')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Add till-only staff' }));
    await user.type(screen.getByLabelText('Name'), 'Shift lead');
    await user.press(screen.getByRole('radio', { name: 'Manager (on tills)' }));
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(api.createTillStaff).toHaveBeenCalledWith({ name: 'Shift lead', role: 'manager' });
    expect(await screen.findByText('Shift lead added. Set a PIN so they can sign in.')).toBeOnTheScreen();
  });

  it('does not offer renaming people who have a login', async () => {
    const { api } = setup([person('Amy', 'manager')]);
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);
    expect(await screen.findByText('amy@shop.test')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Rename Amy' })).toBeNull();
  });

  it('shows why the server refused a change', async () => {
    const olive = person('Olive', 'manager');
    const { api, user } = setup([olive]);
    api.setStaffActive.mockRejectedValueOnce(new ApiError('A business needs at least one active manager who can sign in to the back office.', 'validation_failed', 422, 'r', false));
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    await user.press(await screen.findByRole('button', { name: 'Deactivate Olive' }));
    expect(await screen.findByText(/at least one active manager/)).toBeOnTheScreen();
  });
});
