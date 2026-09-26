// Nom — the NomNom character. Pure RN views + reanimated. Appearance is fully derived from a NomState (centralized engine)
// plus the equipped cosmetics; garments/hats/shoes are placed via the body rig so they fit every shape and body state.
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors, useTheme } from "./theme";
import { BuddyFace } from "./buddy-face";
import { ExtraAccessory, ExtraHat, NomShoes, ShapeDetails } from "./buddy-extras";
import { NomOutfit } from "./nom-outfit";
import { nomRig, rigShapeStyle, NomRig } from "./nom-rig";
import { nomFromLegacy, NomAccessory, NomState } from "./nom-state";
import { Icon } from "./ui";
import type { BuddyState, Equipped } from "./api";

const INK = "#2B2D42";
const WHITE = "#FFFFFF";
const SICK_RED = "#E63946", ICE = "#BFE3FF", BLANKET = "#B8C4FF", PILLOW = "#F3E9FF", CLOUD = "#B0B7C6";

const SKINS: Record<string, { body: string; cheek: string }> = {
  skin_classic: { body: "#FFAA99", cheek: "#FF7369" },
  skin_peach: { body: "#FFC9A8", cheek: "#FF9A76" },
  skin_strawberry: { body: "#FF7B93", cheek: "#E84A6B" },
  skin_blueberry: { body: "#7D8CFF", cheek: "#5A66D6" },
  skin_mint: { body: "#8FE3C6", cheek: "#5FC7A3" },
  skin_midnight: { body: "#3E4160", cheek: "#6A6E99" },
};
const BACKGROUNDS: Record<string, string[]> = {
  bg_cream: ["#FFE9DF", "#FFF3EC"], bg_sunrise: ["#FFD6A5", "#FFADAD"], bg_ocean: ["#A0E7FF", "#4CC9F0"],
  bg_forest: ["#B7E4C7", "#52B788"], bg_night: ["#3A3D5C", "#1E2038"], bg_confetti: ["#FFE1F0", "#D9F0FF"],
};

export const DEFAULT_EQUIPPED: Equipped = { skin: "skin_classic", hat: "hat_none", glasses: "glasses_none", accessory: "acc_none", outfit: "outfit_none", background: "bg_cream", shape: "shape_round", shoes: "shoes_none" };

type Props = { state?: BuddyState; nom?: NomState | null; equipped?: Partial<Equipped>; size?: number; animate?: boolean; showBackground?: boolean; level?: number; testID?: string; reactionKey?: string };

/** Level evolution tiers — Nom looks cooler as the level (one per logged day) climbs. */
export function levelTier(level: number) {
  return {
    glow: Math.min(0.55, Math.max(0, level - 1) * 0.045), sparkles: Math.min(8, Math.floor(level / 3)),
    aura: level >= 7, goldAura: level >= 14, star: level >= 10, sheen: level >= 5, legendary: level >= 30,
  };
}

