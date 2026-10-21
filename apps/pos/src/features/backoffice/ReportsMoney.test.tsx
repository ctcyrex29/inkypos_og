import { uuidv7, type SalesReport } from '@inkypos/core';
import { render, screen, userEvent } from '@testing-library/react-native';
import { MoneyTab } from './MoneyTab';
import { ReportsTab } from './ReportsTab';
import type { BackOfficeApi } from './shared';

const today = () => new Date(2026, 9, 21, 15, 0); // 21 Oct 2026, local

const sales: SalesReport = {
  from: '2026-10-21', to: '2026-10-21', timezone: 'Africa/Harare', currency: 'USD',
  days: [{ date: '2026-10-21', sales_count: 3, sales_minor: 1250, tax_minor: 163, discount_minor: 0, refunds_count: 1, refunds_minor: 120, refund_tax_minor: 16, net_minor: 1130 }],
  totals: { sales_count: 3, sales_minor: 1250, tax_minor: 163, discount_minor: 0, refunds_count: 1, refunds_minor: 120, refund_tax_minor: 16, net_minor: 1130, average_sale_minor: 416 },
  payments: [
    { method_code: 'cash', name: 'Cash', currency: 'USD', count: 2, tendered_minor: 1500, pending_minor: 0, refunded_minor: 120 },
    { method_code: 'ecocash', name: 'EcoCash', currency: 'USD', count: 1, tendered_minor: 250, pending_minor: 250, refunded_minor: 0 },
  ],
  change_given_minor: 500,
  by_cashier: [{ user_id: uuidv7(), name: 'Zoe', sales_count: 3, sales_minor: 1250 }],
  by_register: [],
  top_products: [{ product_id: uuidv7(), name: 'White bread', quantity_milli: 5000, sales_minor: 600 }],
};

function api(overrides: Partial<BackOfficeApi> = {}): BackOfficeApi & Record<string, jest.Mock> {
  return {
    salesReport: jest.fn(async () => sales),
    vatReport: jest.fn(async () => ({
      from: '2026-10-21', to: '2026-10-21', currency: 'USD', net_tax_minor: 147, net_taxable_minor: 983, notice: 'Not a tax return.',
      lines: [{ tax_code: 'VAT15', rate_bp: 1500, sales_total_minor: 1250, sales_tax_minor: 163, refunds_total_minor: 120, refunds_tax_minor: 16, net_taxable_minor: 983, net_tax_minor: 147 }],
    })),
    profitReport: jest.fn(async () => ({
      from: '2026-10-21', to: '2026-10-21', currency: 'USD', net_sales_minor: 983, cost_of_goods_minor: 600, gross_profit_minor: 383,
      expenses_minor: 500, net_profit_minor: -117, uncosted_lines: 2, uncosted_sales_minor: 250, expenses_in_other_currencies: [], notice: 'Estimate.',
    })),
    shiftReports: jest.fn(async () => []),
    shiftReport: jest.fn(),
    auditLog: jest.fn(async () => []),
    listExpenses: jest.fn(async () => []),
    recordExpense: jest.fn(async (body) => ({ id: uuidv7(), branch_id: null, reference: null, spent_at: '2026-10-21T13:00:00Z', ...body })),
    paySupplier: jest.fn(async (body) => ({ id: uuidv7(), reference: null, paid_at: '2026-10-21T13:00:00Z', ...body })),
    supplierBalances: jest.fn(async () => ({
      currency: 'USD',
      suppliers: [{ supplier_id: uuidv7(), name: 'Harare Bakeries', active: true, deliveries_minor: 4000, paid_minor: 2500, balance_minor: 1500, paid_in_other_currencies: [] }],
    })),
    cashbook: jest.fn(async () => ({ from: '2026-10-21', to: '2026-10-21', timezone: 'Africa/Harare', entries: [], totals: [] })),
    ...overrides,
  } as never;
}

describe('ReportsTab', () => {
  it('shows today’s sales with takings by payment type and flags unconfirmed payments', async () => {
    const fake = api();
    await render(<ReportsTab api={fake} now={today} />);

    expect(await screen.findByText('Net sales')).toBeOnTheScreen();
    expect(fake.salesReport).toHaveBeenCalledWith({ from: '2026-10-21', to: '2026-10-21' });
    expect(screen.getByText('USD 11.30')).toBeOnTheScreen();
    expect(screen.getByText('Cash (USD)')).toBeOnTheScreen();
    expect(screen.getByText('USD 13.80')).toBeOnTheScreen(); // 15.00 tendered − 1.20 refunded
    expect(screen.getByText('Some payments are not confirmed')).toBeOnTheScreen();
    expect(screen.getByText('White bread × 5')).toBeOnTheScreen();
  });

  it('switches period and report, and says when profit is an estimate with missing costs', async () => {
    const user = userEvent.setup();
    const fake = api();
    await render(<ReportsTab api={fake} now={today} />);

    await user.press(screen.getByRole('radio', { name: 'Last 7 days' }));
    expect(fake.salesReport).toHaveBeenLastCalledWith({ from: '2026-10-15', to: '2026-10-21' });

    await user.press(screen.getByRole('radio', { name: 'Profit' }));
    expect(await screen.findByText('Profit (estimate)')).toBeOnTheScreen();
    expect(screen.getByText('2 sold lines have no cost')).toBeOnTheScreen();
    expect(screen.getByText('USD -1.17')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'VAT' }));
    expect(await screen.findByText('VAT15 at 15.00%')).toBeOnTheScreen();
    expect(screen.getByText('Not a tax return.')).toBeOnTheScreen();
  });
});

describe('MoneyTab', () => {
  it('records an expense paid from the bank', async () => {
    const user = userEvent.setup();
    const fake = api();
    await render(<MoneyTab api={fake} branchId="b1" now={today} />);

    await user.press(screen.getByRole('radio', { name: 'Expenses' }));
    await user.press(screen.getByRole('radio', { name: 'Utilities' }));
    await user.type(screen.getByLabelText('What was it for?'), 'ZESA tokens');
    await user.type(screen.getByLabelText('Amount (USD)'), '20');
    await user.press(screen.getByRole('button', { name: 'Record expense' }));

    expect(fake.recordExpense).toHaveBeenCalledWith({ category: 'utilities', description: 'ZESA tokens', currency: 'USD', amount_minor: 2000, paid_from: 'bank', branch_id: 'b1' });
  });

  it('shows what is owed to a supplier and records a payment', async () => {
    const user = userEvent.setup();
    const fake = api();
    await render(<MoneyTab api={fake} branchId={null} now={today} />);

    await user.press(screen.getByRole('radio', { name: 'Owed to suppliers' }));
    expect(await screen.findByText('USD 15.00')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Pay Harare Bakeries' }));
    await user.type(screen.getByLabelText('Amount (USD)'), '15');
    await user.press(screen.getByRole('radio', { name: 'Mobile money' }));
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(fake.paySupplier).toHaveBeenCalledWith({ supplier_id: expect.any(String), currency: 'USD', amount_minor: 1500, paid_from: 'mobile_money' });
  });
});
