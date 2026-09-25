// Buddy — the NomNom character. Pure RN views + reanimated, cosmetics rendered from data so new items need no UI rewrite.
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "./theme";
import { Icon } from "./ui";
import type { BuddyState, Equipped } from "./api";

const INK = "#2B2D42";
const WHITE = "#FFFFFF";

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

export const DEFAULT_EQUIPPED: Equipped = { skin: "skin_classic", hat: "hat_none", glasses: "glasses_none", accessory: "acc_none", outfit: "outfit_none", background: "bg_cream" };

type Props = { state?: BuddyState; equipped?: Partial<Equipped>; size?: number; animate?: boolean; showBackground?: boolean; testID?: string };

export function BuddyAvatar({ state = "neutral", equipped, size = 120, animate = true, showBackground = true, testID }: Props) {
  const eq = { ...DEFAULT_EQUIPPED, ...(equipped ?? {}) };
  const u = size / 100; // unit
  const skin = SKINS[eq.skin] ?? SKINS.skin_classic;
  const bg = BACKGROUNDS[eq.background] ?? BACKGROUNDS.bg_cream;

  const y = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    if (state === "celebrating" || state === "excellent") {
      y.value = withRepeat(withSequence(withTiming(-6 * u, { duration: 450, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) })), -1, false);
      sc.value = withRepeat(withSequence(withTiming(1.04, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
      rot.value = state === "celebrating" ? withRepeat(withSequence(withTiming(-4, { duration: 450 }), withTiming(4, { duration: 450 })), -1, true) : 0;
    } else if (state === "tired") {
      y.value = withTiming(3 * u, { duration: 500 });
      sc.value = withRepeat(withSequence(withTiming(0.985, { duration: 1500 }), withTiming(1, { duration: 1500 })), -1, false);
      rot.value = withRepeat(withSequence(withTiming(-2, { duration: 1600 }), withTiming(2, { duration: 1600 })), -1, true);
    } else {
      y.value = withRepeat(withSequence(withTiming(-2 * u, { duration: 1200, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) })), -1, false);
      sc.value = withRepeat(withSequence(withTiming(1.015, { duration: 1200 }), withTiming(1, { duration: 1200 })), -1, false);
      rot.value = 0;
    }
  }, [state, animate]);
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: sc.value }, { rotate: `${rot.value}deg` }] }));

  const tired = state === "tired";
  const happy = state === "celebrating" || state === "excellent" || state === "doing_well";
  const eyeH = tired ? 7 * u : 13 * u;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} testID={testID} accessibilityLabel={`Buddy is ${state.replace("_", " ")}`}>
      {showBackground && <LinearGradient colors={bg as [string, string]} style={{ position: "absolute", width: size, height: size, borderRadius: size / 2 }} />}
      {eq.background === "bg_confetti" && showBackground && [0, 1, 2, 3, 4].map(i => (
        <View key={i} style={{ position: "absolute", width: 6 * u, height: 6 * u, borderRadius: 2 * u, backgroundColor: [colors.brandPrimary, colors.carbs, colors.water, colors.protein, colors.success][i], top: (12 + i * 15) * u, left: (10 + ((i * 37) % 80)) * u, transform: [{ rotate: `${i * 30}deg` }] }} />
      ))}
      {state === "celebrating" && [0, 1, 2].map(i => (
        <Animated.View key={i} style={{ position: "absolute", top: (6 + i * 8) * u, left: (12 + i * 34) * u }}><Icon name="sparkles" size={10 * u} color={colors.carbs} /></Animated.View>
      ))}
      <Animated.View style={[{ width: 64 * u, height: 60 * u, marginTop: 8 * u }, bodyStyle]}>
        {/* body */}
        <View style={{ width: 64 * u, height: 60 * u, borderRadius: 32 * u, backgroundColor: skin.body, alignItems: "center", overflow: "visible", ...styles.bodyShadow }}>
          <Outfit id={eq.outfit} u={u} />
          {/* eyes */}
          <View style={{ flexDirection: "row", gap: 16 * u, marginTop: 20 * u }}>
            {[0, 1].map(i => (
              <View key={i} style={{ width: 9 * u, height: eyeH, borderRadius: 5 * u, backgroundColor: INK, alignItems: "center", justifyContent: "flex-start", paddingTop: 2 * u }}>
                {!tired && <View style={{ width: 3.5 * u, height: 3.5 * u, borderRadius: 2 * u, backgroundColor: WHITE }} />}
              </View>
            ))}
          </View>
          {/* cheeks */}
          <View style={{ position: "absolute", top: 33 * u, flexDirection: "row", gap: 30 * u }}>
            {[0, 1].map(i => <View key={i} style={{ width: 9 * u, height: 5 * u, borderRadius: 3 * u, backgroundColor: skin.cheek, opacity: 0.75 }} />)}
          </View>
          {/* mouth */}
          <View style={{ marginTop: 4 * u }}>
            {happy && <View style={{ width: 18 * u, height: 9 * u, borderBottomWidth: 2.2 * u, borderLeftWidth: 2.2 * u, borderRightWidth: 2.2 * u, borderColor: INK, borderRadius: 12 * u }} />}
            {(state === "neutral" || state === "needs_hydration" || state === "needs_protein") && <View style={{ width: 12 * u, height: 5 * u, borderBottomWidth: 2 * u, borderLeftWidth: 2 * u, borderRightWidth: 2 * u, borderColor: INK, borderRadius: 8 * u }} />}
            {tired && <View style={{ width: 10 * u, height: 2 * u, borderRadius: u, backgroundColor: INK, marginTop: 2 * u }} />}
          </View>
          <Glasses id={eq.glasses} u={u} />
          <Accessory id={eq.accessory} u={u} />
        </View>
        <Hat id={eq.hat} u={u} />
        {/* contextual prop */}
        {state === "needs_hydration" && <View style={[styles.prop, { right: -8 * u, top: 28 * u, width: 20 * u, height: 20 * u, borderRadius: 10 * u }]}><Icon name="water" size={12 * u} color={colors.water} /></View>}
        {state === "needs_protein" && <View style={[styles.prop, { right: -8 * u, top: 28 * u, width: 20 * u, height: 20 * u, borderRadius: 10 * u }]}><Icon name="nutrition" size={12 * u} color={colors.protein} /></View>}
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
    default: return null;
  }
}