export function BuddyAvatar({ state = "neutral", nom, equipped, size = 120, animate = true, showBackground = true, level = 1, testID, reactionKey }: Props) {
  const { scheme } = useTheme();
  const n = nom ?? nomFromLegacy(state);
  const tier = levelTier(level);
  const eq = { ...DEFAULT_EQUIPPED, ...(equipped ?? {}) };
  const u = size / 100;
  const skin = SKINS[eq.skin] ?? SKINS.skin_classic;
  const bg = scheme === "dark" && eq.background === "bg_cream" ? ["#363340", "#242B38"] : BACKGROUNDS[eq.background] ?? BACKGROUNDS.bg_cream;
  const rig = nomRig(eq.shape, n.bodyState);
  const shape = rigShapeStyle(rig, u);
  const W = rig.width, H = rig.height;
  const has = (a: NomAccessory) => n.accessories.includes(a);

  const y = useSharedValue(0), sc = useSharedValue(1), rot = useSharedValue(0), x = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(y); cancelAnimation(sc); cancelAnimation(rot); cancelAnimation(x);
    y.value = 0; sc.value = 1; rot.value = 0; x.value = 0;
    if (!animate) return;
    const a = n.animation;
    if (a === "celebrate" || a === "bounce") {
      y.value = withRepeat(withSequence(withTiming(-6 * u, { duration: 450, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) })), -1, false);
      sc.value = withRepeat(withSequence(withTiming(1.04, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
      if (a === "celebrate") rot.value = withRepeat(withSequence(withTiming(-4, { duration: 450 }), withTiming(4, { duration: 450 })), -1, true);
    } else if (a === "slow_idle" || a === "stiff") {
      y.value = withTiming(3 * u, { duration: 500 });
      sc.value = withRepeat(withSequence(withTiming(0.985, { duration: a === "stiff" ? 2600 : 1500 }), withTiming(1, { duration: a === "stiff" ? 2600 : 1500 })), -1, false);
      if (a === "slow_idle") rot.value = withRepeat(withSequence(withTiming(-2, { duration: 1600 }), withTiming(2, { duration: 1600 })), -1, true);
    } else if (a === "shiver") {
      rot.value = withRepeat(withSequence(withTiming(-1.5, { duration: 90 }), withTiming(1.5, { duration: 90 })), -1, true);
      y.value = withTiming(2 * u, { duration: 400 });
    } else if (a === "jitter") {
      x.value = withRepeat(withSequence(withTiming(-1.2 * u, { duration: 120 }), withTiming(1.2 * u, { duration: 120 })), -1, true);
      y.value = withRepeat(withSequence(withTiming(-1 * u, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false);
    } else {
      y.value = withRepeat(withSequence(withTiming(-2 * u, { duration: 1200, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) })), -1, false);
      sc.value = withRepeat(withSequence(withTiming(1.015, { duration: 1200 }), withTiming(1, { duration: 1200 })), -1, false);
    }
    return () => { cancelAnimation(y); cancelAnimation(sc); cancelAnimation(rot); cancelAnimation(x); };
  }, [n.animation, animate, u, y, sc, rot, x, reactionKey]);
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { translateX: x.value }, { scale: sc.value }, { rotate: `${rot.value}deg` }] }));

  const label = `${eq.shape.replace("shape_", "")} Nom is ${n.facialExpression.replace(/_/g, " ")}${n.moods.length ? `, feeling ${n.moods.join(" and ").replace(/_/g, " ")}` : ""}`;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} testID={testID} accessibilityRole="image" accessibilityLabel={label}>
      {showBackground && <LinearGradient colors={bg as [string, string]} style={{ position: "absolute", width: size, height: size, borderRadius: size / 2 }} />}
      {eq.background === "bg_confetti" && showBackground && [0, 1, 2, 3, 4].map(i => (
        <View key={i} style={{ position: "absolute", width: 6 * u, height: 6 * u, borderRadius: 2 * u, backgroundColor: [colors.brandPrimary, colors.carbs, colors.water, colors.protein, colors.success][i], top: (12 + i * 15) * u, left: (10 + ((i * 37) % 80)) * u, transform: [{ rotate: `${i * 30}deg` }] }} />
      ))}
      {tier.glow > 0 && <View style={{ position: "absolute", width: 78 * u, height: 78 * u, borderRadius: 39 * u, backgroundColor: tier.legendary ? colors.premium : colors.brandPrimary, opacity: tier.glow, top: 8 * u }} />}
      {tier.aura && <View style={{ position: "absolute", width: 86 * u, height: 86 * u, borderRadius: 43 * u, borderWidth: 2 * u, borderColor: colors.brandPrimary, opacity: 0.55, top: 4 * u }} />}
      {tier.goldAura && <View style={{ position: "absolute", width: 94 * u, height: 94 * u, borderRadius: 47 * u, borderWidth: 1.5 * u, borderColor: colors.premium, opacity: 0.7, top: 0 }} />}
      {Array.from({ length: tier.sparkles }).map((_, i) => {
        const a = (i / Math.max(tier.sparkles, 1)) * Math.PI * 2 - Math.PI / 2;
        return <View key={`lv${i}`} style={{ position: "absolute", left: 50 * u + Math.cos(a) * 44 * u - 5 * u, top: 50 * u + Math.sin(a) * 44 * u - 5 * u }}><Icon name="sparkles" size={(8 + (i % 2) * 3) * u} color={tier.legendary || i % 3 === 2 ? colors.premium : colors.carbs} /></View>;
      })}
      {tier.star && <View style={{ position: "absolute", top: 4 * u, right: 6 * u, width: 18 * u, height: 18 * u, borderRadius: 9 * u, backgroundColor: colors.premium, alignItems: "center", justifyContent: "center" }}><Icon name="star" size={11 * u} color={WHITE} /></View>}
      {has("sparkles") && [0, 1, 2].map(i => <View key={i} style={{ position: "absolute", top: (6 + i * 8) * u, left: (12 + i * 34) * u }}><Icon name="sparkles" size={10 * u} color={colors.carbs} /></View>)}
      {has("zzz") && <View testID={testID ? `${testID}-full-signs` : undefined} style={[styles.sleepMarks, { right: 4 * u, top: 4 * u }]}><Text style={[styles.sleepText, { fontSize: 14 * u }]}>z Z</Text></View>}
      {has("sun") && <View style={{ position: "absolute", top: 6 * u, left: 8 * u }}><Icon name="sunny" size={14 * u} color={colors.carbs} /></View>}
      {has("rain_cloud") && <View style={{ position: "absolute", top: 2 * u, left: 50 * u - 14 * u, alignItems: "center" }}>
        <View style={{ width: 26 * u, height: 12 * u, borderRadius: 8 * u, backgroundColor: CLOUD }} />
        {[0, 1, 2].map(i => <View key={i} style={{ position: "absolute", top: 13 * u, left: (4 + i * 9) * u, width: 3 * u, height: 5 * u, borderRadius: 2 * u, backgroundColor: colors.water }} />)}
      </View>}

      <Animated.View testID={testID ? `${testID}-body-${n.bodyState}` : undefined} style={[{ width: W * u, height: H * u, marginTop: 8 * u }, bodyStyle]}>
        {has("pillow") && <View style={{ position: "absolute", right: -14 * u, top: (H - 16) * u, width: 32 * u, height: 15 * u, borderRadius: 6 * u, backgroundColor: PILLOW, borderWidth: 1.2 * u, borderColor: "#D9C8F5" }} />}
        <ExtraAccessory id={eq.accessory} u={u} w={W} behind />
        <ShapeDetails shape={eq.shape === "shape_cloud" ? eq.shape : ""} u={u} w={W} body={skin.body} />
        {/* body */}
        <View style={[{ width: W * u, height: H * u, backgroundColor: skin.body, alignItems: "center", overflow: "visible", ...styles.bodyShadow }, shape]}>
          <View style={[StyleSheet.absoluteFill, shape, { overflow: "hidden" }]}><NomOutfit rig={rig} outfit={eq.outfit} skin={skin.body} u={u} /></View>
          <ShapeDetails shape={eq.shape === "shape_dumpling" ? eq.shape : ""} u={u} w={W} body={skin.body} />
          {tier.sheen && <View style={{ position: "absolute", top: 6 * u, left: 12 * u, width: 16 * u, height: 8 * u, borderRadius: 8 * u, backgroundColor: WHITE, opacity: 0.45, transform: [{ rotate: "-20deg" }] }} />}
          {tier.legendary && <View style={[{ position: "absolute", width: W * u, height: H * u, borderWidth: 2.5 * u, borderColor: colors.premium }, shape]} />}
          {rig.bellyBulge > 0 && <View testID={testID ? `${testID}-full-tummy` : undefined} style={[styles.fullTummy, { width: (W * 0.55) * u, height: (10 + rig.bellyBulge) * u, top: (rig.bellyY - 5) * u, borderRadius: 15 * u }]}><View style={[styles.bellyButton, { width: 3 * u, height: 2 * u, top: 5 * u }]} /></View>}
          <View style={{ position: "absolute", left: rig.faceOffsetX * u, top: 0, width: 64 * u, height: 60 * u, transform: [{ scale: rig.faceScale }] }}>
            <BuddyFace expression={n.facialExpression} u={u} cheek={skin.cheek} midnight={eq.skin === "skin_midnight"} testID={testID ? `${testID}-expression` : undefined} />
          </View>
          <Glasses id={eq.glasses} u={u} rig={rig} />
          <Accessory id={eq.accessory} u={u} rig={rig} />
          {has("thermometer") && <View style={{ position: "absolute", left: (rig.faceOffsetX + 38) * u, top: 39 * u, width: 18 * u, height: 3.2 * u, borderRadius: 2 * u, backgroundColor: WHITE, borderWidth: 0.6 * u, borderColor: INK, transform: [{ rotate: "-18deg" }] }}><View style={{ position: "absolute", right: -1, top: -0.8 * u, width: 5 * u, height: 5 * u, borderRadius: 3 * u, backgroundColor: SICK_RED }} /></View>}
          {has("bandage") && <View style={{ position: "absolute", left: (rig.faceOffsetX + 46) * u, top: 10 * u }}>{[45, -45].map(r => <View key={r} style={{ position: "absolute", width: 10 * u, height: 3 * u, borderRadius: 1.5 * u, backgroundColor: "#F2D5B8", borderWidth: 0.5, borderColor: "#D9B08C", transform: [{ rotate: `${r}deg` }] }} />)}</View>}
        </View>
        {has("blanket") && <View style={{ position: "absolute", left: -5 * u, top: (rig.waistY - 1) * u, width: (W + 10) * u, height: (H - rig.waistY + 4) * u, borderRadius: 8 * u, borderTopLeftRadius: 14 * u, borderTopRightRadius: 14 * u, backgroundColor: BLANKET, overflow: "hidden" }}>
          {[0, 1, 2, 3].map(i => <View key={i} style={{ position: "absolute", left: (i * ((W + 10) / 4) + 3) * u, top: 0, width: 4 * u, height: "100%", backgroundColor: WHITE, opacity: 0.35 }} />)}
        </View>}
        {has("ice_pack") && <View style={{ position: "absolute", left: (rig.centerX - 11) * u, top: -6 * u, width: 22 * u, height: 9 * u, borderRadius: 5 * u, backgroundColor: ICE, borderWidth: 0.8 * u, borderColor: colors.water, alignItems: "center", justifyContent: "center" }}><Icon name="snow" size={6 * u} color={colors.water} /></View>}
        <View style={{ position: "absolute", left: (rig.faceOffsetX + rig.hatX) * u, top: rig.hatLift * u, width: 64 * u, height: 60 * u }}><Hat id={eq.hat} u={u} /></View>
        <NomShoes id={eq.shoes} u={u} w={W} />
        {/* contextual props (hydration / protein / hunger) */}
        {has("water_drop") && <View style={[styles.prop, { right: -8 * u, top: 28 * u, width: 20 * u, height: 20 * u, borderRadius: 10 * u }]}><Icon name="water" size={12 * u} color={colors.water} /></View>}
        {has("protein") && <View style={[styles.prop, { right: -8 * u, top: has("water_drop") ? 50 * u : 28 * u, width: 20 * u, height: 20 * u, borderRadius: 10 * u }]}><Icon name="nutrition" size={12 * u} color={colors.protein} /></View>}
        {has("food_cue") && <View style={[styles.prop, { left: -10 * u, top: 20 * u, width: 22 * u, height: 22 * u, borderRadius: 11 * u }]}><Icon name="fast-food" size={13 * u} color={colors.carbs} /></View>}
      </Animated.View>
    </View>
  );
}

