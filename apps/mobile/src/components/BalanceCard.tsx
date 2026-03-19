import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BalanceCardProps {
  label: string;
  amountCents: number;
  color?: string;
  subtitle?: string;
}

export function BalanceCard({ label, amountCents, color = '#4ADE80', subtitle }: BalanceCardProps) {
  const dollars = (amountCents / 100).toFixed(2);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.amount, { color }]}>${dollars}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    margin: 4,
    alignItems: 'center',
  },
  label: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
});
