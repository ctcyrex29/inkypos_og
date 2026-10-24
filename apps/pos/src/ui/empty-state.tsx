import { View, Text, StyleSheet } from 'react-native';
import { useColors, spacing, fontSize, radius } from './theme';
import { Button } from './components';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
});

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {description}
        </Text>
      )}
      {action && (
        <Button label={action.label} onPress={action.onPress} tone="primary" />
      )}
    </View>
  );
}

/** Common empty state templates */

export function EmptyListState({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      title="No items"
      description="Nothing to show here yet"
      action={onAdd ? { label: 'Add item', onPress: onAdd } : undefined}
    />
  );
}

export function EmptySearchState({ query }: { query: string }) {
  return (
    <EmptyState
      title="No results"
      description={`Nothing matches "${query}". Try a different search.`}
    />
  );
}

export function EmptyErrorState({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Something went wrong"
      description={error || 'An unexpected error occurred.'}
      action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}
