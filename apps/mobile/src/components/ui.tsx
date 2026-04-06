import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from './theme';

// Button Component
interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 14 },
    md: { paddingVertical: 12, paddingHorizontal: 16, fontSize: 16 },
    lg: { paddingVertical: 16, paddingHorizontal: 24, fontSize: 18 },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    secondary: {
      backgroundColor: colors.bgTertiary,
      borderColor: colors.border,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    danger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
  };

  const textColors = {
    primary: '#FFFFFF',
    secondary: colors.text,
    ghost: colors.accent,
    danger: '#FFFFFF',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        variantStyles[variant],
        { paddingVertical: sizeStyles[size].paddingVertical },
        { paddingHorizontal: sizeStyles[size].paddingHorizontal },
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} size="small" />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: textColors[variant], fontSize: sizeStyles[size].fontSize },
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// Card Component
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
  const { colors } = useTheme();

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const { colors } = useTheme();

  const variantStyles = {
    success: { backgroundColor: `${colors.success}20`, color: colors.success },
    warning: { backgroundColor: `${colors.warning}20`, color: colors.warning },
    danger: { backgroundColor: `${colors.danger}20`, color: colors.danger },
    info: { backgroundColor: `${colors.info}20`, color: colors.info },
    neutral: { backgroundColor: colors.bgTertiary, color: colors.textSecondary },
  };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: variantStyles[variant].backgroundColor },
        size === 'md' && styles.badgeMd,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: variantStyles[variant].color },
          size === 'md' && styles.badgeTextMd,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

// Input Component
interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  label?: string;
  error?: string;
  style?: ViewStyle;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  label,
  error,
  style,
}: InputProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.inputContainer, style]}>
      {label && (
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.bg,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.input,
            { color: colors.text },
          ]}
          accessibilityRole="text"
        >
          {/* Using Text as placeholder for RN - in real app use TextInput */}
          {value || placeholder}
        </Text>
      </View>
      {error && (
        <Text style={[styles.inputError, { color: colors.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

// Typography Components
interface TextProps {
  children: React.ReactNode;
  style?: TextStyle;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'body-sm' | 'caption';
  color?: 'text' | 'secondary' | 'muted' | 'accent';
}

export function Typography({ children, style, variant = 'body', color = 'text' }: TextProps) {
  const { colors } = useTheme();

  const variantStyles = {
    h1: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
    h2: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
    h3: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    'body-sm': { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  };

  const colorMap = {
    text: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    accent: colors.accent,
  };

  return (
    <Text
      style={[
        variantStyles[variant],
        { color: colorMap[color] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// Loading Spinner
export function Loading({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { colors } = useTheme();

  const sizeMap = {
    sm: 24,
    md: 40,
    lg: 64,
  };

  return (
    <View style={styles.loading}>
      <ActivityIndicator size={sizeMap[size]} color={colors.accent} />
    </View>
  );
}

// Empty State
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>{icon}</Text>
      <Typography variant="h3" style={{ marginBottom: 8, textAlign: 'center' }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body-sm" color="muted" style={{ textAlign: 'center', marginBottom: 16 }}>
          {description}
        </Typography>
      )}
      {action}
    </View>
  );
}

// Theme Toggle Button
export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
      <Text style={styles.themeToggleText}>{isDark ? '☀️' : '🌙'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeTextMd: {
    fontSize: 12,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  input: {
    fontSize: 16,
  },
  inputError: {
    fontSize: 12,
    marginTop: 4,
  },
  loading: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  themeToggle: {
    padding: 8,
    borderRadius: 8,
  },
  themeToggleText: {
    fontSize: 24,
  },
});
