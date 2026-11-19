import Ionicons from '@expo/vector-icons/Ionicons';
import type { SignInResult, StaffInfo } from '@inkypos/core';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

interface Props {
  /** Active staff on this till; null while loading. */
  staff: StaffInfo[] | null;
  /** The person who last unlocked this till: asked for their PIN straight away, like a phone's lock screen. */
  remembered?: StaffInfo | null;
  signIn: (userId: string, pin: string) => Promise<SignInResult>;
  onSignedIn: (staff: StaffInfo) => void;
  formatTime?: (iso: string) => string;
  /** Shown under the keypad: connection and sync state, Sync now. */
  footer?: ReactNode;
}

const ROLE_LABEL: Record<StaffInfo['role'], string> = { manager: 'Manager', cashier: 'Cashier' };
const MAX_PIN = 6;
const MIN_PIN = 4;

const defaultFormatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function failureMessage(result: Exclude<SignInResult, { ok: true }>, formatTime: (iso: string) => string): string {
  switch (result.reason) {
    case 'wrong_pin':
      if (result.lockedUntil) return `Wrong PIN. Too many attempts: try again at ${formatTime(result.lockedUntil)}.`;
      return result.attemptsBeforeLock > 0
        ? `Wrong PIN. ${result.attemptsBeforeLock} more ${result.attemptsBeforeLock === 1 ? 'try' : 'tries'} before a short lockout.`
        : 'Wrong PIN.';
    case 'locked':
      return `Too many wrong PINs. Try again at ${formatTime(result.lockedUntil)}.`;
    case 'no_pin':
      return 'No PIN has been set for you yet. Ask a manager to set one.';
    case 'inactive':
    case 'unknown':
      return 'You can no longer sign in on this till. Ask a manager.';
  }
}

/**
 * The till's lock screen. Pick your name once; after that the till remembers
 * you and only asks for your PIN. Works with no internet at all: PINs are
 * checked against the hashes downloaded during sync.
 */