function Glasses({ id, u }: { id: string; u: number }) {
  if (id === "glasses_none") return null;
  const dark = id === "glasses_sun";
  const star = id === "glasses_star";
  return (
    <View style={{ position: "absolute", top: 19 * u, flexDirection: "row", alignItems: "center", gap: 3 * u }}>
      {[0, 1].map(i => star
        ? <Icon key={i} name="star" size={15 * u} color={colors.carbs} />
        : <View key={i} style={{ width: 15 * u, height: 14 * u, borderRadius: dark ? 5 * u : 8 * u, borderWidth: dark ? 0 : 1.8 * u, borderColor: INK, backgroundColor: dark ? "#2B2D42EE" : "transparent" }} />)}
      <View style={{ position: "absolute", left: 15 * u, width: 3 * u, height: 2 * u, backgroundColor: INK }} />
    </View>
  );
}

function Accessory({ id, u }: { id: string; u: number }) {
  switch (id) {
    case "acc_scarf": return <View style={{ position: "absolute", bottom: 4 * u, width: 56 * u, height: 8 * u, borderRadius: 4 * u, backgroundColor: colors.error }} />;
    case "acc_headphones": return (<View style={{ position: "absolute", top: -4 * u, width: 68 * u, height: 30 * u, alignItems: "center" }}>
      <View style={{ width: 62 * u, height: 26 * u, borderTopLeftRadius: 31 * u, borderTopRightRadius: 31 * u, borderWidth: 3 * u, borderBottomWidth: 0, borderColor: INK }} />
      <View style={{ position: "absolute", left: 0, top: 18 * u, width: 10 * u, height: 14 * u, borderRadius: 4 * u, backgroundColor: INK }} />
      <View style={{ position: "absolute", right: 0, top: 18 * u, width: 10 * u, height: 14 * u, borderRadius: 4 * u, backgroundColor: INK }} /></View>);
    case "acc_backpack": return (<View style={{ position: "absolute", top: 26 * u, flexDirection: "row", gap: 34 * u }}>{[0, 1].map(i => <View key={i} style={{ width: 5 * u, height: 26 * u, borderRadius: 2 * u, backgroundColor: "#6B4F3A" }} />)}</View>);
    case "acc_headband": return <View style={{ position: "absolute", top: 12 * u, width: 60 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.brandPrimary }}><View style={{ alignSelf: "center", width: 10 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: WHITE, opacity: 0.8 }} /></View>;
    case "acc_sweatband": return <View style={{ position: "absolute", top: 12 * u, width: 60 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.protein }} />;
    case "acc_bowtie": return (<View style={{ position: "absolute", bottom: 3 * u, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 5 * u, borderBottomWidth: 5 * u, borderRightWidth: 9 * u, borderTopColor: "transparent", borderBottomColor: "transparent", borderRightColor: colors.error }} />
      <View style={{ width: 4 * u, height: 4 * u, borderRadius: 2 * u, backgroundColor: "#C93A5B" }} />
      <View style={{ width: 0, height: 0, borderTopWidth: 5 * u, borderBottomWidth: 5 * u, borderLeftWidth: 9 * u, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.error }} /></View>);
    default: return null;
  }
}

function Outfit({ id, u }: { id: string; u: number }) {
  if (id === "outfit_none") return null;
  const color = { outfit_hoodie: "#8D99AE", outfit_gym: "#2B2D42", outfit_business: "#3A4A6B", outfit_chef: WHITE, outfit_athlete: colors.water }[id] ?? colors.muted;
  return (
    <View style={{ position: "absolute", bottom: 0, width: 64 * u, height: 22 * u, borderBottomLeftRadius: 32 * u, borderBottomRightRadius: 32 * u, backgroundColor: color, overflow: "hidden", alignItems: "center" }}>
      {id === "outfit_hoodie" && <View style={{ width: 4 * u, height: 12 * u, backgroundColor: WHITE, opacity: 0.7, marginTop: 2 * u, borderRadius: 2 * u }} />}
      {id === "outfit_gym" && <View style={{ width: 20 * u, height: 22 * u, backgroundColor: colors.brandPrimary, borderTopLeftRadius: 10 * u, borderTopRightRadius: 10 * u }} />}
      {id === "outfit_business" && <View style={{ width: 6 * u, height: 16 * u, backgroundColor: colors.error, marginTop: 2 * u, borderRadius: 2 * u }} />}
      {id === "outfit_chef" && <View style={{ width: 64 * u, height: 3 * u, backgroundColor: "#E5DDD5", marginTop: 2 * u }} />}
      {id === "outfit_athlete" && <View style={{ width: 64 * u, height: 4 * u, backgroundColor: WHITE, marginTop: 6 * u }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bodyShadow: { shadowColor: INK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  prop: { position: "absolute", backgroundColor: WHITE, alignItems: "center", justifyContent: "center", shadowColor: INK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
});

export const BUDDY_STATE_LABEL: Record<BuddyState, string> = {
  neutral: "Neutral", doing_well: "Doing well", excellent: "Excellent", tired: "Tired", celebrating: "Celebrating", needs_hydration: "Needs water", needs_protein: "Needs protein",
};
