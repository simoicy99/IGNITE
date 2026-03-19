import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { feedApi, matchesApi } from '../../src/lib/api';
import { PostCard } from '../../src/components/PostCard';
import { getCurrentGeo } from '../../src/lib/geo';
import { useAuth } from '../../src/lib/auth';

type FilterType = 'ALL' | 'CHALLENGE' | 'SOCIAL';

export default function FeedScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const router = useRouter();
  const { user } = useAuth();

  const loadFeed = useCallback(
    async (cursor?: string, refresh = false) => {
      try {
        const res = await feedApi.getFeed({
          cursor,
          limit: 20,
          type: filter === 'ALL' ? undefined : filter,
        });

        const newPosts = res.data.items;
        if (refresh || !cursor) {
          setPosts(newPosts);
        } else {
          setPosts((prev) => [...prev, ...newPosts]);
        }
        setNextCursor(res.data.nextCursor);
      } catch (err: any) {
        if (!refresh) Alert.alert('Error', err.message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    setIsLoading(true);
    loadFeed(undefined, true);
  }, [filter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadFeed(undefined, true);
  };

  const handleLoadMore = () => {
    if (nextCursor && !isLoading) {
      loadFeed(nextCursor);
    }
  };

  const handleAcceptMatch = async (matchId: string) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    try {
      const geo = await getCurrentGeo();
      if (!geo) {
        Alert.alert(
          'Location Required',
          'Ignite needs your location to accept a match. Please enable location services and ensure you are in CA, NY, or TX.'
        );
        return;
      }

      await matchesApi.accept(matchId, geo);
      Alert.alert('Match Accepted!', 'Head to the Match Room to get started.', [
        { text: 'Go to Match', onPress: () => router.push(`/match/${matchId}` as any) },
        { text: 'Stay', style: 'cancel' },
      ]);
      handleRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const renderHeader = () => (
    <View style={styles.filters}>
      {(['ALL', 'CHALLENGE', 'SOCIAL'] as FilterType[]).map((f) => (
        <TouchableOpacity
          key={f}
          style={[styles.filterTab, filter === f && styles.filterTabActive]}
          onPress={() => setFilter(f)}
        >
          <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
            {f}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>No posts yet</Text>
      <Text style={styles.emptySubtext}>Be the first to post a challenge!</Text>
    </View>
  );

  const renderFooter = () => {
    if (!nextCursor) return null;
    return (
      <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore}>
        <Text style={styles.loadMoreText}>Load more</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onAccept={item.match?.status === 'FUNDED' && item.user.id !== user?.id
              ? handleAcceptMatch
              : undefined}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FF4D4D"
          />
        }
      />

      {/* FAB for creating posts */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => user ? router.push('/match/create') : router.push('/auth/login')}
      >
        <Text style={styles.fabText}>+ Challenge</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  filters: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  filterTabActive: {
    backgroundColor: '#FF4D4D22',
    borderColor: '#FF4D4D',
  },
  filterText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FF4D4D',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
  },
  loadMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#FF4D4D',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FF4D4D',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#FF4D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
