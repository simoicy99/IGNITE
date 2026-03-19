import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { matchesApi, feedApi, walletApi } from '../../src/lib/api';
import { getCurrentGeo } from '../../src/lib/geo';
import {
  TOP_UP_AMOUNTS_CENTS,
  MIN_STAKE_CENTS,
  MAX_STAKE_CENTS,
  GAMES,
  NBA2K_PLATFORMS,
} from '@ignite/shared';

const STAKE_OPTIONS_CENTS = [1000, 2000, 5000, 10000, 25000, 50000, 100000];

export default function CreateMatchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<'CHESS' | 'NBA2K'>('CHESS');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedStake, setSelectedStake] = useState<number>(1000);
  const [selectedPlatform, setSelectedPlatform] = useState<'PS5' | 'XBOX' | null>(null);
  const [body, setBody] = useState('');
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Auto-select first template for selected game
    const gameTemplates = templates.filter((t) => t.game === selectedGame);
    if (gameTemplates.length > 0) {
      setSelectedTemplate(gameTemplates[0].id);
    }
  }, [selectedGame, templates]);

  if (!user) {
    router.replace('/auth/login');
    return null;
  }

  async function loadData() {
    try {
      const [templatesRes, balanceRes] = await Promise.all([
        matchesApi.getTemplates(),
        walletApi.getBalance(),
      ]);
      setTemplates(templatesRes.data);
      setAvailableBalance(balanceRes.data.available);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleCreate() {
    if (!selectedTemplate) {
      Alert.alert('Error', 'Please select a game template');
      return;
    }

    if (selectedGame === 'NBA2K' && !selectedPlatform) {
      Alert.alert('Error', 'Please select a platform (PS5 or Xbox) for NBA 2K');
      return;
    }

    if (availableBalance < selectedStake) {
      Alert.alert(
        'Insufficient Funds',
        `You need $${(selectedStake / 100).toFixed(2)} to create this challenge. Your available balance is $${(availableBalance / 100).toFixed(2)}. Please top up your wallet first.`
      );
      return;
    }

    setIsLoading(true);
    try {
      const geo = await getCurrentGeo();
      if (!geo) {
        Alert.alert(
          'Location Required',
          'Ignite needs your location to create a challenge. Please enable location services and ensure you are in CA, NY, or TX.'
        );
        return;
      }

      await feedApi.createChallenge({
        game: selectedGame,
        templateId: selectedTemplate,
        stakeCents: selectedStake,
        platform: selectedPlatform ?? undefined,
        body: body.trim() || undefined,
        geo,
      });

      Alert.alert(
        'Challenge Posted!',
        `Your $${(selectedStake / 100).toFixed(0)} challenge is live. Opponents can now accept.`,
        [{ text: 'View Feed', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const gameTemplates = templates.filter((t) => t.game === selectedGame);

  return (
    <ScrollView style={styles.container}>
      {/* Balance Info */}
      <View style={styles.balanceInfo}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>${(availableBalance / 100).toFixed(2)}</Text>
      </View>

      {/* Game Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Game</Text>
        <View style={styles.gameRow}>
          <TouchableOpacity
            style={[styles.gameCard, selectedGame === 'CHESS' && styles.gameCardActive]}
            onPress={() => setSelectedGame('CHESS')}
          >
            <Text style={styles.gameEmoji}>♟️</Text>
            <Text style={[styles.gameName, selectedGame === 'CHESS' && styles.gameNameActive]}>
              Chess
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gameCard, selectedGame === 'NBA2K' && styles.gameCardActive]}
            onPress={() => setSelectedGame('NBA2K')}
          >
            <Text style={styles.gameEmoji}>🏀</Text>
            <Text style={[styles.gameName, selectedGame === 'NBA2K' && styles.gameNameActive]}>
              NBA 2K
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Template Selection */}
      {gameTemplates.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Mode</Text>
          {gameTemplates.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.templateOption, selectedTemplate === t.id && styles.templateOptionActive]}
              onPress={() => setSelectedTemplate(t.id)}
            >
              <Text style={[styles.templateName, selectedTemplate === t.id && styles.templateNameActive]}>
                {t.name}
              </Text>
              {t.metadata?.description && (
                <Text style={styles.templateDesc}>{t.metadata.description}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Platform (NBA 2K only) */}
      {selectedGame === 'NBA2K' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform</Text>
          <View style={styles.platformRow}>
            {(['PS5', 'XBOX'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.platformCard, selectedPlatform === p && styles.platformCardActive]}
                onPress={() => setSelectedPlatform(p)}
              >
                <Text style={[styles.platformName, selectedPlatform === p && styles.platformNameActive]}>
                  {p === 'PS5' ? 'PlayStation 5' : 'Xbox'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Stake Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stake Amount</Text>
        <Text style={styles.sectionSubtitle}>You both pay this — winner takes the pot</Text>
        <View style={styles.stakeGrid}>
          {STAKE_OPTIONS_CENTS.map((stake) => {
            const canAfford = availableBalance >= stake;
            return (
              <TouchableOpacity
                key={stake}
                style={[
                  styles.stakeOption,
                  selectedStake === stake && styles.stakeOptionActive,
                  !canAfford && styles.stakeOptionDisabled,
                ]}
                onPress={() => {
                  if (canAfford) setSelectedStake(stake);
                }}
                disabled={!canAfford}
              >
                <Text
                  style={[
                    styles.stakeAmount,
                    selectedStake === stake && styles.stakeAmountActive,
                    !canAfford && styles.stakeAmountDisabled,
                  ]}
                >
                  ${(stake / 100).toFixed(0)}
                </Text>
                <Text style={styles.stakePot}>
                  Pot: ${(stake * 2 / 100).toFixed(0)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Optional message */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trash Talk (Optional)</Text>
        <TextInput
          style={styles.bodyInput}
          value={body}
          onChangeText={setBody}
          placeholder="Leave a message for your opponent..."
          placeholderTextColor="#444"
          multiline
          maxLength={500}
        />
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Your stake</Text>
          <Text style={styles.summaryValue}>${(selectedStake / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total pot</Text>
          <Text style={styles.summaryValue}>${(selectedStake * 2 / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Platform fee (5%)</Text>
          <Text style={styles.summaryFee}>-${(selectedStake * 2 * 0.05 / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.summaryTotalLabel}>Winner receives</Text>
          <Text style={styles.summaryTotalValue}>
            ${(selectedStake * 2 * 0.95 / 100).toFixed(2)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.createButton, isLoading && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={isLoading}
      >
        <Text style={styles.createButtonText}>
          {isLoading ? 'Posting Challenge...' : `Post Challenge — $${(selectedStake / 100).toFixed(0)}`}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  balanceInfo: {
    backgroundColor: '#1A1A1A',
    margin: 16,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#888',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#4ADE80',
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 12,
    marginBottom: 10,
  },
  gameRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  gameCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  gameCardActive: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D11',
  },
  gameEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  gameName: {
    color: '#888',
    fontWeight: '600',
  },
  gameNameActive: {
    color: '#FF4D4D',
  },
  templateOption: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  templateOptionActive: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D11',
  },
  templateName: {
    color: '#DDD',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  templateNameActive: {
    color: '#FF4D4D',
  },
  templateDesc: {
    color: '#666',
    fontSize: 12,
  },
  platformRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  platformCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  platformCardActive: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D11',
  },
  platformName: {
    color: '#888',
    fontWeight: '600',
  },
  platformNameActive: {
    color: '#FF4D4D',
  },
  stakeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  stakeOption: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2A2A',
  },
  stakeOptionActive: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D11',
  },
  stakeOptionDisabled: {
    opacity: 0.3,
  },
  stakeAmount: {
    color: '#DDD',
    fontSize: 18,
    fontWeight: '700',
  },
  stakeAmountActive: {
    color: '#FF4D4D',
  },
  stakeAmountDisabled: {
    color: '#444',
  },
  stakePot: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  bodyInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  summary: {
    margin: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 14,
  },
  summaryValue: {
    color: '#DDD',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryFee: {
    color: '#888',
    fontSize: 14,
  },
  summaryTotal: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  summaryTotalLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: '#4ADE80',
    fontSize: 18,
    fontWeight: '700',
  },
  createButton: {
    margin: 16,
    backgroundColor: '#FF4D4D',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
