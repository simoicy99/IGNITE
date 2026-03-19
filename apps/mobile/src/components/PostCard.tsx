import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

interface Post {
  id: string;
  type: 'CHALLENGE' | 'SOCIAL';
  body: string | null;
  user: { id: string; handle: string };
  match?: {
    id: string;
    game: string;
    stakeCents: number;
    status: string;
    platform?: string;
    creator: { handle: string };
  } | null;
  commentCount: number;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
  onAccept?: (matchId: string) => void;
}

export function PostCard({ post, onAccept }: PostCardProps) {
  const router = useRouter();
  const isChallenge = post.type === 'CHALLENGE';

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    return `${Math.floor(diffHrs / 24)}d`;
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => post.match && router.push(`/match/${post.match.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.user.handle[0].toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.handle}>@{post.user.handle}</Text>
          <Text style={styles.time}>{formatTime(post.createdAt)}</Text>
        </View>
        {isChallenge && (
          <View style={styles.challengeBadge}>
            <Text style={styles.challengeBadgeText}>
              {post.match?.game === 'NBA2K' ? '🏀' : '♟️'} CHALLENGE
            </Text>
          </View>
        )}
      </View>

      {post.body && <Text style={styles.body}>{post.body}</Text>}

      {isChallenge && post.match && (
        <View style={styles.matchInfo}>
          <View style={styles.matchRow}>
            <Text style={styles.matchLabel}>Game</Text>
            <Text style={styles.matchValue}>
              {post.match.game === 'NBA2K'
                ? `NBA 2K${post.match.platform ? ` (${post.match.platform})` : ''}`
                : 'Chess'}
            </Text>
          </View>
          <View style={styles.matchRow}>
            <Text style={styles.matchLabel}>Stake</Text>
            <Text style={styles.stakeValue}>${(post.match.stakeCents / 100).toFixed(0)}</Text>
          </View>
          <View style={styles.matchRow}>
            <Text style={styles.matchLabel}>Pot</Text>
            <Text style={styles.potValue}>${(post.match.stakeCents * 2 / 100).toFixed(0)}</Text>
          </View>
        </View>
      )}

      {isChallenge && post.match && post.match.status === 'FUNDED' && onAccept && (
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => onAccept(post.match!.id)}
        >
          <Text style={styles.acceptButtonText}>
            Accept — ${(post.match.stakeCents / 100).toFixed(0)}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => router.push(`/feed/${post.id}` as any)}
        >
          <Text style={styles.footerText}>💬 {post.commentCount} comments</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FF4D4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  headerInfo: {
    flex: 1,
  },
  handle: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  time: {
    color: '#666',
    fontSize: 12,
  },
  challengeBadge: {
    backgroundColor: '#FF4D4D22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FF4D4D44',
  },
  challengeBadgeText: {
    color: '#FF4D4D',
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    color: '#DDD',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  matchInfo: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  matchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  matchLabel: {
    color: '#666',
    fontSize: 13,
  },
  matchValue: {
    color: '#DDD',
    fontSize: 13,
    fontWeight: '500',
  },
  stakeValue: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '700',
  },
  potValue: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptButton: {
    backgroundColor: '#FF4D4D',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  footerText: {
    color: '#666',
    fontSize: 13,
  },
});
