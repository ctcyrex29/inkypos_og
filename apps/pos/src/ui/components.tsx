import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ComponentRef, ReactNode, Ref, RefObject } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { elevation, fontSize, radius, spacing, useColors, type Colors } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const colors = useColors();
  return <Ionicons name={name} size={size} color={color ?? colors.text} />;
}

/** A scrolling page with the standard padding and width limit. */
export function Screen({ children, maxWidth = 640, contentStyle }: { children: ReactNode; maxWidth?: number; contentStyle?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.screen, { maxWidth }, contentStyle]}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
      {children}
    </Text>
  );
}

/** Small capitals above a group of things. */
export function SectionLabel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.section, { color: colors.textMuted }]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.muted, { color: colors.textMuted }]}>{children}</Text>;
}

/** What a Field's ref points at. */
export type FieldRef = ComponentRef<typeof TextInput>;

export function Field({ label, ref, ...props }: TextInputProps & { label: string; ref?: Ref<FieldRef> }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        {...props}
      />
    </View>
  );
}

/**
 * What a field really holds. Browsers (and some phone password managers) can
 * autofill a field without telling React, so the state stays empty while the
 * box looks filled; on the web the input element still has the value.
 */
export function fieldValue(ref: RefObject<FieldRef | null>, state: string): string {
  if (state) return state;
  const dom = ref.current as unknown as { value?: unknown } | null;
  return typeof dom?.value === 'string' ? dom.value : '';
}

type Tone = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';

function toneColors(tone: Tone, colors: Colors): { bg: string; fg: string; border?: string } {
  switch (tone) {
    case 'primary':
      return { bg: colors.primary, fg: colors.onPrimary };
    case 'accent':
      return { bg: colors.accent, fg: colors.onAccent };
    case 'danger':
      return { bg: colors.danger, fg: colors.onDanger };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primary };
    case 'secondary':
      return { bg: colors.surface, fg: colors.text, border: colors.border };
  }
}

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  tone = 'primary',
  icon,
  size = 'md',
  detail,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: Tone;
  icon?: IconName;
  size?: 'md' | 'lg';
  /** Second line on a large button (e.g. the amount on Charge). */
  detail?: string;
}) {
  const colors = useColors();
  const c = toneColors(tone, colors);
  const inactive = busy || disabled;
  const large = size === 'lg';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        { backgroundColor: c.bg },
        c.border ? { borderWidth: 1, borderColor: c.border } : null,
        { opacity: inactive ? 0.45 : pressed ? 0.75 : 1, transform: [{ scale: pressed && !inactive ? 0.98 : 1 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={large ? 22 : 19} color={c.fg} /> : null}
          <Text style={[styles.buttonLabel, large && styles.buttonLabelLarge, { color: c.fg }]}>{label}</Text>
          {detail ? <Text style={[styles.buttonLabel, large && styles.buttonLabelLarge, { color: c.fg, marginLeft: 'auto' }]}>{detail}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

/** A round icon-only button. */
export function IconButton({ icon, label, onPress, tone = 'secondary', size = 44 }: { icon: IconName; label: string; onPress: () => void; tone?: Tone; size?: number }) {
  const colors = useColors();
  const c = toneColors(tone, colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, opacity: pressed ? 0.7 : 1 },
        c.border ? { borderWidth: 1, borderColor: c.border } : null,
      ]}
    >
      <Ionicons name={icon} size={size * 0.48} color={c.fg} />
    </Pressable>
  );
}

const BANNER_ICON: Record<'success' | 'warning' | 'danger', IconName> = {
  success: 'checkmark-circle',
  warning: 'alert-circle',
  danger: 'close-circle',
};

export function Banner({ tone, title, body }: { tone: 'success' | 'warning' | 'danger'; title: string; body?: string }) {
  const colors = useColors();
  const color = colors[tone];
  return (
    // A light tint of the tone behind the text (hex colour + 8% alpha).
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: `${color}14`, borderColor: `${color}40` }]}>
      <Ionicons name={BANNER_ICON[tone]} size={22} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        {body ? <Text style={[styles.bannerBody, { color: colors.text }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

/** One choice among several, shown as a pill; selected chips are filled. */
export function Chip({ label, selected, onPress, role = 'radio' }: { label: string; selected: boolean; onPress: () => void; role?: 'radio' | 'tab' }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: fontSize.sm }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="alert" style={[styles.muted, { color: colors.danger }]}>
      {children}
    </Text>
  );
}

/** A big square-ish action on a grid (home screen). */
export function Tile({ icon, label, detail, onPress, disabled = false, tint }: { icon: IconName; label: string; detail?: string; onPress: () => void; disabled?: boolean; tint?: string }) {
  const colors = useColors();
  const color = tint ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A tappable row in a list: icon, title, subtitle, chevron. */
export function ListRow({ icon, title, subtitle, right, onPress }: { icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={19} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/** Initials in a circle. */
export function Avatar({ name, size = 48, tone = 'primary' }: { name: string; size?: number; tone?: 'primary' | 'accent' }) {
  const colors = useColors();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const bg = tone === 'accent' ? colors.accent : colors.primarySoft;
  const fg = tone === 'accent' ? colors.onAccent : colors.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

/** A small rounded label: "Synced", "Offline", "3 waiting". */
export function Pill({ label, color, icon }: { label: string; color: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F` }]}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : <View style={[styles.pillDot, { backgroundColor: color }]} />}
      <Text style={{ color, fontSize: fontSize.xs, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.lg, width: '100%', alignSelf: 'center', paddingBottom: spacing.xxxl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...elevation },
  heading: { fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  section: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: spacing.xs },
  muted: { fontSize: fontSize.sm, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.md, minHeight: 50 },
  button: { borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  buttonLarge: { minHeight: 60, borderRadius: radius.lg, paddingHorizontal: spacing.xl },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch', justifyContent: 'center' },
  buttonLabel: { fontSize: fontSize.md, fontWeight: '700' },
  buttonLabelLarge: { fontSize: fontSize.lg },
  banner: { flexDirection: 'row', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'flex-start' },
  bannerTitle: { fontSize: fontSize.md, fontWeight: '700' },
  bannerBody: { fontSize: fontSize.sm, lineHeight: 20 },
  chip: { borderWidth: 1.5, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 40, justifyContent: 'center' },
  tile: { flexGrow: 1, flexBasis: '45%', minWidth: 140, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: 6, ...elevation },
  tileIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  tileLabel: { fontSize: fontSize.md, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
});
