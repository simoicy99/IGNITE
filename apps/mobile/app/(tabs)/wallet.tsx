import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { walletApi } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { BalanceCard } from '../../src/components/BalanceCard';
import { getCurrentGeo } from '../../src/lib/geo';
import { TOP_UP_AMOUNTS_CENTS } from '@ignite/shared';

const TOP_UP_LABELS: Record<number, string> = {
  1000: '$10',
  2000: '$20',
  5000: '$50',
  10000: '$100',
  20000: '$200',
  50000: '$500',
  100000: '$1,000',
};

export default function WalletScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [balances, setBalances] = useState({ available: 0, locked: 0, pending: 0, total: 0 });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTopUpLoading, setIsTopUpLoading] = useState<number | null>(null);

  const loadData = useCallback(async (refresh = false) => {
    try {
      const [balanceRes, txRes] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(),
      ]);
      setBalances(balanceRes.data);
      setTransactions(txRes.data.items);
    } catch (err: any) {
      if (!refresh) Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Wallet</Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          Sign in to manage your balance, top up funds, and track transactions.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#FF4D4D', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 }}
          onPress={() => router.push('/auth/login')}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  const handleTopUp = async (amountCents: number) => {
    setIsTopUpLoading(amountCents);
    try {
      const geo = await getCurrentGeo();
      if (!geo) {
        Alert.alert(
          'Location Required',
          'Ignite needs your location to process a top-up. Please enable location services and ensure you are in CA, NY, or TX.'
        );
        return;
      }

      const res = await walletApi.topUp({ amountCents, geo });
      const { clientSecret, intentId } = res.data;

      // In a real app, you'd use the Stripe React Native SDK here to complete payment
      // For MVP: show a confirmation with the intent ID
      Alert.alert(
        'Top-Up Initiated',
        `Payment intent created: ${intentId}\n\nIn production, the Stripe payment sheet would open here.\n\nFor testing, your balance will be updated when the webhook fires.`,
        [{ text: 'OK' }]
      );

    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsTopUpLoading(null);
    }
  };

  const handleWithdraw = () => {
    Alert.prompt(
      'Withdraw Funds',
      `Available balance: $${(balances.available / 100).toFixed(2)}\n\nEnter amount to withdraw:`,
      async (input) => {
        if (!input) return;
        const dollars = parseFloat(input);
        if (isNaN(dollars) || dollars <= 0) {
          Alert.alert('Error', 'Invalid amount');
          return;
        }
        const amountCents = Math.round(dollars * 100);

        try {
          const geo = await getCurrentGeo();
          if (!geo) {
            Alert.alert('Location Required', 'Location required for withdrawal.');
            return;
          }

          await walletApi.withdraw({
            amountCents,
            geo,
            payoutMethod: { type: 'bank_transfer' },
          });

          Alert.alert('Withdrawal Submitted', 'Your withdrawal request has been submitted and will be processed within 1-3 business days.');
          loadData(true);
        } catch (err: any) {
          Alert.alert('Error', err.message);
        }
      },
      'plain-text',
      '',
      'decimal-pad'
    );
  };

  const formatEventType = (eventType: string) => {
    const labels: Record<string, string> = {
      TOP_UP: 'Top Up',
      MATCH_LOCK: 'Match Funded',
      MATCH_UNLOCK: 'Match Refund',
      MATCH_WIN_PENDING: 'Win (Pending)',
      MATCH_WIN_VERIFIED: 'Win Credited',
      MATCH_SETTLE_DEBIT: 'Match Settled',
      WITHDRAWAL_INITIATED: 'Withdrawal',
      WITHDRAWAL_REJECTED: 'Withdrawal Returned',
      DISPUTE_BOND_LOCK: 'Dispute Bond',
      DISPUTE_BOND_RELEASE: 'Bond Returned',
      DISPUTE_BOND_FORFEIT: 'Bond Forfeited',
      DISPUTE_BOND_AWARD: 'Bond Won',
    };
    return labels[eventType] ?? eventType;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#FF4D4D" />}
    >
      {/* Total Balance */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Balance</Text>
        <Text style={styles.totalAmount}>${(balances.total / 100).toFixed(2)}</Text>
      </View>

      {/* Sub-balances */}
      <View style={styles.balanceRow}>
        <BalanceCard
          label="Available"
          amountCents={balances.available}
          color="#4ADE80"
          subtitle="Ready to use"
        />
        <BalanceCard
          label="Locked"
          amountCents={balances.locked}
          color="#F59E0B"
          subtitle="In active matches"
        />
        <BalanceCard
          label="Pending"
          amountCents={balances.pending}
          color="#818CF8"
          subtitle="Awaiting verification"
        />
      </View>

      {/* Withdraw button */}
      {balances.available > 0 && (
        <TouchableOpacity style={styles.withdrawButton} onPress={handleWithdraw}>
          <Text style={styles.withdrawButtonText}>Withdraw Funds</Text>
        </TouchableOpacity>
      )}

      {/* Top Up section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Funds</Text>
        <View style={styles.topUpGrid}>
          {TOP_UP_AMOUNTS_CENTS.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.topUpButton,
                isTopUpLoading === amount && styles.topUpButtonLoading,
              ]}
              onPress={() => handleTopUp(amount)}
              disabled={isTopUpLoading !== null}
            >
              <Text style={styles.topUpButtonText}>
                {isTopUpLoading === amount ? '...' : TOP_UP_LABELS[amount]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Transaction history */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet</Text>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <Text style={styles.txType}>{formatEventType(tx.eventType)}</Text>
                <Text style={styles.txAccount}>{tx.accountType}</Text>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  tx.direction === 'CREDIT' ? styles.txCredit : styles.txDebit,
                ]}
              >
                {tx.direction === 'CREDIT' ? '+' : '-'}${(tx.amountCents / 100).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  totalCard: {
    backgroundColor: '#1A1A1A',
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  totalLabel: {
    color: '#888',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  totalAmount: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  balanceRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  withdrawButton: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4ADE80',
  },
  withdrawButtonText: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    margin: 16,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  topUpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topUpButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    minWidth: 80,
    alignItems: 'center',
  },
  topUpButtonLoading: {
    opacity: 0.5,
  },
  topUpButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    paddingVertical: 20,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  txLeft: {
    gap: 2,
  },
  txType: {
    color: '#DDD',
    fontSize: 14,
    fontWeight: '500',
  },
  txAccount: {
    color: '#555',
    fontSize: 12,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txCredit: {
    color: '#4ADE80',
  },
  txDebit: {
    color: '#FF4D4D',
  },
});
