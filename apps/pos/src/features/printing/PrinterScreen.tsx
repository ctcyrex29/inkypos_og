import type { PrinterSettings, PrintJobKind, PrintTarget, ReceiptDocument } from '@inkypos/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Chip, ErrorText, Heading, Muted } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

type Width = ReceiptDocument['widthChars'];

interface Props {
  settings: PrinterSettings;
  width: Width;
  /** RawBT can be used on this device (Android). */
  rawBtAvailable: boolean;
  onSave: (settings: PrinterSettings, width: Width) => Promise<void>;
  /** Prints a test slip through the receipt printer as currently chosen on screen. */
  onTestPrint: (target: PrintTarget, width: Width) => Promise<void>;
}

const KINDS: { kind: PrintJobKind; title: string; hint: string }[] = [
  { kind: 'receipt', title: 'Receipts', hint: 'Sales and refunds.' },
  { kind: 'kitchen', title: 'Kitchen tickets', hint: 'Restaurant orders sent to the kitchen. Off if the kitchen uses the kitchen screen.' },
  { kind: 'report', title: 'Shift reports', hint: 'X and Z reports.' },
];

const TARGET_LABEL: Record<PrintTarget, string> = { system: 'System print', rawbt: 'RawBT', off: 'Off' };

const WIDTHS: { width: Width; label: string }[] = [
  { width: 32, label: '58 mm (32)' },
  { width: 42, label: '80 mm (42)' },
  { width: 48, label: '80 mm (48)' },
];

/** Which printer each kind of slip goes to on this till, the paper width, and a test print. */
export function PrinterScreen({ settings, width, rawBtAvailable, onSave, onTestPrint }: Props) {
  const colors = useColors();
  const [draft, setDraft] = useState(settings);
  const [paper, setPaper] = useState(width);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: done });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const usesRawBt = Object.values(draft).includes('rawbt');

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <Heading>Printing on this till</Heading>
        <Muted>
          {"System print uses the phone's or computer's print dialog. RawBT sends slips straight to a Bluetooth, USB or network thermal printer " +
            'through the free RawBT app on Android: install it from the Play Store and pair the printer in it first.'}
        </Muted>
        {!rawBtAvailable ? <Muted>RawBT is not available on this device (Android only).</Muted> : null}
      </Card>

      {KINDS.map(({ kind, title, hint }) => (
        <Card key={kind}>
          <Heading>{title}</Heading>
          <Muted>{hint}</Muted>
          <View style={styles.chips}>
            {(['system', 'rawbt', ...(kind === 'kitchen' ? (['off'] as const) : [])] as PrintTarget[])
              .filter((t) => t !== 'rawbt' || rawBtAvailable || draft[kind] === 'rawbt')
              .map((t) => (
                <Chip key={t} label={TARGET_LABEL[t]} selected={draft[kind] === t} onPress={() => setDraft({ ...draft, [kind]: t })} />
              ))}
          </View>
        </Card>
      ))}

      <Card>
        <Heading>Paper width</Heading>
        <View style={styles.chips}>
          {WIDTHS.map((w) => (
            <Chip key={w.width} label={w.label} selected={paper === w.width} onPress={() => setPaper(w.width)} />
          ))}
        </View>
        <Muted>58 mm printers fit 32 characters; most 80 mm printers fit 42 or 48. Use the test print to check.</Muted>
      </Card>

      {usesRawBt && !rawBtAvailable ? <Banner tone="warning" title="RawBT is chosen but this is not Android" body="Slips sent to RawBT will fail here." /> : null}
      {message ? message.ok ? <Banner tone="success" title={message.text} /> : <ErrorText>{message.text}</ErrorText> : null}
      <Button label="Save printer settings" busy={busy} onPress={() => void run(() => onSave(draft, paper), 'Printer settings saved.')} />
      <Button
        label="Print a test slip"
        tone="secondary"
        disabled={busy}
        onPress={() => void run(() => onTestPrint(draft.receipt, paper), 'Test slip sent. Check that the number line fits on one line.')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