function Hat({ id, u }: { id: string; u: number }) {
  const top = -10 * u;
  switch (id) {
    case "hat_cap": return (<View style={{ position: "absolute", top, left: 8 * u, alignItems: "center" }}>
      <View style={{ width: 46 * u, height: 20 * u, borderTopLeftRadius: 23 * u, borderTopRightRadius: 23 * u, backgroundColor: colors.brandPrimary }} />
      <View style={{ width: 30 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: "#E85D53", alignSelf: "flex-end", marginTop: -2 * u, marginRight: -16 * u }} /></View>);
    case "hat_beanie": return (<View style={{ position: "absolute", top: top - 4 * u, left: 8 * u, alignItems: "center" }}>
      <View style={{ width: 8 * u, height: 8 * u, borderRadius: 4 * u, backgroundColor: "#7D8CFF" }} />
      <View style={{ width: 48 * u, height: 22 * u, borderTopLeftRadius: 24 * u, borderTopRightRadius: 24 * u, backgroundColor: "#5A66D6", marginTop: -2 * u }} />
      <View style={{ width: 50 * u, height: 7 * u, borderRadius: 3 * u, backgroundColor: "#7D8CFF", marginTop: -3 * u }} /></View>);
    case "hat_cowboy": return (<View style={{ position: "absolute", top: top - 4 * u, left: 2 * u, alignItems: "center" }}>
      <View style={{ width: 28 * u, height: 18 * u, borderTopLeftRadius: 10 * u, borderTopRightRadius: 10 * u, backgroundColor: "#9C6B3D" }} />
      <View style={{ width: 60 * u, height: 8 * u, borderRadius: 4 * u, backgroundColor: "#7A5230", marginTop: -3 * u }} /></View>);
    case "hat_chef": return (<View style={{ position: "absolute", top: top - 8 * u, left: 10 * u, alignItems: "center" }}>
      <View style={{ flexDirection: "row", marginBottom: -6 * u }}>{[0, 1, 2].map(i => <View key={i} style={{ width: 16 * u, height: 16 * u, borderRadius: 8 * u, backgroundColor: WHITE, marginLeft: i ? -4 * u : 0 }} />)}</View>
      <View style={{ width: 40 * u, height: 14 * u, borderRadius: 4 * u, backgroundColor: WHITE, borderWidth: 1, borderColor: "#E5DDD5" }} /></View>);
    case "hat_crown": case "hat_gold_crown": {
      const c = id === "hat_gold_crown" ? "#E5B62E" : "#FFD166";
      return (<View style={{ position: "absolute", top: top - 4 * u, left: 16 * u, alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 2 * u }}>{[0, 1, 2].map(i => <View key={i} style={{ width: 0, height: 0, borderLeftWidth: 5 * u, borderRightWidth: 5 * u, borderBottomWidth: 10 * u, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: c }} />)}</View>
        <View style={{ width: 34 * u, height: 10 * u, backgroundColor: c, borderRadius: 2 * u, marginTop: -1 }} />
        {id === "hat_gold_crown" && <View style={{ position: "absolute", bottom: 3 * u, width: 5 * u, height: 5 * u, borderRadius: 3 * u, backgroundColor: colors.error }} />}</View>);
    }
    case "hat_party": return (<View style={{ position: "absolute", top: top - 12 * u, left: 24 * u, alignItems: "center" }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 9 * u, borderRightWidth: 9 * u, borderBottomWidth: 24 * u, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: colors.protein }} />
      <View style={{ position: "absolute", top: -3 * u, width: 6 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.carbs }} /></View>);
    default: return <ExtraHat id={id} u={u} />;
  }
}

