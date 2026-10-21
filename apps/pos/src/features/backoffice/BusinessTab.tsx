import type { BusinessSettings } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { Chip, describeApiError, styles, useLoad, type BackOfficeApi } from './shared';

/** How the business works: a shop or a restaurant, and the time zone reports count days in. */
export function BusinessTab({ api }: { api: BackOfficeApi }) {
  const current = useLoad(useCallback(() => api.getBusiness(), [api]));
  const [draft, setDraft] = useState<Partial<BusinessSettings>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (current.error) return <Card><ErrorText>{current.error}</ErrorText></Card>;
  if (!current.data) return <Card><Muted>Loading…</Muted></Card>;
  const value = { ...current.data, ...draft };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      current.setData(await api.updateBusiness({ business_type: value.business_type, timezone: value.timezone.trim() }));
      setDraft({});
      setSaved(true);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>Business</Heading>
      <Muted>Type of business</Muted>
      <View style={styles.chips}>
        <Chip label="Shop" selected={value.business_type === 'retail'} onPress={() => setDraft({ ...draft, business_type: 'retail' })} />
        <Chip label="Restaurant" selected={value.business_type === 'restaurant'} onPress={() => setDraft({ ...draft, business_type: 'restaurant' })} />
      </View>
      <Muted>
        {value.business_type === 'restaurant'
          ? 'Tills show Orders (tables and takeaway) and a Kitchen screen; quick sales stay available.'
          : 'Tills ring up sales straight away.'}
      </Muted>
      <Field label="Time zone" value={value.timezone} onChangeText={(t) => setDraft({ ...draft, timezone: t })} autoCapitalize="none" placeholder="Africa/Harare" />
      <Muted>Reports count a day from midnight in this time zone.</Muted>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Muted>Saved. Tills pick this up on their next sync.</Muted> : null}
      <Button label="Save business settings" onPress={() => void save()} busy={busy} disabled={Object.keys(draft).length === 0} />
    </Card>
  );
}
