import { buildPdf, toCsv } from './export';
import { profitDocument, salesDocument, stockDocument } from './report-exports';

const sales = {
  from: '2026-10-17', to: '2026-10-23', timezone: 'Africa/Harare', currency: 'USD' as const,
  days: [{ date: '2026-10-23', sales_count: 2, sales_minor: 1110, tax_minor: 132, discount_minor: 0, refunds_count: 0, refunds_minor: 0, refund_tax_minor: 0, net_minor: 1110 }],
  totals: { sales_count: 2, sales_minor: 1110, tax_minor: 132, discount_minor: 0, refunds_count: 0, refunds_minor: 0, refund_tax_minor: 0, net_minor: 1110, average_sale_minor: 555 },
  payments: [{ method_code: 'cash', name: 'Cash', currency: 'USD' as const, count: 4, tendered_minor: 1567, pending_minor: 0, refunded_minor: 0 }],
  change_given_minor: 457,
  by_cashier: [{ user_id: 'u', name: 'Tendai, M.', sales_count: 1, sales_minor: 550 }],
  by_register: [],
  top_products: [{ product_id: 'p', name: 'Sadza plate', quantity_milli: 1000, sales_minor: 550 }],
};

describe('report exports', () => {
  it('turns the sales report into tables with plain numbers', () => {
    const doc = salesDocument(sales as never, null);
    expect(doc.period).toBe('2026-10-17 to 2026-10-23');
    expect(doc.tables.map((t) => t.title)).toEqual(['Totals', 'By day', 'By payment type', 'By cashier', 'By till', 'Best sellers']);
    const csv = toCsv({ ...doc, business: 'Kwa Mai', filename: 'x' });
    expect(csv).toContain('Day,Sales,Takings (USD),Refunds,Refunded (USD),Tax (USD),Net (USD)\r\n2026-10-23,2,11.1,0,0,1.32,11.1');
    expect(csv).toContain('"Tendai, M.",1,5.5');
    expect(csv).toContain('Sadza plate,1,5.5');
  });

  it('shows costs as negative lines in the profit export', () => {
    const doc = profitDocument({
      from: 'a', to: 'b', currency: 'USD', net_sales_minor: 10000, cost_of_goods_minor: 6000, gross_profit_minor: 4000, expenses_minor: 1500,
      net_profit_minor: 2500, uncosted_lines: 0, uncosted_sales_minor: 0, expenses_in_other_currencies: [], notice: 'An estimate',
    } as never);
    expect(doc.tables[0]!.rows).toEqual([
      ['Net sales (excluding tax)', 100],
      ['Cost of goods sold', -60],
      ['Gross profit', 40],
      ['Expenses', -15],
      ['Net profit', 25],
    ]);
  });

  it('builds a real PDF file', async () => {
    const doc = stockDocument(
      { items: [{ product_id: 'p', sku: 'BREAD', name: 'White bread', unit: 'each', active: true, on_hand_milli: 4000, reorder_level_milli: 10000, low: true, cost_minor: 95, value_minor: 380 }], total_value_minor: 380, currency: 'USD' } as never,
      null,
    );
    const blob = await buildPdf({ ...doc, business: 'Kwa Mai', filename: 'inkypos-kwa-mai-stock' });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('White bread');
    expect(text).toContain('InkyPOS');
  });
});