function Glasses({ id, u, rig }: { id: string; u: number; rig: NomRig }) {
  if (id === "glasses_none") return null;
  const dark = id === "glasses_sun";
  const star = id === "glasses_star";
  return (
    <View style={{ position: "absolute", top: (rig.eyeY - 1) * u, flexDirection: "row", alignItems: "center", gap: 3 * u }}>
      {[0, 1].map(i => star
        ? <Icon key={i} name="star" size={15 * u} color={colors.carbs} />
        : <View key={i} style={{ width: 15 * u, height: 14 * u, borderRadius: dark ? 5 * u : 8 * u, borderWidth: dark ? 0 : 1.8 * u, borderColor: INK, backgroundColor: dark ? "#2B2D42EE" : "transparent" }} />)}
      <View style={{ position: "absolute", left: 15 * u, width: 3 * u, height: 2 * u, backgroundColor: INK }} />
    </View>
  );
}

/** Accessories anchored to the rig: neck items at neckY, head bands across the brow, straps on the shoulders. */
function Accessory({ id, u, rig }: { id: string; u: number; rig: NomRig }) {
  const W = rig.width;
  switch (id) {
    case "acc_scarf": return <View style={{ position: "absolute", top: (rig.neckY - 3) * u, width: (W - 8) * u, height: 8 * u, borderRadius: 4 * u, backgroundColor: colors.error }} />;
    case "acc_headphones": return (<View style={{ position: "absolute", top: -4 * u, width: (W + 4) * u, height: 30 * u, alignItems: "center" }}>
      <View style={{ width: (W - 2) * u, height: 26 * u, borderTopLeftRadius: 31 * u, borderTopRightRadius: 31 * u, borderWidth: 3 * u, borderBottomWidth: 0, borderColor: INK }} />
      <View style={{ position: "absolute", left: 0, top: 18 * u, width: 10 * u, height: 14 * u, borderRadius: 4 * u, backgroundColor: INK }} />
      <View style={{ position: "absolute", right: 0, top: 18 * u, width: 10 * u, height: 14 * u, borderRadius: 4 * u, backgroundColor: INK }} /></View>);
    case "acc_backpack": return (<View style={{ position: "absolute", top: (rig.torsoTop - 12) * u, left: 0, width: W * u, height: 26 * u }}>{[rig.shoulderL, rig.shoulderR].map((x, i) => <View key={i} style={{ position: "absolute", left: (x - 2.5) * u, width: 5 * u, height: 26 * u, borderRadius: 2 * u, backgroundColor: "#6B4F3A" }} />)}</View>);
    case "acc_headband": return <View style={{ position: "absolute", top: 12 * u, width: (W - 4) * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.brandPrimary }}><View style={{ alignSelf: "center", width: 10 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: WHITE, opacity: 0.8 }} /></View>;
    case "acc_sweatband": return <View style={{ position: "absolute", top: 12 * u, width: (W - 4) * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.protein }} />;
    case "acc_bowtie": return (<View style={{ position: "absolute", top: (rig.neckY - 2) * u, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 5 * u, borderBottomWidth: 5 * u, borderRightWidth: 9 * u, borderTopColor: "transparent", borderBottomColor: "transparent", borderRightColor: colors.error }} />
      <View style={{ width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: "#C93A5B" }} />
      <View style={{ width: 0, height: 0, borderTopWidth: 5 * u, borderBottomWidth: 5 * u, borderLeftWidth: 9 * u, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.error }} /></View>);
    default: return <ExtraAccessory id={id} u={u} w={W} />;
  }
}

const styles = StyleSheet.create({
  sleepMarks: { position: "absolute" },
  sleepText: { color: INK, fontWeight: "800", opacity: 0.65 },
  fullTummy: { position: "absolute", backgroundColor: WHITE, opacity: 0.25, alignItems: "center" },
  bellyButton: { backgroundColor: INK, borderRadius: 2 },
  bodyShadow: { shadowColor: INK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  prop: { position: "absolute", backgroundColor: WHITE, alignItems: "center", justifyContent: "center", shadowColor: INK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
});

export const BUDDY_STATE_LABEL: Record<BuddyState, string> = {
  neutral: "Neutral", doing_well: "Doing well", excellent: "Excellent", tired: "Tired", celebrating: "Celebrating", needs_hydration: "Needs water", needs_protein: "Needs protein", full: "Full and sleepy",
};
