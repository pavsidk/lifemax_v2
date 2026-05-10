import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { api, VaultState, Transaction } from "../api";

function kindStyle(kind: Transaction["kind"]) {
  switch (kind) {
    case "deposit":   return { icon: "arrow-down-circle-outline" as const, tint: colors.green };
    case "refund":    return { icon: "arrow-u-left-top" as const,          tint: colors.cyan };
    case "deduction": return { icon: "minus-circle-outline" as const,      tint: colors.orange };
  }
}

function fmtAmount(tx: Transaction) {
  return tx.kind === "deduction" ? `-$${tx.amount.toFixed(2)}` : `+$${tx.amount.toFixed(2)}`;
}

interface Props { userId: string }

export function VaultScreen({ userId }: Props) {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [depositVisible, setDepositVisible] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  const loadVault = useCallback(async () => {
    try {
      const data = await api.getVault(userId);
      setVault(data);
    } catch {
      Alert.alert("Error", "Could not load vault.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadVault(); }, [loadVault]);

  const doDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { Alert.alert("Invalid amount"); return; }
    setDepositing(true);
    try {
      const result = await api.deposit(userId, amount);
      setDepositVisible(false);
      setDepositAmount("");
      Alert.alert("Deposited!", result.message);
      await loadVault();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Deposit failed.");
    } finally {
      setDepositing(false);
    }
  };

  const confirmRefund = () =>
    Alert.alert(
      "Emergency refund",
      "This returns your stake. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Refund", style: "destructive", onPress: doRefund },
      ],
    );

  const doRefund = async () => {
    setRefunding(true);
    try {
      const result = await api.emergencyRefund(userId);
      Alert.alert("Refund queued", result.message);
      await loadVault();
    } catch {
      Alert.alert("Error", "Refund failed.");
    } finally {
      setRefunding(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  const SUBSCRIPTION_FEE = 1.00;
  const totalBalance = vault?.balance_usd ?? 0;
  const gameBalance = Math.max(0, totalBalance - SUBSCRIPTION_FEE);
  const solBalance = gameBalance / 200;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Vault</Text>
          <Pressable
            onPress={() => setDepositVisible(true)}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.bg} />
            <Text style={styles.addBtnText}>Add funds</Text>
          </Pressable>
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          <LinearGradient
            colors={["rgba(0,229,255,0.06)", "transparent"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Text style={styles.balanceLabel}>Game balance</Text>
          <Text style={styles.usdAmt}>${gameBalance.toFixed(2)}</Text>
          <Text style={styles.solAmt}>{solBalance.toFixed(4)} SOL</Text>
          <View style={styles.hairline} />
          <Text style={styles.mockNote}>
            $1.00 reserved for subscription · Connect Phantom or Backpack wallet in production
          </Text>
        </View>

        {/* Transactions */}
        <Text style={styles.eyebrow}>Transactions</Text>
        <View style={styles.txCard}>
          {(!vault?.transactions || vault.transactions.length === 0) && (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          )}
          {vault?.transactions.map((tx, i) => {
            const k = kindStyle(tx.kind);
            return (
              <View key={i}>
                {i > 0 && <View style={styles.txDivider} />}
                <View style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: `${k.tint}18` }]}>
                    <MaterialCommunityIcons name={k.icon} size={20} color={k.tint} />
                  </View>
                  <View style={styles.txMid}>
                    <Text style={styles.txTitle}>{tx.title}</Text>
                    <Text style={styles.txDate}>{tx.date}</Text>
                  </View>
                  <Text style={[styles.txAmt, { color: tx.kind === "deduction" ? colors.orange : colors.green }]}>
                    {fmtAmount(tx)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Emergency */}
        <Text style={styles.eyebrow}>Emergency</Text>
        <Text style={styles.hint}>Long-press to avoid accidental refunds.</Text>
        {refunding ? (
          <ActivityIndicator color={colors.danger} style={{ marginTop: 16 }} />
        ) : (
          <Pressable
            onLongPress={confirmRefund}
            delayLongPress={450}
            style={({ pressed }) => [styles.refundBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialCommunityIcons name="fire-alert" size={20} color={colors.danger} />
            <Text style={styles.refundText}>Hold for emergency refund</Text>
          </Pressable>
        )}
        <Text style={styles.micro}>$1 subscription fee retained · Solana tx in production</Text>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Deposit sheet */}
      <Modal visible={depositVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.overlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add funds</Text>
              <Pressable onPress={() => { setDepositVisible(false); setDepositAmount(""); }}>
                <View style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={16} color={colors.muted} />
                </View>
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>Game balance ${gameBalance.toFixed(2)} · Max $20</Text>

            <View style={styles.inputRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.amtInput}
                value={depositAmount}
                onChangeText={setDepositAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedDark}
                maxLength={5}
                autoFocus
              />
            </View>

            {depositing ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 24 }} />
            ) : (
              <Pressable style={styles.depositBtn} onPress={doDeposit}>
                <LinearGradient
                  colors={[colors.cyan, "#00BFDA"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.depositGrad}
                >
                  <Text style={styles.depositBtnText}>Deposit</Text>
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

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22, marginTop: 8 },
  title: { color: colors.white, fontSize: 32, fontWeight: "700", letterSpacing: -0.8 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.cyan,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  addBtnText: { color: colors.bg, fontSize: 13, fontWeight: "700" },

  balanceCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: colors.cyan, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20 },
    }),
  },
  balanceLabel: { color: colors.mutedDark, fontSize: 12, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  usdAmt: { color: colors.white, fontSize: 44, fontWeight: "300", letterSpacing: -1.5, marginBottom: 4 },
  solAmt: { color: colors.cyan, fontSize: 15, fontWeight: "500", marginBottom: 18 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 14 },
  mockNote: { color: colors.mutedDark, fontSize: 12, fontWeight: "400", lineHeight: 17 },

  eyebrow: {
    color: colors.mutedDark,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  txCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
    overflow: "hidden",
  },
  txDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 16 },
  txRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txMid: { flex: 1 },
  txTitle: { color: colors.white, fontSize: 15, fontWeight: "500" },
  txDate: { color: colors.mutedDark, fontSize: 12, marginTop: 2, fontWeight: "400" },
  txAmt: { fontSize: 15, fontWeight: "600" },
  emptyText: { color: colors.mutedDark, fontSize: 14, padding: 16 },

  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 12, fontWeight: "400" },
  refundBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,69,58,0.1)",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,69,58,0.25)",
  },
  refundText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  micro: { color: colors.mutedDark, fontSize: 11, marginTop: 10, textAlign: "center", fontWeight: "400" },

  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: {
    backgroundColor: "#16161E",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.mutedDark, alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sheetTitle: { color: colors.white, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  sheetSub: { color: colors.mutedDark, fontSize: 13, marginBottom: 24, fontWeight: "400" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    marginBottom: 22,
  },
  dollarSign: { color: colors.mutedDark, fontSize: 36, fontWeight: "300", marginRight: 4 },
  amtInput: { flex: 1, color: colors.white, fontSize: 42, fontWeight: "300", letterSpacing: -1, paddingVertical: 16 },
  depositBtn: { borderRadius: 16, overflow: "hidden" },
  depositGrad: { paddingVertical: 16, alignItems: "center" },
  depositBtnText: { color: colors.bg, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
});
