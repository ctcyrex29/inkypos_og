import {
  runStorageContract,
  STORAGE_CONTRACT,
  type ContractResult,
  type HarnessFactory,
  type LocalStore,
  type LocalSyncState,
  type StorageInfo,
} from '@inkypos/core';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, Heading, Muted } from '@/ui/components';
import { fontSize, spacing, useColors } from '@/ui/theme';

const mb = (bytes?: number) => (bytes === undefined ? 'unknown' : `${(bytes / 1_048_576).toFixed(1)} MB`);

interface Props {
  store: LocalStore;
  /** Throwaway databases for the self-test; never the till's real database. */
  makeHarness: HarnessFactory;
  newId: () => string;
}

/** Storage health plus the full storage contract, run on this very device. */
export function DiagnosticsScreen({ store, makeHarness, newId }: Props) {
  const colors = useColors();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [counts, setCounts] = useState<Record<LocalSyncState, number> | null>(null);
  const [results, setResults] = useState<ContractResult[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([store.info(), store.outbox.countByState()]).then(([nextInfo, nextCounts]) => {
      if (cancelled) return;
      setInfo(nextInfo);
      setCounts(nextCounts);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function runTests() {
    setRunning(true);
    setResults([]);
    await runStorageContract(makeHarness, newId, (r) => setResults((prev) => [...prev, r]));
    setRunning(false);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const finished = !running && results.length === STORAGE_CONTRACT.length;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <Heading>Local database</Heading>
        {info && !info.persistent ? (
          <Banner
            tone="warning"
            title="Browser storage is not protected"
            body="This browser may delete the till's data when space runs low. Install the app or allow persistent storage, and sync often."
          />
        ) : null}
        <Row label="Engine" value={info?.backend ?? '…'} />
        <Row label="Schema version" value={info ? String(info.schemaVersion) : '…'} />
        <Row label="Protected from eviction" value={info ? (info.persistent ? 'Yes' : 'No') : '…'} />
        {info?.quotaBytes !== undefined ? <Row label="Used / available" value={`${mb(info.usageBytes)} of ${mb(info.quotaBytes)}`} /> : null}
        <Row
          label="Waiting to sync"
          value={counts ? `${counts.local + counts.pending} (${counts.needs_review} need review, ${counts.synced} synced)` : '…'}
        />
      </Card>

      <Card>
        <Heading>Storage self-test</Heading>
        <Muted>
          Runs {STORAGE_CONTRACT.length} checks (atomic sales, rollback, restart survival, sync ordering) against a temporary database on this device. The till’s own data is not touched.
        </Muted>
        <Button label={running ? 'Running…' : 'Run storage self-test'} onPress={() => void runTests()} busy={running} />
        {finished ? (
          <Banner
            tone={failed === 0 ? 'success' : 'danger'}
            title={failed === 0 ? `All ${passed} checks passed` : `${failed} of ${results.length} checks failed`}
          />
        ) : null}
        <View style={styles.results}>
          {results.map((r) => (
            <View key={r.name} style={styles.result}>
              <Text style={{ color: r.ok ? colors.success : colors.danger, fontWeight: '700' }}>{r.ok ? 'PASS' : 'FAIL'}</Text>
              <View style={styles.resultText}>
                <Text style={{ color: colors.text, fontSize: fontSize.md }}>{r.name}</Text>
                {r.error ? <Text selectable style={{ color: colors.danger, fontSize: fontSize.sm }}>{r.error}</Text> : null}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{r.ms} ms</Text>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{label}</Text>
      <Text selectable style={{ color: colors.text, fontSize: fontSize.md }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  row: { gap: 2 },
  results: { gap: spacing.sm },
  result: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  resultText: { flex: 1, gap: 2 },
});
