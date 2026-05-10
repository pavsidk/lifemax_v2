import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { api, ProfileState } from "../api";

// Module-level cache — survives tab switches, cleared on app restart
const _cache: { [userId: string]: ProfileState } = {};

function RateBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={bar.wrap}>
      <View style={bar.header}>
        <Text style={bar.label}>{label}</Text>
        <Text style={[bar.value, { color }]}>{value.toFixed(0)}%</Text>
      </View>
      <View style={bar.track}>
        <LinearGradient
          colors={[color, color + "99"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[bar.fill, { width: `${Math.min(value, 100)}%` }]}
        />
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  wrap: { marginBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  value: { fontSize: 13, fontWeight: "700" },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surface, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});

interface Props { userId: string }

export function ProfileScreen({ userId }: Props) {
  const [profile, setProfile] = useState<ProfileState | null>(_cache[userId] ?? null);
  const [loading, setLoading] = useState(!_cache[userId]);
  const [editVisible, setEditVisible] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastLevelRef = useRef<number>(_cache[userId]?.current_level ?? -1);

  const loadProfile = useCallback((showSpinnerIfEmpty = false) => {
    const cached = _cache[userId];
    if (!cached && showSpinnerIfEmpty) setLoading(true);

    api.getProfile(userId)
      .then((data) => {
        _cache[userId] = data;
        lastLevelRef.current = data.current_level;
        setProfile(data);
      })
      .catch(() => {
        if (!cached) Alert.alert("Error", "Could not load profile. Is Flask running?");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadProfile(true);
  }, [loadProfile]));

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await api.getProfile(userId, true);
      _cache[userId] = data;
      lastLevelRef.current = data.current_level;
      setProfile(data);
    } catch {
      Alert.alert("Error", "Could not refresh analysis. Is Flask running?");
    } finally {
      setRefreshing(false);
    }
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.setProfileName(userId, trimmed);
      setProfile((p) => p ? { ...p, name: trimmed } : p);
      setEditVisible(false);
    } catch {
      Alert.alert("Error", "Could not save name.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  const initial = (profile?.name ?? "?")[0].toUpperCase();
  const goalLabel = profile?.goal
    ? profile.goal.charAt(0).toUpperCase() + profile.goal.slice(1)
    : "—";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.title}>Profile</Text>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <LinearGradient
            colors={[colors.cyan + "33", colors.cyan + "11"]}
            style={styles.avatarRing}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          </LinearGradient>

          <Pressable
            onPress={() => { setNameInput(profile?.name ?? ""); setEditVisible(true); }}
            style={styles.nameRow}
          >
            <Text style={styles.name}>{profile?.name ?? "Anonymous"}</Text>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.mutedDark} style={{ marginTop: 2 }} />
          </Pressable>

          <Text style={styles.goalPill}>{goalLabel} path</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{profile?.current_level ?? 1}</Text>
            <Text style={styles.statLabel}>Level</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statVal}>{profile?.quests_completed ?? 0}</Text>
            <Text style={styles.statLabel}>Quests</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { fontSize: 20 }]}>{profile?.xp ?? 0}</Text>
            <Text style={styles.statLabel}>/ {profile?.xp_to_next ?? 250} XP</Text>
          </View>
        </View>


        {/* Gemini summary */}
        {profile?.summary && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons name="robot-outline" size={16} color={colors.cyan} />
              <Text style={styles.summaryLabel}>Coach insight</Text>
            </View>
            <Text style={styles.summaryText}>{profile.summary}</Text>
          </View>
        )}

        {/* Sync badge */}
        <View style={styles.syncRow}>
          <MaterialCommunityIcons
            name={profile?.mongo_synced ? "cloud-check-outline" : "cloud-off-outline"}
            size={14}
            color={profile?.mongo_synced ? colors.green : colors.mutedDark}
          />
          <Text style={[styles.syncText, { color: profile?.mongo_synced ? colors.green : colors.mutedDark }]}>
            {profile?.mongo_synced ? "Synced to MongoDB" : "MongoDB not connected"}
          </Text>
        </View>

        {/* Refresh */}
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing}
          style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.6 }]}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={colors.muted} />
            : <MaterialCommunityIcons name="refresh" size={16} color={colors.muted} />}
          <Text style={styles.refreshText}>{refreshing ? "Analyzing…" : "Refresh analysis"}</Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Edit name modal */}
      <Modal visible={editVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.overlayDismiss} onPress={() => setEditVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Your name</Text>
              <Pressable onPress={() => setEditVisible(false)}>
                <View style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={15} color={colors.muted} />
                </View>
              </Pressable>
            </View>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedDark}
              maxLength={32}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            {saving ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 20 }} />
            ) : (
              <Pressable style={styles.saveBtn} onPress={saveName}>
                <LinearGradient
                  colors={[colors.cyan, "#00BFDA"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.saveGrad}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 22, paddingBottom: 16 },

  title: { color: colors.white, fontSize: 32, fontWeight: "700", letterSpacing: -0.8, marginTop: 8, marginBottom: 28 },

  avatarSection: { alignItems: "center", marginBottom: 28 },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  avatar: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: colors.surfaceSolid,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  avatarInitial: { color: colors.cyan, fontSize: 32, fontWeight: "300", letterSpacing: -1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  name: { color: colors.white, fontSize: 22, fontWeight: "600", letterSpacing: -0.4 },
  goalPill: {
    color: colors.mutedDark,
    fontSize: 12,
    fontWeight: "500",
    backgroundColor: colors.surface,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },

  statsRow: { flexDirection: "row", marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSolid,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardMid: { marginHorizontal: 10 },
  statVal: { color: colors.white, fontSize: 26, fontWeight: "300", letterSpacing: -1 },
  statLabel: { color: colors.mutedDark, fontSize: 11, fontWeight: "500", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },

  ratesCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.mutedDark,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 18,
  },

  summaryCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  summaryLabel: { color: colors.cyan, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  summaryText: { color: colors.muted, fontSize: 14, lineHeight: 22, fontWeight: "400" },

  syncRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 14 },
  syncText: { fontSize: 12, fontWeight: "500" },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshText: { color: colors.muted, fontSize: 13, fontWeight: "500" },

  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayDismiss: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: {
    backgroundColor: "#16161E",
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    padding: 24, paddingBottom: 44,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.mutedDark, alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  sheetTitle: { color: colors.white, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.white,
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 20,
  },
  saveBtn: { borderRadius: 16, overflow: "hidden" },
  saveGrad: { paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.bg, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
});
