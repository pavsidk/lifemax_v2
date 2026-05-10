import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api, QuestState, CompleteResult } from "../api";

interface Props { userId: string }

export function QuestLogScreen({ userId }: Props) {
  const [quest, setQuest] = useState<QuestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [completedQuests, setCompletedQuests] = useState<
    { title: string; when: string; xp: number }[]
  >([]);

  const loadQuest = useCallback(async () => {
    try {
      const data = await api.getCurrentQuest(userId);
      setQuest(data);
    } catch {
      Alert.alert("Error", "Could not load quest. Is Flask running?");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadQuest(); }, [loadQuest]);

  async function handleOutcome(outcome: "success" | "rejected" | "bailed") {
    if (!quest || acting) return;
    setActing(true);
    try {
      const result: CompleteResult = await api.completeQuest(userId, outcome);
      setCompletedQuests((prev) => [
        { title: quest.quest, when: "Just now", xp: result.xp_gained },
        ...prev.slice(0, 4),
      ]);
      Alert.alert(
        outcome === "success" ? "Quest Complete!" : outcome === "rejected" ? "Respect." : "No worries",
        result.message,
        [{ text: "Next Quest", onPress: () => loadQuest() }]
      );
      setQuest((q) =>
        q ? { ...q, quest: result.new_quest, current_level: result.current_level, xp: result.xp, xp_to_next: result.xp_to_next } : q
      );
    } catch {
      Alert.alert("Error", "Could not submit result.");
    } finally {
      setActing(false);
    }
  }

  async function handleSkip() {
    if (acting) return;
    setActing(true);
    try {
      const result = await api.skipQuest(userId);
      setQuest((q) => (q ? { ...q, quest: result.new_quest } : q));
    } catch {
      Alert.alert("Error", "Could not skip.");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  const atRisk = quest ? quest.balance_usd * 0.034 : 0;
  const safe = quest ? quest.balance_usd - atRisk : 0;
  const xpPct = quest ? Math.min((quest.xp / quest.xp_to_next) * 100, 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.title}>Quest Log</Text>

        {/* Stakes pill row */}
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <View style={[styles.pillDot, { backgroundColor: colors.green }]} />
            <Text style={styles.pillText}>${safe.toFixed(2)} safe</Text>
          </View>
          <View style={styles.pill}>
            <View style={[styles.pillDot, { backgroundColor: colors.orange }]} />
            <Text style={styles.pillText}>${atRisk.toFixed(2)} at risk</Text>
          </View>
        </View>

        {/* Active quest card */}
        {quest && (
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(0,229,255,0.04)", "transparent"]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            <View style={styles.xpBadge}>
              <Text style={styles.xpBadgeText}>+{quest.xp_reward} XP</Text>
            </View>

            <Text style={styles.questTitle}>{quest.quest}</Text>

            <View style={styles.outcomeRow}>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { flex: 1 }, pressed && styles.btnPressed]}
                onPress={() => handleOutcome("success")}
                disabled={acting}
              >
                <LinearGradient
                  colors={[colors.cyan, "#00BFDA"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.primaryGrad}
                >
                  <Text style={styles.primaryBtnText}>Done it  ✓</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.6 }]}
                onPress={() => handleOutcome("rejected")}
                disabled={acting}
              >
                <Text style={styles.ghostBtnText}>Rejected</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
              onPress={handleSkip}
              disabled={acting}
            >
              <Text style={styles.skipText}>Skip  →</Text>
            </Pressable>

            {acting && <ActivityIndicator color={colors.cyan} size="small" style={{ marginTop: 14 }} />}
          </View>
        )}

        {/* XP bar */}
        {quest && (
          <View style={styles.xpCard}>
            <View style={styles.xpRow}>
              <Text style={styles.xpLabel}>Level {quest.current_level}</Text>
              <Text style={styles.xpFraction}>{quest.xp} / {quest.xp_to_next} XP</Text>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[colors.cyan, "#00BFDA"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${xpPct}%` }]}
              />
            </View>
          </View>
        )}

        {/* Recent loot */}
        {completedQuests.length > 0 && (
          <View style={styles.lootCard}>
            <Text style={styles.eyebrow}>Recent loot</Text>
            {completedQuests.map((item, index) => (
              <View key={index}>
                {index > 0 && <View style={styles.hairline} />}
                <View style={styles.lootRow}>
                  <View style={styles.lootDot} />
                  <View style={styles.lootMid}>
                    <Text style={styles.lootTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.lootWhen}>{item.when}</Text>
                  </View>
                  <Text style={styles.lootXp}>+{item.xp}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 16 },
  android: { elevation: 6 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 },

  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginBottom: 18,
  },

  pillRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { color: colors.muted, fontSize: 13, fontWeight: "500" },

  card: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 14,
    overflow: "hidden",
    ...cardShadow,
  },
  xpBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,214,10,0.12)",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  xpBadgeText: {
    color: colors.yellow,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  questTitle: {
    color: colors.white,
    fontSize: 19,
    fontWeight: "500",
    letterSpacing: -0.3,
    lineHeight: 27,
    marginBottom: 22,
  },

  outcomeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  primaryBtn: { borderRadius: 14, overflow: "hidden" },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryGrad: { paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700", letterSpacing: -0.1 },
  ghostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { color: colors.mutedDark, fontSize: 13, fontWeight: "500" },

  xpCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  xpRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  xpLabel: { color: colors.white, fontSize: 14, fontWeight: "600", letterSpacing: -0.1 },
  xpFraction: { color: colors.mutedDark, fontSize: 13, fontWeight: "400" },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },

  lootCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    color: colors.mutedDark,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 },
  lootRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  lootDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  lootMid: { flex: 1 },
  lootTitle: { color: colors.white, fontSize: 15, fontWeight: "500" },
  lootWhen: { color: colors.mutedDark, fontSize: 12, marginTop: 2, fontWeight: "400" },
  lootXp: { color: colors.yellow, fontSize: 14, fontWeight: "700" },
});
