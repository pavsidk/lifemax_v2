import React, { useState, useCallback, useRef, useMemo } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Animated,
  Easing,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api, SkillsState } from "../api";

const TREE_ART = require("../../assets/redwood-skill-tree.png");
const SQUIRREL_MARKER = require("../../assets/squirrel-level-marker.png");
const SQUIRREL_JUMP = require("../../assets/squirrel-jump.png");

const SQUIRREL_MARKER_SIZE = 56;
const JUMP_SPRITE_W = 72;
const JUMP_SPRITE_H = 88;
const SQUIRREL_FEET_OVERLAP_CARD = 10;
const JUMP_SPRITE_NUDGE_DOWN = 52;
const JUMP_CROSSFADE_MS = 220;
const JUMP_HOLD_AT_START_MS = 1000;
const JUMP_MOVE_MS = 1000;
const JUMP_HOLD_AT_END_MS = 500;

const TREE_ZOOM = 1;
const LOCK_NUDGE_LEFT = 44;
const LOCK_NUDGE_RIGHT = 26;
const LOCK_NUDGE_SMALL_TALK = 58;
const APPROX_CM_DP = 38;
const LOCK_NUDGE_LEVEL4_EXTRA_LEFT = 18;
const NUDGE_SCALE = 0.42;
const LEVEL4_NUDGE_LEFT_LITTLE = 16;
const LEVEL4_EXTRA_DOWN = 32;
const SMALL_TALK_EXTRA_RIGHT = 14;
const SMALL_TALK_EXTRA_DOWN = 16;

function ringCardTransform(level: number) {
  const sx = (n: number) => n * NUDGE_SCALE;
  const cm = APPROX_CM_DP;

  if (level === 2) return [{ translateX: sx(-LOCK_NUDGE_LEFT) - cm }];
  if (level === 3)
    return [
      { translateX: sx(LOCK_NUDGE_SMALL_TALK + APPROX_CM_DP) + cm + SMALL_TALK_EXTRA_RIGHT },
      { translateY: cm + SMALL_TALK_EXTRA_DOWN },
    ];
  if (level === 4)
    return [
      { translateX: -sx(LOCK_NUDGE_LEFT + LOCK_NUDGE_LEVEL4_EXTRA_LEFT) - LEVEL4_NUDGE_LEFT_LITTLE },
      { translateY: 2 * cm + LEVEL4_EXTRA_DOWN },
    ];
  if (level === 5) return [{ translateX: sx(LOCK_NUDGE_RIGHT) }, { translateY: cm }];
  return [{ translateX: sx(level % 2 === 0 ? -LOCK_NUDGE_LEFT : LOCK_NUDGE_RIGHT) }];
}

function useTreeArtMetrics(screenWidth: number) {
  const meta = Image.resolveAssetSource(TREE_ART);
  if (!meta?.width || !meta?.height) return { slotHeight: screenWidth * 2.4 };
  return { slotHeight: (screenWidth / meta.width) * meta.height * TREE_ZOOM };
}

