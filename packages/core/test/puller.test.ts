import { describe, expect, it } from 'vitest';
import { ApiError, CataloguePuller, createLocalStore, MemoryDriver, uuidv7, type PullChange, type SyncPullResponse } from '../src';

const product = (name: string, barcode: string) => {
  const id = uuidv7();
  return {
    entity: 'product', op: 'upsert', id, version: 1,
    data: { product_id: id, sku: name, name, unit: 'each', unit_price_minor: 100, tax_code: 'VAT15', tax_rate_bp: 1500, tax_inclusive: true, active: true, barcodes: [barcode], version: 1 },
  } as PullChange;
};

describe('CataloguePuller', () => {
  it('pulls every page, resumes after a failure, and never re-reads applied pages', async () => {
    const store = createLocalStore(new MemoryDriver());
    await store.migrate();
    const pages: Record<string, SyncPullResponse> = {
      '': { next_cursor: 'snap:9:a', has_more: true, changes: [product('Bread', '111')] },
      'snap:9:a': { next_cursor: 'log:9', has_more: true, changes: [product('Milk', '222')] },
      'log:9': { next_cursor: 'log:12', has_more: false, changes: [product('Eggs', '333')] },
    };
    const requested: string[] = [];
    let failOn: string | null = 'log:9';
    const puller = new CataloguePuller(store, {
      async pull(cursor) {
        requested.push(cursor);
        if (cursor === failOn) {
          failOn = null;
          throw new ApiError('Network error: offline', 'network_error', null, 'r', true);
        }
        return pages[cursor]!;
      },
    });

    expect(await puller.pullOnce()).toMatchObject({ pages: 2, complete: false, error: { code: 'network_error' } });
    expect(await store.reference.cursor()).toBe('log:9');

    expect(await puller.pullOnce()).toMatchObject({ pages: 1, changes: 1, complete: true });
    expect(requested).toEqual(['', 'snap:9:a', 'log:9', 'log:9']);
    expect((await store.catalogue.findByBarcode('333'))?.name).toBe('Eggs');
    expect(await store.reference.catalogueVersion()).toBe(12);
  });

  it('reports a malformed page instead of applying it', async () => {
    const store = createLocalStore(new MemoryDriver());
    await store.migrate();
    const bad = { ...product('Bad', '9'), data: { nonsense: true } } as PullChange;
    const puller = new CataloguePuller(store, { pull: async () => ({ next_cursor: 'log:1', has_more: false, changes: [bad] }) });

    expect(await puller.pullOnce()).toMatchObject({ complete: false, error: { code: 'PullContractError' } });
    expect(await store.reference.cursor()).toBe('');
  });
});
