import { amount, csvField, quantity, slug, toCsv } from './export';

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('Bread, white')).toBe('"Bread, white"');
    expect(csvField('12" pizza')).toBe('"12"" pizza"');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(null)).toBe('');
    expect(csvField(12.34)).toBe('12.34');
  });

  it('stops text from running as a spreadsheet formula, but keeps negative numbers', () => {
    expect(csvField('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvField('+263 77 123 4567')).toBe("'+263 77 123 4567");
    expect(csvField('-5 discount')).toBe("'-5 discount");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField(-5.5)).toBe('-5.5');
  });

  it('writes a heading, then each table with its columns, rows and note', () => {
    const csv = toCsv({
      title: 'Sales report',
      business: 'Kwa Mai',
      period: '2026-10-17 to 2026-10-23',
      filename: 'x',
      tables: [
        { title: 'By day', columns: ['Day', 'Sales', 'Net (USD)'], rows: [['2026-10-23', 3, amount(1234)]], note: 'Not a tax return' },
        { title: 'Tills', columns: ['Till', 'Sales'], rows: [] },
      ],
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Sales report · Kwa Mai');
    expect(lines[1]).toBe('Period: 2026-10-17 to 2026-10-23');
    expect(lines.slice(3, 8)).toEqual(['', 'By day', 'Day,Sales,Net (USD)', '2026-10-23,3,12.34', 'Not a tax return']);
    expect(lines.slice(8, 11)).toEqual(['', 'Tills', 'Till,Sales']);
  });

  it('converts units and names files safely', () => {
    expect([amount(5), amount(-250), quantity(2500)]).toEqual([0.05, -2.5, 2.5]);
    expect(slug('Kwa Mai Tendai & Sons')).toBe('kwa-mai-tendai-sons');
    expect(slug('Café Ndlovu')).toBe('cafe-ndlovu');
  });
});
