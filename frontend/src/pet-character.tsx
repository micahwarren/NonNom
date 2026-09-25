// A cute animated blob "pet" drawn with pure React Native views + reanimated.
// No external assets required; the blob's shape, color, wobble, and face all
// react to the mood score.
import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from "react-native-reanimated";
import { colors, spacing } from "./theme";

type Mood = "glowing" | "happy" | "neutral" | "sluggish" | "sad" | "sick";

const moodColors: Record<Mood, { body: string; cheek: string; eye: string; bg: string }> = {
  glowing: { body: "#FFD166", cheek: "#FF9F80", eye: "#2B2D42", bg: "#FFF3B0" },
  happy:   { body: "#FF9F80", cheek: "#FF7369", eye: "#2B2D42", bg: "#FFE3D8" },
  neutral: { body: "#FFAA99", cheek: "#FF7369", eye: "#2B2D42", bg: "#FFE3D8" },
  sluggish:{ body: "#B8A9A2", cheek: "#8D99AE", eye: "#2B2D42", bg: "#E8DED8" },
  sad:     { body: "#8D99AE", cheek: "#6B7280", eye: "#2B2D42", bg: "#D8DDE8" },
  sick:    { body: "#9BB07C", cheek: "#7A8F5F", eye: "#2B2D42", bg: "#D8E0CC" },
};

export function PetCharacter({ mood, size = 220 }: { mood: Mood; size?: number }) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const y = useSharedValue(0);

  const m = moodColors[mood];
  const isHappy = mood === "glowing" || mood === "happy";
  const isSad = mood === "sad" || mood === "sick";

  useEffect(() => {
    if (isHappy) {
      scale.value = withRepeat(withSequence(
        withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0,  { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ), -1, false);
      y.value = withRepeat(withSequence(
        withTiming(-6, { duration: 700 }),
        withTiming(0,  { duration: 700 }),
      ), -1, false);
      rotate.value = 0;
    } else if (isSad) {
      scale.value = withRepeat(withSequence(
        withTiming(0.98, { duration: 1400 }),
        withTiming(1.0,  { duration: 1400 }),
      ), -1, false);
      y.value = withTiming(4, { duration: 500 });
      rotate.value = withRepeat(withSequence(
        withTiming(-3, { duration: 1400 }),
        withTiming(3,  { duration: 1400 }),
      ), -1, true);
    } else {
      scale.value = withRepeat(withSequence(
        withTiming(1.02, { duration: 1100 }),
        withTiming(1.0,  { duration: 1100 }),
      ), -1, false);
      y.value = withTiming(0, { duration: 400 });
      rotate.value = 0;
    }
  }, [mood]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <View style={[styles.stage, { width: size + 60, height: size + 60, backgroundColor: m.bg }]}>
      {mood === "glowing" && <View style={[styles.glow, { width: size + 40, height: size + 40 }]} />}
      <Animated.View style={[
        { width: size, height: size * 0.95, backgroundColor: m.body, borderRadius: size / 2 },
        styles.body, bodyStyle,
      ]}>
        {/* eyes */}
        <View style={styles.eyeRow}>
          <View style={[styles.eye, { backgroundColor: m.eye }]}>
            {!isSad && <View style={styles.eyeShine} />}
          </View>
          <View style={[styles.eye, { backgroundColor: m.eye }]}>
            {!isSad && <View style={styles.eyeShine} />}
          </View>
        </View>
        {/* cheeks */}
        <View style={styles.cheekRow}>
          <View style={[styles.cheek, { backgroundColor: m.cheek }]} />
          <View style={[styles.cheek, { backgroundColor: m.cheek }]} />
        </View>
        {/* mouth */}
        <View style={styles.mouthWrap}>
          {isHappy && <View style={[styles.smileBig, { borderColor: m.eye }]} />}
          {mood === "neutral" && <View style={[styles.smallSmile, { borderColor: m.eye }]} />}
          {mood === "sluggish" && <View style={[styles.flatMouth, { backgroundColor: m.eye }]} />}
          {isSad && <View style={[styles.frown, { borderColor: m.eye }]} />}
        </View>
        {mood === "sick" && <Text style={styles.sickIcon}>🤢</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: 300,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFF3B0",
    opacity: 0.7,
  },
  body: {
    alignItems: "center",
    paddingTop: 60,
    shadowColor: "#2B2D42",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  eyeRow: { flexDirection: "row", gap: 30, marginBottom: 12 },
  eye: {
    width: 22, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "flex-start", paddingTop: 4,
  },
  eyeShine: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  cheekRow: { flexDirection: "row", gap: 50, position: "absolute", top: 100 },
  cheek: { width: 22, height: 14, borderRadius: 8, opacity: 0.6 },
  mouthWrap: { marginTop: spacing.sm, alignItems: "center" },
  smileBig: {
    width: 46, height: 26, borderBottomWidth: 4, borderLeftWidth: 4, borderRightWidth: 4,
    borderColor: "#2B2D42", borderTopWidth: 0, borderRadius: 30,
  },
  smallSmile: {
    width: 30, height: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderRightWidth: 3,
    borderColor: "#2B2D42", borderTopWidth: 0, borderRadius: 20,
  },
  flatMouth: { width: 26, height: 3, borderRadius: 2 },
  frown: {
    width: 30, height: 14, borderTopWidth: 3, borderLeftWidth: 3, borderRightWidth: 3,
    borderColor: "#2B2D42", borderBottomWidth: 0, borderRadius: 20, marginTop: 4,
  },
  sickIcon: { position: "absolute", top: 20, right: 20, fontSize: 22 },
});

export function moodLabel(m: Mood): string {
  return { glowing: "Glowing!", happy: "Happy", neutral: "Doing OK", sluggish: "Sluggish", sad: "Sad", sick: "Sick" }[m];
}
export function moodSubtitle(m: Mood): string {
  return {
    glowing: "You're crushing it. I feel amazing!",
    happy: "Great choices today, keep it going!",
    neutral: "Not bad. A healthy snack would help.",
    sluggish: "I'm feeling a bit heavy... hydrate?",
    sad: "Please eat some real food.",
    sick: "Too much junk. I need veggies!",
  }[m];
}
