import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../api";

interface Props {
  onAuth: (userId: string, isNewUser: boolean) => void;
}

export function AuthScreen({ onAuth }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleContinue = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPw = password.trim();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    if (trimmedPw.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    try {
      const result = await api.emailAuth(trimmedEmail, trimmedPw);
      onAuth(result.user_id, result.new_user);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not reach server. Make sure Flask is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.inner}>

          {/* Logo */}
          <View style={styles.logoBlock}>
            <Text style={styles.logo}>LIFEMAX</Text>
            <Text style={styles.tagline}>Rejection therapy,{"\n"}gamified.</Text>
            <Text style={styles.sub}>
              Build real-world confidence through{"\n"}skin-in-the-game social challenges.
            </Text>
          </View>

          {/* Auth form */}
          <View style={styles.authCard}>
            <View style={styles.fieldBlock}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedDark}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={[styles.inputWrap, styles.inputWrapRow]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.mutedDark}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.mutedDark}
                  />
                </Pressable>
              </View>
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {loading ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 4 }} />
            ) : (
              <Pressable
                onPress={handleContinue}
                style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.9 }]}
              >
                <LinearGradient
                  colors={[colors.cyan, "#00BFDA"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.continueGrad}
                >
                  <Text style={styles.continueText}>Continue</Text>
                </LinearGradient>
              </Pressable>
            )}

            <Text style={styles.legalNote}>
              New email? We'll set up your profile next.{"\n"}
              Returning? Enter your password to pick up where you left off.
            </Text>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingBottom: 20,
  },

  logoBlock: { marginTop: 64 },
  logo: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 6,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  tagline: {
    color: colors.white,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 16,
  },
  sub: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
  },

  authCard: { gap: 14, marginBottom: 8 },

  fieldBlock: { gap: 6 },
  inputLabel: {
    color: colors.mutedDark,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  inputWrap: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputWrapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "400",
  },

  continueBtn: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: colors.cyan,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  continueGrad: { paddingVertical: 17, alignItems: "center" },
  continueText: {
    color: colors.bg,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },

  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },

  legalNote: {
    color: colors.mutedDark,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "400",
    marginTop: 4,
  },
});
