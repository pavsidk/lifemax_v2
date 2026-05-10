import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { api, DynamicQuestion } from "../api";

const STATIC_LABELS = [
  "How socially anxious are you? (describe or rate 1–10)",
  "What do you hope to improve upon most?",
  "Who do you surround yourself with — people, cohorts, or mostly solo?",
] as const;

const MAX_DEPOSIT = 20;

interface Props {
  userId: string;
  onComplete: () => void;
}

export function OnboardingScreen({ userId, onComplete }: Props) {

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [staticAnswers, setStaticAnswers] = useState(["", "", ""]);
  const [dynamicQs, setDynamicQs] = useState<DynamicQuestion[]>([]);
  const [dynamicChoices, setDynamicChoices] = useState<(string | null)[]>([null, null, null]);
  const [dynamicExplanations, setDynamicExplanations] = useState(["", "", ""]);
  const [displayName, setDisplayName] = useState("");
  const [depositRaw, setDepositRaw] = useState("5");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const runInit = async () => {
    setErrorMsg("");
    const trimmed = staticAnswers.map((x) => x.trim());
    if (trimmed.some((x) => x.length < 1)) {
      setErrorMsg("Please answer each question before continuing.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.onboardInit(userId, [trimmed[0], trimmed[1], trimmed[2]]);
      let qs = res.questions;
      while (qs.length < 3) qs.push({ scenario: "Describe a social challenge you face.", options: ["Often", "Sometimes", "Rarely"] });
      setDynamicQs(qs.slice(0, 3));
      setDynamicChoices([null, null, null]);
      setDynamicExplanations(["", "", ""]);
      setStep(1);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not reach server. Is Flask running?");
    } finally {
      setBusy(false);
    }
  };

  const runFinalize = async () => {
    setErrorMsg("");
    if (dynamicChoices.some((x) => !x)) {
      setErrorMsg("Please select an option for every scenario.");
      return;
    }
    const name = displayName.trim();
    if (!name) {
      setErrorMsg("What should LifeMax call you?");
      return;
    }
    const dep = parseFloat(depositRaw.replace(/,/g, "")) || 0;
    if (dep < 0 || dep > MAX_DEPOSIT) {
      setErrorMsg(`Enter an amount between $0 and $${MAX_DEPOSIT}.`);
      return;
    }
    const s = staticAnswers.map((x) => x.trim());
    const d = dynamicChoices.map((choice, i) => {
      const expl = dynamicExplanations[i].trim();
      return expl ? `${choice} — ${expl}` : String(choice);
    });
    setBusy(true);
    try {
      await api.onboardFinalize({
        userId,
        name,
        depositUsd: dep,
        pairs: { sq1: s[0], sq2: s[1], sq3: s[2], dq1: d[0], dq2: d[1], dq3: d[2] },
      });
      onComplete();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not reach server. Is Flask running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoBlock}>
          <Text style={styles.logo}>LIFEMAX</Text>
          <Text style={styles.tagline}>Rejection therapy,{"\n"}gamified.</Text>
        </View>

        {/* Step dots */}
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
          ))}
        </View>

        {/* Step 0 — baseline */}
        {step === 0 && (
          <View>
            <Text style={styles.stepTag}>Step 1 · Baseline</Text>
            {STATIC_LABELS.map((label, i) => (
              <View key={label} style={styles.fieldBlock}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  value={staticAnswers[i]}
                  onChangeText={(t) => {
                    const next = [...staticAnswers];
                    next[i] = t;
                    setStaticAnswers(next);
                  }}
                  style={styles.input}
                  placeholder="Your answer"
                  placeholderTextColor={colors.mutedDark}
                  multiline
                />
              </View>
            ))}
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Pressable
              style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.9 }]}
              onPress={runInit}
              disabled={busy}
            >
              <LinearGradient
                colors={[colors.cyan, "#00BFDA"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.nextGrad}
              >
                {busy ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color={colors.bg} style={{ marginRight: 8 }} />
                    <Text style={styles.nextText}>Generating...</Text>
                  </View>
                ) : (
                  <Text style={styles.nextText}>Generate tailored questions</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Step 1 — dynamic Gemini questions */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTag}>Step 2 · Scenarios</Text>
            {dynamicQs.map((q, i) => (
              <View key={i} style={styles.fieldBlock}>
                <Text style={styles.label}>{q.scenario}</Text>
                <View style={styles.chipsWrap}>
                  {q.options.map((opt) => {
                    const selected = dynamicChoices[i] === opt;
                    return (
                      <Pressable
                        key={opt}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => {
                          const next = [...dynamicChoices];
                          next[i] = opt;
                          setDynamicChoices(next);
                        }}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={dynamicExplanations[i]}
                  onChangeText={(t) => {
                    const next = [...dynamicExplanations];
                    next[i] = t;
                    setDynamicExplanations(next);
                  }}
                  style={styles.input}
                  placeholder="Optional: explain your choice..."
                  placeholderTextColor={colors.mutedDark}
                  multiline
                />
              </View>
            ))}
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Pressable style={styles.ghostBtn} onPress={() => { setErrorMsg(""); setStep(0); }} disabled={busy}>
              <Text style={styles.ghostText}>Back</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => { setErrorMsg(""); setStep(2); }}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Continue</Text>
            </Pressable>
          </View>
        )}

        {/* Step 2 — name + deposit */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTag}>Step 3 · Profile & Vault</Text>
            <Text style={styles.label}>What should your coach call you?</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.input, { marginBottom: 22 }]}
              placeholder="Name or nickname"
              placeholderTextColor={colors.mutedDark}
            />
            <Text style={styles.label}>Put skin in the game (USD, max ${MAX_DEPOSIT})</Text>
            <Text style={styles.depositHint}>
              Max ${MAX_DEPOSIT}. Earn it back by completing quests. Emergency refund always available. $1 subscription fee retained monthly.
            </Text>
            <View style={styles.inputCard}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                value={depositRaw}
                onChangeText={setDepositRaw}
                keyboardType="decimal-pad"
                style={styles.depositInput}
                placeholderTextColor={colors.mutedDark}
                maxLength={4}
              />
            </View>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Pressable style={styles.ghostBtn} onPress={() => { setErrorMsg(""); setStep(1); }} disabled={busy}>
              <Text style={styles.ghostText}>Back</Text>
            </Pressable>
            {busy ? (
              <ActivityIndicator color={colors.cyan} size="large" style={{ marginTop: 24 }} />
            ) : (
              <Pressable
                style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.9 }]}
                onPress={runFinalize}
              >
                <LinearGradient
                  colors={[colors.green, "#34D399"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.nextGrad}
                >
                  <Text style={styles.nextText}>Enter the arena</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 28, paddingBottom: 40 },

  logoBlock: { marginTop: 52, marginBottom: 32 },
  logo: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 6,
    textTransform: "uppercase",
  },
  tagline: {
    color: colors.white,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginTop: 10,
    lineHeight: 36,
  },

  dots: { flexDirection: "row", gap: 6, marginBottom: 32 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mutedDark },
  dotActive: { width: 20, backgroundColor: colors.cyan },

  stepTag: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 20,
  },

  fieldBlock: { marginBottom: 20 },
  label: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
    marginBottom: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 15,
    minHeight: 48,
    textAlignVertical: "top",
  },

  chipsWrap: { gap: 8, marginBottom: 10 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: {
    borderColor: colors.cyan,
    backgroundColor: colors.cyanDim,
  },
  chipText: { color: colors.muted, fontSize: 15, fontWeight: "500" },
  chipTextSelected: { color: colors.cyan, fontWeight: "700" },

  depositHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    fontWeight: "400",
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: colors.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 20 },
    }),
  },
  dollarSign: { color: colors.mutedDark, fontSize: 32, fontWeight: "300", marginRight: 4 },
  depositInput: {
    flex: 1,
    color: colors.white,
    fontSize: 42,
    fontWeight: "300",
    letterSpacing: -1,
    paddingVertical: 18,
  },

  busyRow: { flexDirection: "row", alignItems: "center" },

  nextBtn: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 12,
    ...Platform.select({
      ios: { shadowColor: colors.cyan, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
    }),
  },
  nextGrad: { paddingVertical: 17, alignItems: "center" },
  nextText: { color: colors.bg, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },

  ghostBtn: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  ghostText: { color: colors.muted, fontSize: 15, fontWeight: "600" },

  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  secondaryText: { color: colors.cyan, fontWeight: "700", fontSize: 16 },

  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
});
