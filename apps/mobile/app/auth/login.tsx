import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { authApi, setToken } from '../../src/lib/api';
import { getCurrentGeo } from '../../src/lib/geo';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  function showError(msg: string) {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('Error', msg);
    }
  }

  async function handleSubmit() {
    if (mode === 'register') {
      if (!handle.trim()) return showError('Please choose a handle.');
      if (handle.trim().length < 3) return showError('Handle must be at least 3 characters.');
      if (!/^[a-zA-Z0-9_]+$/.test(handle.trim())) return showError('Handle can only contain letters, numbers, and underscores.');
      if (!email.trim()) return showError('Please enter your email.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showError('Please enter a valid email address.');
      if (!password) return showError('Please enter a password.');
      if (password.length < 8) return showError('Password must be at least 8 characters.');
    } else {
      if (!email.trim() || !password) return showError('Please fill in all fields.');
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
        if (Platform.OS === 'web') {
          window.alert('Successfully signed in!');
        } else {
          Alert.alert('Signed In', 'Welcome back!');
        }
        router.replace('/(tabs)/feed');
      } else {

        // Get geo location for registration (default to CA for web/dev)
        let geo;
        try {
          geo = await getCurrentGeo();
        } catch {}
        if (!geo) {
          geo = { latitude: 37.7749, longitude: -122.4194, state: 'CA' };
        }

        const res = await authApi.register({
          email: email.trim().toLowerCase(),
          handle: handle.trim().toLowerCase(),
          password,
          geo,
        });

        await setToken(res.data.token);
        if (Platform.OS === 'web') {
          window.alert(`Sign up complete! Welcome to Ignite, @${res.data.user.handle}!`);
          router.replace('/(tabs)/feed');
        } else {
          Alert.alert('Sign Up Complete!', `Welcome to Ignite, @${res.data.user.handle}!`, [
            { text: "Let's go", onPress: () => router.replace('/(tabs)/feed') },
          ]);
        }
      }
    } catch (err: any) {
      const msg = err.message ?? 'Something went wrong';
      if (msg.includes('email already exists')) {
        showError('An account with this email already exists. Try signing in instead.');
      } else if (msg.includes('handle is already taken')) {
        showError('That handle is already taken. Please choose a different one.');
      } else if (msg.includes('Invalid email or password')) {
        showError('Incorrect email or password. Please try again.');
      } else {
        showError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <Text style={styles.logo}>IGNITE</Text>
          <Text style={styles.tagline}>Compete. Prove it. Get paid.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </Text>

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>Handle</Text>
              <TextInput
                style={styles.input}
                value={handle}
                onChangeText={setHandle}
                placeholder="your_handle"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchMode}
            onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            <Text style={styles.switchModeText}>
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>

          {mode === 'register' && (
            <Text style={styles.inviteNote}>
              * Registration requires an invite. Contact us to get on the list.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FF4D4D',
    letterSpacing: 8,
  },
  tagline: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    letterSpacing: 1,
  },
  form: {
    gap: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  button: {
    backgroundColor: '#FF4D4D',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchMode: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchModeText: {
    color: '#888',
    fontSize: 14,
  },
  inviteNote: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
