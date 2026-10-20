import { renderReceiptText, type LocalSyncState, type ReceiptDocument } from '@inkypos/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SYNC_LABELS } from '@/features/sync/SyncPanel';
import { Button, Card, ErrorText, Muted } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

interface Props {
  receipt: ReceiptDocument;
  syncState: LocalSyncState;
  onPrint: () => Promise<void>;
  onNewSale: () => void;
  onDone: () => void;
}

export function ReceiptScreen({ receipt, syncState, onPrint, onNewSale, onDone }: Props) {
  const colors = useColors();
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const print = async () => {
    setPrinting(true);
    setError(null);
    try {
      await onPrint();
    } catch (e) {
      setError(`Printing failed: ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <View style={[styles.paper, { borderColor: colors.border }]}>
          <Text selectable accessibilityLabel="Receipt" style={[styles.mono, { color: colors.text }]}>
            {renderReceiptText(receipt)}
          </Text>
        </View>
        <Muted>Sync: {SYNC_LABELS[syncState]}</Muted>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Print receipt" onPress={() => void print()} busy={printing} />
        <Button label="New sale" onPress={onNewSale} />
        <Button label="Done" tone="secondary" onPress={onDone} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  paper: { borderWidth: 1, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center' },
  mono: { fontFamily: 'monospace', fontSize: 12, lineHeight: 16 },
});
