import { renderReceiptText, type LocalSyncState, type ReceiptDocument } from '@inkypos/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SYNC_LABELS } from '@/features/sync/SyncPanel';
import { Button, Card, ErrorText, Heading, Muted } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

interface Props {
  receipt: ReceiptDocument;
  syncState: LocalSyncState;
  refunds: { refundId: string; receipt: ReceiptDocument; receiptNumber: string }[];
  /** Null when nothing is left to refund. */
  onRefund: (() => void) | null;
  onPrint: (doc: ReceiptDocument) => Promise<void>;
  onNewSale: () => void;
  onDone: () => void;
}

export function ReceiptScreen({ receipt, syncState, refunds, onRefund, onPrint, onNewSale, onDone }: Props) {
  const colors = useColors();
  const [printing, setPrinting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const print = async (key: string, doc: ReceiptDocument) => {
    setPrinting(key);
    setError(null);
    try {
      await onPrint(doc);
    } catch (e) {
      setError(`Printing failed: ${(e as Error).message}`);
    } finally {
      setPrinting(null);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <View style={[styles.paper, { borderColor: colors.border }]}>
          <Text selectable accessibilityLabel="Receipt" style={[styles.mono, { color: colors.text }]}>
            {renderReceiptText(receipt)}
          </Text>
        </View>
        <Muted>Sync: {SYNC_LABELS[syncState]}</Muted>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Print receipt" onPress={() => void print('sale', receipt)} busy={printing === 'sale'} />
        <Button label="New sale" onPress={onNewSale} />
        {onRefund ? <Button label="Refund or void" tone="secondary" onPress={onRefund} /> : null}
        <Button label="Done" tone="secondary" onPress={onDone} />
      </Card>

      {refunds.length > 0 ? (
        <Card>
          <Heading>Refunds on this sale</Heading>
          {refunds.map((r) => (
            <View key={r.refundId} style={styles.refund}>
              <View style={[styles.paper, { borderColor: colors.border }]}>
                <Text selectable accessibilityLabel={`Refund ${r.receiptNumber}`} style={[styles.mono, { color: colors.text }]}>
                  {renderReceiptText(r.receipt)}
                </Text>
              </View>
              <Button label={`Print refund ${r.receiptNumber}`} tone="secondary" onPress={() => void print(r.refundId, r.receipt)} busy={printing === r.refundId} />
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  paper: { borderWidth: 1, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center' },
  mono: { fontFamily: 'monospace', fontSize: 12, lineHeight: 16 },
  refund: { gap: spacing.sm },
});
