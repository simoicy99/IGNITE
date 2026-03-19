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
import { Platform } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { authApi, matchesApi } from '../../src/lib/api';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [chessUsername, setChessUsername] = useState(user?.chessUsername ?? '');
  const [psnTag, setPsnTag] = useState(user?.psnTag ?? '');
  const [xboxTag, setXboxTag] = useState(user?.xboxTag ?? '');

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    // Stats would come from a profile endpoint in production
  }

  async function handleChangeHandle() {
    if (!newHandle.trim()) return;
    setIsLoading(true);
    try {
      await authApi.updateHandle(newHandle.trim().toLowerCase());
      await refreshUser();
      setIsEditingHandle(false);
      Alert.alert('Success', 'Handle updated! Note: this can only be done once.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateProfile() {
    setIsLoading(true);
    try {
      await authApi.updateProfile({
        chessUsername: chessUsername || undefined,
        psnTag: psnTag || undefined,
        xboxTag: xboxTag || undefined,
      });
      await refreshUser();
      setIsEditingProfile(false);
      Alert.alert('Success', 'Profile updated!');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        logout();
      }
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Profile</Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          Sign in to view your profile, gaming tags, and match history.
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

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.handle[0].toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          {isEditingHandle ? (
            <View style={styles.editHandleRow}>
              <TextInput
                style={styles.handleInput}
                value={newHandle}
                onChangeText={setNewHandle}
                placeholder={user.handle}
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoFocus
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleChangeHandle}
                disabled={isLoading}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditingHandle(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.handleRow}>
              <Text style={styles.handle}>@{user.handle}</Text>
              {user.handleChangedCount === 0 && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => {
                    setNewHandle(user.handle);
                    setIsEditingHandle(true);
                  }}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={styles.email}>{user.email}</Text>
          {user.isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>
      </View>

      {/* Gaming Profiles */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gaming Profiles</Text>
          <TouchableOpacity onPress={() => setIsEditingProfile(!isEditingProfile)}>
            <Text style={styles.editLink}>{isEditingProfile ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {isEditingProfile ? (
          <View style={styles.profileForm}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Chess.com Username</Text>
              <TextInput
                style={styles.formInput}
                value={chessUsername}
                onChangeText={setChessUsername}
                placeholder="your_chess_username"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>PSN Tag</Text>
              <TextInput
                style={styles.formInput}
                value={psnTag}
                onChangeText={setPsnTag}
                placeholder="YourPSNTag"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Xbox Gamertag</Text>
              <TextInput
                style={styles.formInput}
                value={xboxTag}
                onChangeText={setXboxTag}
                placeholder="YourXboxTag"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity
              style={styles.saveProfileButton}
              onPress={handleUpdateProfile}
              disabled={isLoading}
            >
              <Text style={styles.saveProfileButtonText}>
                {isLoading ? 'Saving...' : 'Save Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.profileStats}>
            <ProfileRow icon="♟️" label="Chess.com" value={user.chessUsername ?? 'Not set'} />
            <ProfileRow icon="🎮" label="PSN" value={user.psnTag ?? 'Not set'} />
            <ProfileRow icon="🎮" label="Xbox" value={user.xboxTag ?? 'Not set'} />
          </View>
        )}
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoList}>
          <InfoRow label="Handle Changes" value={`${user.handleChangedCount}/1 used`} />
          <InfoRow label="Status" value={user.isAdmin ? 'Admin' : 'Member'} />
        </View>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ProfileRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.icon}>{icon}</Text>
      <View style={rowStyles.content}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={[rowStyles.value, !value || value === 'Not set' ? rowStyles.valueEmpty : null]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.infoRow}>
      <Text style={rowStyles.infoLabel}>{label}</Text>
      <Text style={rowStyles.infoValue}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  icon: {
    fontSize: 20,
    width: 36,
  },
  content: {
    flex: 1,
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  valueEmpty: {
    color: '#444',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#DDD',
    fontSize: 14,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  profileHeader: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF4D4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  handle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  editButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  editButtonText: {
    color: '#888',
    fontSize: 12,
  },
  editHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handleInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 8,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  saveButton: {
    backgroundColor: '#FF4D4D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelText: {
    color: '#888',
    fontSize: 13,
  },
  email: {
    color: '#666',
    fontSize: 13,
  },
  adminBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFD70022',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD70044',
  },
  adminBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    margin: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  editLink: {
    color: '#FF4D4D',
    fontSize: 14,
  },
  profileStats: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 4,
    overflow: 'hidden',
  },
  profileForm: {
    gap: 12,
  },
  formField: {
    gap: 6,
  },
  formLabel: {
    color: '#888',
    fontSize: 13,
  },
  formInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  saveProfileButton: {
    backgroundColor: '#FF4D4D',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveProfileButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  infoList: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  signOutButton: {
    margin: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF4D4D33',
  },
  signOutText: {
    color: '#FF4D4D',
    fontWeight: '700',
    fontSize: 15,
  },
});