function measureCard(
  cardRefs: React.MutableRefObject<Record<number, View | null>>,
  level: number,
): Promise<{ x: number; y: number; w: number; h: number }> {
  return new Promise((resolve) => {
    const node = cardRefs.current[level];
    if (!node) return resolve({ x: 0, y: 0, w: 0, h: 0 });
    node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

interface Props { userId: string }

export function SkillsScreen({ userId }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const { slotHeight: treeSlotH } = useTreeArtMetrics(W);

  const [skillsData, setSkillsData] = useState<SkillsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [jumpSession, setJumpSession] = useState<{ from: number; to: number } | null>(null);

  const cardRefs = useRef<Record<number, View | null>>({});
  const jumpPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const jumpBlend = useRef(new Animated.Value(0)).current;
  const jumpBusyRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api.getSkills(userId)
        .then(setSkillsData)
        .catch(() => Alert.alert("Error", "Could not load skills."))
        .finally(() => setLoading(false));
    }, [userId])
  );

  const sittingFade = useMemo(
    () => jumpBlend.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [jumpBlend],
  );

  const currentLevel = skillsData?.current_level ?? 1;

  const handleLevelPress = useCallback(
    (target: number) => {
      if (jumpBusyRef.current || target === currentLevel) return;
      if (target < currentLevel) return;

      const from = currentLevel;
      jumpBusyRef.current = true;

      measureCard(cardRefs, from).then((fromM) =>
        measureCard(cardRefs, target).then((toM) => {
          if (fromM.w < 1 || toM.w < 1) {
            jumpBusyRef.current = false;
            return;
          }

          const top = (cardTopY: number) =>
            cardTopY - JUMP_SPRITE_H - SQUIRREL_FEET_OVERLAP_CARD + JUMP_SPRITE_NUDGE_DOWN;

          jumpPan.stopAnimation();
          jumpBlend.stopAnimation();
          jumpBlend.setValue(0);
          jumpPan.setValue({ x: fromM.x + fromM.w / 2 - JUMP_SPRITE_W / 2, y: top(fromM.y) });
          setJumpSession({ from, to: target });

          Animated.sequence([
            Animated.timing(jumpBlend, {
              toValue: 1,
              duration: JUMP_CROSSFADE_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.delay(JUMP_HOLD_AT_START_MS),
            Animated.parallel([
              Animated.timing(jumpPan.x, {
                toValue: toM.x + toM.w / 2 - JUMP_SPRITE_W / 2,
                duration: JUMP_MOVE_MS,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(jumpPan.y, {
                toValue: top(toM.y),
                duration: JUMP_MOVE_MS,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
            Animated.delay(JUMP_HOLD_AT_END_MS),
          ]).start(({ finished }) => {
            jumpBusyRef.current = false;
            jumpBlend.setValue(0);
            setJumpSession(null);
          });
        }),
      );
    },
    [currentLevel, jumpBlend, jumpPan],
  );

  if (loading || !skillsData) {
    return (
      <View style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  const treeLevels = [...skillsData.path].reverse();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollInner, { width: W }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerBlock, { paddingHorizontal: 20 }]}>
          <Text style={styles.screenTitle}>Skill Tree</Text>
          <Text style={styles.screenSub}>
            {skillsData.goal.charAt(0).toUpperCase() + skillsData.goal.slice(1)} path — scroll
            from peak to roots.
          </Text>

          <View style={styles.progressCard}>
            <View style={styles.progressMetaRow}>
              <Text style={styles.progressLabel}>Level {skillsData.current_level}</Text>
              <Text style={styles.progressMeta}>{skillsData.xp} / {skillsData.xp_to_next} XP</Text>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[colors.cyan, "#00BFDA"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.min((skillsData.xp / skillsData.xp_to_next) * 100, 100)}%` }]}
              />
            </View>
          </View>
        </View>

        <View style={[styles.treeTrack, { minHeight: treeSlotH }]}>
          <Image
            source={TREE_ART}
            accessibilityIgnoresInvertColors
            style={[styles.treeImage, { height: treeSlotH }]}
            resizeMode="contain"
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(11,11,21,0.62)", "rgba(11,11,21,0.38)", "rgba(11,11,21,0.68)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(0,229,255,0.06)", "transparent"]}
            style={[styles.canopyTint, { height: Math.min(treeSlotH * 0.35, H * 0.25) }]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(6,9,10,0.55)"]}
            style={styles.floorTint}
          />

          <View style={[styles.treeForeground, { minHeight: Math.max(treeSlotH - 36, 0) }]}>
            {treeLevels.map((ring) => {
              const isLocked = ring.level > currentLevel;
              const isCurrent = ring.level === currentLevel;
              const isDone = ring.level < currentLevel;
              const crossfadeSitting =
                jumpSession !== null && jumpSession.from === ring.level && ring.level === currentLevel;

              return (
                <View key={ring.level} style={styles.ringAnchor}>
                  <View style={[styles.ringCardSlot, { transform: ringCardTransform(ring.level) }]}>
                    <View style={styles.ringCardStack}>
                      <Pressable
                        ref={(el) => { cardRefs.current[ring.level] = el; }}
                        collapsable={false}
                        onPress={() => handleLevelPress(ring.level)}
                        style={({ pressed }) => [
                          styles.ringCard,
                          styles.ringCardCompact,
                          isLocked && styles.ringLocked,
                          isCurrent && styles.ringCurrent,
                          isDone && styles.ringDone,
                          pressed && { opacity: 0.92 },
                        ]}
                      >
                        <View style={styles.ringHeader}>
                          <View style={styles.levelTitleRow}>
                            <Text style={[styles.ringLevel, isLocked && styles.textMuted]}>
                              Level {ring.level}
                            </Text>
                            {isLocked && (
                              <MaterialCommunityIcons
                                name="lock-outline"
                                size={18}
                                color={colors.muted}
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </View>
                          {!isLocked && isDone && (
                            <MaterialCommunityIcons name="check-decagram" size={20} color={colors.green} />
                          )}
                        </View>
                        <Text style={[styles.ringTitle, isLocked && styles.textMuted]}>
                          {ring.label}
                        </Text>
                      </Pressable>

                      {isCurrent && (
                        crossfadeSitting ? (
                          <Animated.View
                            style={[styles.squirrelMarkerOverlay, { opacity: sittingFade }]}
                            pointerEvents="none"
                          >
                            <Image
                              source={SQUIRREL_MARKER}
                              style={styles.squirrelMarker}
                              resizeMode="contain"
                              accessibilityIgnoresInvertColors
                            />
                          </Animated.View>
                        ) : (
                          <View style={styles.squirrelMarkerOverlay} pointerEvents="none">
                            <Image
                              source={SQUIRREL_MARKER}
                              style={styles.squirrelMarker}
                              resizeMode="contain"
                              accessibilityIgnoresInvertColors
                            />
                          </View>
                        )
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={jumpSession !== null} transparent animationType="none">
        <View style={styles.jumpModalRoot} pointerEvents="auto">
          <Animated.View
            style={[
              styles.jumpSpriteWrap,
              { opacity: jumpBlend, transform: [{ translateX: jumpPan.x }, { translateY: jumpPan.y }] },
            ]}
          >
            <Image
              source={SQUIRREL_JUMP}
              style={styles.jumpSprite}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: 28, alignSelf: "stretch" },
  headerBlock: { marginBottom: 10 },
  screenTitle: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginTop: 4,
    marginBottom: 4,
  },
  screenSub: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 20,
    fontWeight: "400",
  },
  progressCard: {
    backgroundColor: colors.surfaceSolid,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  progressLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.cyan, borderRadius: 2 },
  progressMeta: { color: colors.mutedDark, fontSize: 12, marginTop: 8, fontWeight: "400" },
  treeTrack: { position: "relative", width: "100%", overflow: "hidden" },
  treeImage: { position: "absolute", top: 0, left: 0, width: "100%" },
  canopyTint: { position: "absolute", top: 0, left: 0, right: 0 },
  floorTint: { position: "absolute", left: 0, right: 0, bottom: 0, height: 100 },
  treeForeground: {
    position: "relative",
    zIndex: 2,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  ringAnchor: { alignItems: "center", width: "100%" },
  ringCardSlot: { alignItems: "center", width: "100%" },
  ringCardStack: { position: "relative", alignSelf: "center", width: "100%", maxWidth: "92%" },
  squirrelMarkerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    alignItems: "center",
    marginBottom: -10,
    zIndex: 4,
    backgroundColor: "transparent",
  },
  squirrelMarker: { width: SQUIRREL_MARKER_SIZE, height: SQUIRREL_MARKER_SIZE, backgroundColor: "transparent" },
  jumpModalRoot: { flex: 1, backgroundColor: "transparent" },
  jumpSpriteWrap: { position: "absolute", left: 0, top: 0, width: JUMP_SPRITE_W, height: JUMP_SPRITE_H },
  jumpSprite: { width: JUMP_SPRITE_W, height: JUMP_SPRITE_H, backgroundColor: "transparent" },
  ringCard: {
    backgroundColor: "rgba(12,12,20,0.97)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ringCardCompact: {
    alignSelf: "center",
    alignItems: "flex-start",
    flexGrow: 0,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    maxWidth: "92%",
  },
  ringCurrent: {
    borderColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  ringDone: {
    borderColor: "rgba(48,209,88,0.3)",
    backgroundColor: "rgba(10,22,14,0.97)",
  },
  ringLocked: { opacity: 0.65 },
  ringHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  levelTitleRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  ringLevel: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ringTitle: {
    alignSelf: "flex-start",
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  textMuted: { color: colors.mutedDark },
});
