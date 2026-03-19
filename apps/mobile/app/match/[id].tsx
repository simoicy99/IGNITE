import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Linking,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { matchesApi, disputesApi } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import * as ImagePicker from 'expo-image-picker';
import { calcWinnerPayout, DISPUTE_WINDOW_MINUTES } from '@ignite/shared';

export default function MatchRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [match, setMatch] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Chess state
  const [chessLink, setChessLink] = useState('');
  const [chessLinkSubmitted, setChessLinkSubmitted] = useState(false);

  // NBA 2K state
  const [myScore, setMyScore] = useState('');
  const [opponentScore, setOpponentScore] = useState('');
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);

  // Dispute state
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  const loadMatch = useCallback(async (refresh = false) => {
    try {
      const res = await matchesApi.getMatch(id!);
      setMatch(res.data);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadMatch(true);
  };

  const isCreator = match?.creatorId === user?.id;
  const isAccepter = match?.accepterId === user?.id;
  const isParticipant = isCreator || isAccepter;
  const opponentId = isCreator ? match?.accepterId : match?.creatorId;
  const opponent = isCreator ? match?.accepter : match?.creator;

  // Chess: submit link
  async function handleSubmitChessLink() {
    if (!chessLink.trim()) return;
    try {
      await matchesApi.submitChessLink(id!, chessLink.trim());
      setChessLinkSubmitted(true);
      Alert.alert('Link Submitted', 'Your chess game link has been submitted.');
      loadMatch(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  // Chess: submit result
  async function handleSubmitChessResult(result: 'I_WON' | 'I_LOST') {
    Alert.alert(
      'Confirm Result',
      `You are reporting: ${result === 'I_WON' ? 'I Won' : 'I Lost'}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const res = await matchesApi.submitChessResult(id!, result);
              Alert.alert('Result Submitted', res.message ?? 'Result recorded.');
              loadMatch(true);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }

  // NBA 2K: pick proof image
  async function handlePickProof() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProofImageUri(result.assets[0].uri);
    }
  }

  // NBA 2K: submit result
  async function handleSubmitNba2kResult(myWon: boolean) {
    if (!myScore || !opponentScore) {
      Alert.alert('Error', 'Please enter both scores');
      return;
    }

    if (!proofImageUri) {
      Alert.alert('Error', 'Please upload a screenshot as proof');
      return;
    }

    // In production, upload image to S3 first
    const mockProofUrl = `https://proofs.ignite.gg/mock/${id}/${Date.now()}.jpg`;

    try {
      await matchesApi.submitNba2kResult(id!, {
        result: myWon ? 'I_WON' : 'I_LOST',
        myScore: parseInt(myScore),
        opponentScore: parseInt(opponentScore),
        proofUrl: mockProofUrl,
      });
      Alert.alert(
        'Result Submitted',
        `Your result has been submitted. Your opponent has ${DISPUTE_WINDOW_MINUTES} minutes to dispute.`
      );
      loadMatch(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  // NBA 2K: confirm result
  async function handleConfirmNba2kResult() {
    Alert.alert(
      'Confirm Result',
      'Are you confirming the submitted result? The match will be settled immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await matchesApi.confirmNba2kResult(id!);
              Alert.alert('Confirmed!', 'Match settled. Winnings will be credited shortly.');
              loadMatch(true);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }

  // Open dispute
  async function handleOpenDispute() {
    if (!disputeReason.trim() || disputeReason.length < 10) {
      Alert.alert('Error', 'Please provide a detailed reason for the dispute (min 10 characters).');
      return;
    }

    try {
      if (match.game === 'NBA2K') {
        await matchesApi.disputeNba2kResult(id!, disputeReason);
      } else {
        await disputesApi.openDispute(id!, disputeReason);
      }
      setShowDisputeForm(false);
      Alert.alert('Dispute Opened', 'An admin will review within 24 hours.');
      loadMatch(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading match...</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Match not found</Text>
      </View>
    );
  }

  const statusColors: Record<string, string> = {
    CREATED: '#888',
    FUNDED: '#F59E0B',
    ACCEPTED: '#818CF8',
    IN_PROGRESS: '#3B82F6',
    SUBMITTED: '#F59E0B',
    VERIFIED: '#10B981',
    SETTLED: '#4ADE80',
    DISPUTED: '#EF4444',
    RESOLVED: '#6B7280',
    CANCELED: '#6B7280',
  };

  const isChess = match.game === 'CHESS';
  const potCents = match.stakeCents * 2;
  const payoutCents = calcWinnerPayout(match.stakeCents);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#FF4D4D" />}
    >
      {/* Match Header */}
      <View style={styles.matchHeader}>
        <Text style={styles.gameEmoji}>{isChess ? '♟️' : '🏀'}</Text>
        <Text style={styles.gameName}>
          {isChess ? 'Chess' : 'NBA 2K'}{match.platform ? ` (${match.platform})` : ''}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColors[match.status]}22`, borderColor: `${statusColors[match.status]}44` }]}>
          <Text style={[styles.statusText, { color: statusColors[match.status] }]}>
            {match.status}
          </Text>
        </View>
      </View>

      {/* Players */}
      <View style={styles.playersRow}>
        <View style={styles.playerCard}>
          <View style={[styles.playerAvatar, isCreator && styles.playerAvatarSelf]}>
            <Text style={styles.playerAvatarText}>{match.creator.handle[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.playerHandle}>@{match.creator.handle}</Text>
          {isCreator && <Text style={styles.youLabel}>You</Text>}
        </View>

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
          <Text style={styles.stakeText}>${(match.stakeCents / 100).toFixed(0)} each</Text>
          <Text style={styles.potText}>🏆 ${(payoutCents / 100).toFixed(0)}</Text>
        </View>

        <View style={styles.playerCard}>
          {match.accepter ? (
            <>
              <View style={[styles.playerAvatar, isAccepter && styles.playerAvatarSelf]}>
                <Text style={styles.playerAvatarText}>{match.accepter.handle[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.playerHandle}>@{match.accepter.handle}</Text>
              {isAccepter && <Text style={styles.youLabel}>You</Text>}
            </>
          ) : (
            <View style={styles.waitingOpponent}>
              <Text style={styles.waitingText}>Waiting...</Text>
            </View>
          )}
        </View>
      </View>

      {/* Match Actions (only for participants) */}
      {isParticipant && (
        <View style={styles.actionsSection}>
          {/* CHESS FLOW */}
          {isChess && ['ACCEPTED', 'IN_PROGRESS'].includes(match.status) && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Step 1: Submit Chess Game Link</Text>
              <Text style={styles.actionSubtitle}>
                Paste your Chess.com or Lichess game link
              </Text>
              {match.chessLink ? (
                <TouchableOpacity onPress={() => Linking.openURL(match.chessLink)}>
                  <Text style={styles.chesslinkText}>{match.chessLink}</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    value={chessLink}
                    onChangeText={setChessLink}
                    placeholder="https://chess.com/game/..."
                    placeholderTextColor="#444"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={styles.actionButton} onPress={handleSubmitChessLink}>
                    <Text style={styles.actionButtonText}>Submit Link</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {isChess && ['IN_PROGRESS', 'SUBMITTED'].includes(match.status) && match.chessLink && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Step 2: Submit Your Result</Text>
              <Text style={styles.actionSubtitle}>
                Both players must submit. Results are compared for agreement.
              </Text>
              <View style={styles.resultButtons}>
                <TouchableOpacity
                  style={[styles.resultButton, styles.wonButton]}
                  onPress={() => handleSubmitChessResult('I_WON')}
                >
                  <Text style={styles.resultButtonText}>I Won ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultButton, styles.lostButton]}
                  onPress={() => handleSubmitChessResult('I_LOST')}
                >
                  <Text style={styles.resultButtonText}>I Lost ✗</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* NBA 2K FLOW */}
          {!isChess && ['ACCEPTED', 'IN_PROGRESS'].includes(match.status) && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Submit Result</Text>
              <Text style={styles.actionSubtitle}>
                Upload a screenshot and enter the final scores
              </Text>

              <View style={styles.scoreRow}>
                <View style={styles.scoreField}>
                  <Text style={styles.scoreLabel}>My Score</Text>
                  <TextInput
                    style={styles.scoreInput}
                    value={myScore}
                    onChangeText={setMyScore}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#444"
                  />
                </View>
                <Text style={styles.scoreDash}>—</Text>
                <View style={styles.scoreField}>
                  <Text style={styles.scoreLabel}>Their Score</Text>
                  <TextInput
                    style={styles.scoreInput}
                    value={opponentScore}
                    onChangeText={setOpponentScore}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#444"
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.proofButton} onPress={handlePickProof}>
                <Text style={styles.proofButtonText}>
                  {proofImageUri ? '✓ Screenshot Selected' : '📷 Upload Screenshot'}
                </Text>
              </TouchableOpacity>

              <View style={styles.resultButtons}>
                <TouchableOpacity
                  style={[styles.resultButton, styles.wonButton]}
                  onPress={() => handleSubmitNba2kResult(true)}
                >
                  <Text style={styles.resultButtonText}>I Won</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultButton, styles.lostButton]}
                  onPress={() => handleSubmitNba2kResult(false)}
                >
                  <Text style={styles.resultButtonText}>I Lost</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* NBA 2K: confirm or dispute */}
          {!isChess && match.status === 'SUBMITTED' && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Opponent submitted a result</Text>
              <Text style={styles.actionSubtitle}>
                You have {DISPUTE_WINDOW_MINUTES} minutes to confirm or dispute
              </Text>
              <View style={styles.resultButtons}>
                <TouchableOpacity style={[styles.resultButton, styles.wonButton]} onPress={handleConfirmNba2kResult}>
                  <Text style={styles.resultButtonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultButton, styles.lostButton]}
                  onPress={() => setShowDisputeForm(true)}
                >
                  <Text style={styles.resultButtonText}>Dispute</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Dispute form */}
          {showDisputeForm && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Open Dispute</Text>
              <Text style={styles.actionSubtitle}>
                A 10% bond (${(potCents * 0.1 / 100).toFixed(2)}) will be locked. You'll get it back if the dispute is upheld.
              </Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="Describe why you're disputing this result..."
                placeholderTextColor="#444"
                multiline
              />
              <View style={styles.resultButtons}>
                <TouchableOpacity style={[styles.resultButton, styles.lostButton]} onPress={handleOpenDispute}>
                  <Text style={styles.resultButtonText}>File Dispute</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultButton, { backgroundColor: '#2A2A2A' }]}
                  onPress={() => setShowDisputeForm(false)}
                >
                  <Text style={styles.resultButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Settled/Resolved State */}
      {['SETTLED', 'RESOLVED'].includes(match.status) && (
        <View style={[styles.actionCard, styles.settledCard]}>
          <Text style={styles.settledTitle}>Match Complete</Text>
          <Text style={styles.settledSubtitle}>
            Winnings have been credited to the winner's wallet.
          </Text>
        </View>
      )}

      {/* Disputed State */}
      {match.status === 'DISPUTED' && match.dispute && (
        <View style={[styles.actionCard, { borderColor: '#EF444444' }]}>
          <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Under Review</Text>
          <Text style={styles.actionSubtitle}>
            An admin is reviewing this dispute. Decision within 24 hours.
          </Text>
          {match.dispute.reason && (
            <Text style={styles.disputeReason}>"{match.dispute.reason}"</Text>
          )}
        </View>
      )}

      {/* Match Details */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Match Details</Text>
        <DetailRow label="Game" value={`${isChess ? 'Chess' : 'NBA 2K'}${match.platform ? ` · ${match.platform}` : ''}`} />
        <DetailRow label="Mode" value={match.template?.name ?? 'Standard'} />
        <DetailRow label="Stake" value={`$${(match.stakeCents / 100).toFixed(2)} per player`} />
        <DetailRow label="Pot" value={`$${(potCents / 100).toFixed(2)}`} />
        <DetailRow label="Winner Gets" value={`$${(payoutCents / 100).toFixed(2)} (after 5% fee)`} />
        <DetailRow label="Match ID" value={match.id.slice(0, 8) + '...'} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  label: { color: '#888', fontSize: 14 },
  value: { color: '#DDD', fontSize: 14, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F0F' },
  loadingText: { color: '#888' },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  gameEmoji: { fontSize: 28 },
  gameName: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 0,
    gap: 8,
  },
  playerCard: { flex: 1, alignItems: 'center', gap: 4 },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarSelf: { backgroundColor: '#FF4D4D' },
  playerAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  playerHandle: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  youLabel: { color: '#FF4D4D', fontSize: 11, fontWeight: '700' },
  waitingOpponent: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
  },
  waitingText: { color: '#555', fontSize: 10 },
  vsContainer: { alignItems: 'center', gap: 2 },
  vsText: { color: '#666', fontWeight: '900', fontSize: 16 },
  stakeText: { color: '#888', fontSize: 11 },
  potText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  actionsSection: { padding: 16, gap: 12 },
  actionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 10,
  },
  actionTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionSubtitle: { color: '#888', fontSize: 13 },
  chesslinkText: { color: '#818CF8', fontSize: 13 },
  input: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  actionButton: {
    backgroundColor: '#FF4D4D',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontWeight: '700' },
  resultButtons: { flexDirection: 'row', gap: 10 },
  resultButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  wonButton: { backgroundColor: '#22C55E' },
  lostButton: { backgroundColor: '#EF4444' },
  resultButtonText: { color: '#fff', fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreField: { flex: 1 },
  scoreLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  scoreInput: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  scoreDash: { color: '#666', fontSize: 20 },
  proofButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  proofButtonText: { color: '#888', fontWeight: '600' },
  settledCard: { margin: 16, borderColor: '#4ADE8044', backgroundColor: '#4ADE8011' },
  settledTitle: { color: '#4ADE80', fontSize: 18, fontWeight: '700' },
  settledSubtitle: { color: '#888', fontSize: 14 },
  disputeReason: { color: '#DDD', fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  detailsSection: { margin: 16, marginTop: 0 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
});
