import { ApiError, uuidv7, type StaffMember } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { BackOfficeApi } from './shared';
import { StaffTab } from './StaffTab';

const person = (name: string, role: StaffMember['role'], extra: Partial<StaffMember> = {}): StaffMember => ({
  id: uuidv7(), name, email: `${name.toLowerCase()}@shop.test`, role, active: true, has_pin: false, pin_set_at: null, version: 1, ...extra,
});

function setup(people: StaffMember[]) {
  const api = {
    listStaff: jest.fn(async () => people),
    setStaffPin: jest.fn(async (id: string) => ({ ...people.find((p) => p.id === id)!, has_pin: true, pin_set_at: '2026-10-23T10:00:00Z', version: 2 })),
    clearStaffPin: jest.fn(async (id: string) => ({ ...people.find((p) => p.id === id)!, has_pin: false, pin_set_at: null })),
    setStaffActive: jest.fn(async (id: string, active: boolean) => ({ ...people.find((p) => p.id === id)!, active })),
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

  it('shows why the server refused a change', async () => {
    const owner = person('Olive', 'owner');
    const { api, user } = setup([owner]);
    api.setStaffActive.mockRejectedValueOnce(new ApiError('Only an owner can change an owner.', 'forbidden', 403, 'r', false));
    await render(<StaffTab api={api as unknown as BackOfficeApi} />);

    await user.press(await screen.findByRole('button', { name: 'Deactivate Olive' }));
    expect(await screen.findByText(/Only an owner can change an owner/)).toBeOnTheScreen();
  });
});
