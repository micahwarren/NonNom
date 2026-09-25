import React from "react";
import { StyleSheet, View } from "react-native";
import type { BuddyState } from "./api";

// Artwork colors intentionally stay identical in both themes.
const INK = "#2B2D42", WHITE = "#FFFFFF", TONGUE = "#FF7B93", TEAR = "#72BDFF";

export function BuddyFace({ state, u, cheek, midnight, testID }: { state: BuddyState; u: number; cheek: string; midnight: boolean; testID?: string }) {
  const ink = midnight ? WHITE : INK;
  const sad = state === "tired" || state === "needs_protein";
  const joyful = state === "excellent" || state === "celebrating";
  const happy = joyful || state === "doing_well";
  const thirsty = state === "needs_hydration";
  const full = state === "full";
  const s = faceStyles(ink, cheek);
  return (
    <View pointerEvents="none" testID={testID} accessibilityLabel={`Expression: ${full ? "full and sleepy" : sad ? "sad" : happy ? "happy" : thirsty ? "thirsty" : "neutral"}`} style={[s.canvas, { transform: [{ scale: u }] }]}>
      <View style={s.eyes}>
        {[0, 1].map(i => <View key={i} style={s.eyeSlot}>
          {sad && <View style={[s.brow, { transform: [{ rotate: i === 0 ? "-22deg" : "22deg" }] }]} />}
          {full ? <View style={s.closedEye} /> : joyful ? <View style={s.happyEye} /> : <View style={[s.eye, sad && s.sleepyEye]}><View style={[s.glint, midnight && { backgroundColor: INK }]} /></View>}
        </View>)}
      </View>
      <View style={s.cheeks}>{[0, 1].map(i => <View key={i} style={s.cheek} />)}</View>
      <View style={s.mouthSlot}>
        {full ? <View style={s.fullMouth} /> : sad ? <View style={s.frown} /> : thirsty ? <View style={s.thirstyMouth} /> : state === "celebrating" ? <View style={s.openMouth}><View style={s.tongue} /></View> : <View style={[s.smile, !happy && s.smallSmile]} />}
      </View>
      {thirsty && <View style={s.droplet} />}
    </View>
  );
}

const faceStyles = (ink: string, cheek: string) => StyleSheet.create({
  canvas: { position: "absolute", top: 0, left: 0, width: 64, height: 60, transformOrigin: "top left" },
  eyes: { position: "absolute", top: 20, left: 15, flexDirection: "row", gap: 16 },
  eyeSlot: { width: 9, height: 13, justifyContent: "center" },
  eye: { width: 9, height: 13, borderRadius: 5, backgroundColor: ink, alignItems: "center", paddingTop: 2 },
  sleepyEye: { height: 8, borderRadius: 4 },
  closedEye: { width: 11, height: 5, borderBottomWidth: 2.3, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, borderColor: ink },
  fullMouth: { width: 11, height: 6, borderRadius: 5, borderWidth: 2, borderColor: ink },
  happyEye: { width: 11, height: 7, borderTopWidth: 2.4, borderLeftWidth: 2.4, borderRightWidth: 2.4, borderColor: ink, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  glint: { width: 3, height: 3, borderRadius: 2, backgroundColor: WHITE },
  brow: { position: "absolute", top: -4, width: 10, height: 2, backgroundColor: ink, borderRadius: 2 },
  cheeks: { position: "absolute", top: 33, left: 8, flexDirection: "row", gap: 30 },
  cheek: { width: 9, height: 5, borderRadius: 3, backgroundColor: cheek, opacity: 0.75 },
  mouthSlot: { position: "absolute", top: 38, width: 64, alignItems: "center" },
  smile: { width: 18, height: 8, borderBottomWidth: 2.2, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderColor: ink, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  smallSmile: { width: 11, height: 4 },
  frown: { width: 14, height: 7, borderTopWidth: 2.2, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderColor: ink, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  thirstyMouth: { width: 7, height: 9, borderWidth: 2, borderColor: ink, borderRadius: 5 },
  openMouth: { width: 18, height: 11, backgroundColor: ink, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: "hidden", alignItems: "center", justifyContent: "flex-end" },
  tongue: { width: 12, height: 5, borderRadius: 5, backgroundColor: TONGUE },
  droplet: { position: "absolute", right: 5, top: 18, width: 5, height: 8, borderRadius: 5, borderTopLeftRadius: 0, backgroundColor: TEAR, transform: [{ rotate: "35deg" }] },
});