export function SignInScreen({ staff, remembered = null, signIn, onSignedIn, formatTime = defaultFormatTime, footer }: Props) {
  const colors = useColors();
  // The remembered person is used only while they are still active on this till.
  const rememberedNow = remembered && staff ? (staff.find((s) => s.id === remembered.id) ?? null) : null;
  const [choice, setChoice] = useState<StaffInfo | null | 'list'>(null);
  const selected = choice === 'list' ? null : (choice ?? rememberedNow);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (person: StaffInfo | null) => {
    setChoice(person ?? 'list');
    setPin('');
    setError(null);
  };

  const submit = async () => {
    if (!selected || busy) return;
    if (pin.length < MIN_PIN) {
      setError('Enter your 4 to 6 digit PIN.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(selected.id, pin);
      if (result.ok) {
        onSignedIn(result.staff);
        return;
      }
      setPin('');
      setError(failureMessage(result, formatTime));
    } catch (e) {
      setPin('');
      setError(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (busy) return;
    setError(null);
    if (key === 'back') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < MAX_PIN ? p + key : p));
  };

  let body: ReactNode;
  if (staff === null) {
    body = <ActivityIndicator color={colors.onHero} size="large" />;
  } else if (staff.length === 0) {
    body = (
      <View style={styles.center}>
        <Ionicons name="people-outline" size={44} color={colors.onHeroMuted} />
        <Text style={[styles.title, { color: colors.onHero }]}>No staff on this till yet</Text>
        <Text style={[styles.subtitle, { color: colors.onHeroMuted }]}>
          Connect to the internet once so the till can download your team. A manager sets staff PINs in the back office.
        </Text>
      </View>
    );
  } else if (!selected) {
    body = (
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.onHero }]}>Who is selling?</Text>
        <Text style={[styles.subtitle, { color: colors.onHeroMuted }]}>Tap your name. The till remembers you next time.</Text>
        <View style={styles.people}>
          {staff.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`${person.name} · ${ROLE_LABEL[person.role]}`}
              onPress={() => choose(person)}
              style={({ pressed }) => [styles.person, { backgroundColor: 'rgba(255,255,255,0.08)', opacity: pressed ? 0.7 : 1 }]}
            >
              <Avatar name={person.name} size={52} tone="accent" />
              <Text style={[styles.personName, { color: colors.onHero }]} numberOfLines={1}>
                {person.name}
              </Text>
              <Text style={{ color: colors.onHeroMuted, fontSize: fontSize.xs }}>{ROLE_LABEL[person.role]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  } else {
    body = (
      <View style={styles.center}>
        <Avatar name={selected.name} size={72} tone="accent" />
        <Text style={[styles.title, { color: colors.onHero }]}>{selected.name}</Text>
        {selected.pin ? (
          <>
            <Text style={[styles.subtitle, { color: colors.onHeroMuted }]}>Enter your PIN to unlock</Text>
            <View accessible accessibilityLabel="PIN" accessibilityValue={{ text: `${pin.length} digits entered` }} style={styles.dots}>
              {Array.from({ length: Math.max(MIN_PIN, Math.min(MAX_PIN, pin.length + (pin.length < MAX_PIN ? 1 : 0))) }, (_, i) => (
                <View key={i} style={[styles.dot, { borderColor: colors.onHero }, i < pin.length && { backgroundColor: colors.accent, borderColor: colors.accent }]} />
              ))}
            </View>
            <Text accessibilityRole={error ? 'alert' : undefined} style={[styles.error, { color: busy ? colors.onHeroMuted : '#FFB4AB' }]}>
              {busy ? 'Checking PIN…' : (error ?? ' ')}
            </Text>
            <Keypad onKey={press} onSubmit={() => void submit()} busy={busy} canSubmit={pin.length >= MIN_PIN} />
          </>
        ) : (
          <Text style={[styles.subtitle, { color: colors.onHeroMuted }]}>No PIN has been set for you yet. Ask a manager to set one.</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Someone else" onPress={() => choose(null)} hitSlop={10} style={styles.link}>
          <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSize.md }}>{`Not ${selected.name.split(' ')[0]}? Switch user`}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.hero }]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={require('../../../assets/inkypos-logo.png')} style={styles.logo} accessibilityLabel="InkyPOS logo" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="lock-closed" size={14} color={colors.onHeroMuted} />
              <Text style={{ color: colors.onHeroMuted, fontSize: fontSize.sm, fontWeight: '600' }}>Till locked</Text>
            </View>
          </View>
          {body}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'] as const;

function Keypad({ onKey, onSubmit, busy, canSubmit }: { onKey: (key: string) => void; onSubmit: () => void; busy: boolean; canSubmit: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.keypad}>
      {KEYS.map((key) => {
        if (key === 'ok') {
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ busy }}
              onPress={onSubmit}
              style={({ pressed }) => [styles.key, { backgroundColor: canSubmit ? colors.accent : 'rgba(255,255,255,0.08)', opacity: pressed ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="arrow-forward" size={28} color={canSubmit ? colors.onAccent : colors.onHeroMuted} />}
            </Pressable>
          );
        }
        if (key === 'back') {
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel="Delete digit" onPress={() => onKey('back')} style={({ pressed }) => [styles.key, { opacity: pressed ? 0.5 : 1 }]}>
              <Ionicons name="backspace-outline" size={26} color={colors.onHero} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key}
            onPress={() => onKey(key)}
            style={({ pressed }) => [styles.key, { backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)' }]}
          >
            <Text style={[styles.keyText, { color: colors.onHero }]}>{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl, maxWidth: 480, width: '100%', alignSelf: 'center', justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: '#FFFFFF' },
  center: { alignItems: 'center', gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
  people: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: spacing.md },
  person: { width: 132, alignItems: 'center', gap: 6, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm, borderRadius: radius.lg },
  personName: { fontSize: fontSize.md, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm, minHeight: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  error: { fontSize: fontSize.sm, textAlign: 'center', minHeight: 20, fontWeight: '600' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.lg, width: 300 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 30, fontWeight: '500' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, padding: spacing.sm },
  footer: { alignItems: 'center', gap: spacing.sm },
});
