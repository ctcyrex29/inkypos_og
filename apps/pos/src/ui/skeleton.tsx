import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { useColors, spacing, radius } from './theme';

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
    borderRadius: radius.md,
  },
});

export function Skeleton({ width = '100%', height = 20 }: { width?: string | number; height?: number }) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          backgroundColor: colors.border,
          opacity,
        },
      ]}
    />
  );
}

export function ListItemSkeleton() {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        padding: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Skeleton width={40} height={40} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Skeleton width="80%" height={16} />
          <Skeleton width="60%" height={12} />
        </View>
      </View>
    </View>
  );
}

export function CardSkeleton() {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      <Skeleton width="60%" height={16} />
      <Skeleton width="100%" height={12} />
      <Skeleton width="80%" height={12} />
    </View>
  );
}

export function ButtonSkeleton() {
  return <Skeleton width="100%" height={44} />;
}
