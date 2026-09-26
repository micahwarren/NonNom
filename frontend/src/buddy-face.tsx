import React from "react";
import { StyleSheet, View } from "react-native";
import type { NomExpression } from "./nom-state";
import { EXPRESSION_LABEL } from "./nom-state";

// Artwork colors intentionally stay identical in both themes.
const INK = "#2B2D42", WHITE = "#FFFFFF", TONGUE = "#FF7B93", TEAR = "#72BDFF", FLUSH = "#FF8A80";

/** Face drawn in the 64x60 unit space; the caller centers it on the body via faceOffsetX and scales by u * faceScale. */
export function BuddyFace({ expression, u, cheek, midnight, testID }: { expression: NomExpression; u: number; cheek: string; midnight: boolean; testID?: string }) {
  const ink = midnight ? WHITE : INK;
  const s = faceStyles(ink, cheek);
  const e = expression;
  const sadBrow = e === "sad" || e === "sore" || e === "sick";
  const worried = e === "stressed";
  const closed = e === "stuffed";
  const sleepy = e === "tired" || e === "sick";
  const arcs = e === "joyful" || e === "energetic";
  return (
    <View pointerEvents="none" testID={testID} accessibilityLabel={`Expression: ${EXPRESSION_LABEL[e]}`} style={[s.canvas, { transform: [{ scale: u }] }]}>
      <View style={s.eyes}>
        {[0, 1].map(i => <View key={i} style={s.eyeSlot}>
          {sadBrow && <View style={[s.brow, { transform: [{ rotate: i === 0 ? "-22deg" : "22deg" }] }]} />}
          {worried && <View style={[s.brow, { top: -5, transform: [{ rotate: i === 0 ? "18deg" : "-18deg" }] }]} />}
          {closed ? <View style={s.closedEye}
            /> : arcs ? <View style={s.happyEye}
            /> : e === "sore" && i === 1 ? <View style={s.squint}
            /> : <View style={[s.eye, sleepy && s.sleepyEye, e === "sick" && s.sickEye]}>{!sleepy && <View style={[s.glint, midnight && { backgroundColor: INK }]} />}</View>}
          {sleepy && <View style={s.lid} />}
        </View>)}
      </View>
      <View style={s.cheeks}>{[0, 1].map(i => <View key={i} style={[s.cheek, e === "sick" && s.flush, e === "energetic" && { opacity: 1 }]} />)}</View>
      <View style={s.mouthSlot}>
        {closed ? <View style={s.fullMouth} />
          : sadBrow ? <View style={s.frown} />
          : e === "tired" ? <View style={s.flatMouth} />
          : worried ? <View style={s.wavyMouth}><View style={s.wave} /><View style={[s.wave, { marginLeft: -1 }]} /></View>
          : e === "thirsty" ? <View style={s.thirstyMouth} />
          : e === "hungry" ? <View style={s.openMouth}><View style={s.tongue} /></View>
          : e === "joyful" || e === "energetic" ? <View style={s.openMouth}><View style={s.tongue} /></View>
          : <View style={[s.smile, e === "neutral" && s.smallSmile]} />}
      </View>
      {e === "thirsty" && <View style={s.droplet} />}
      {e === "hungry" && <View style={s.drool} />}
      {e === "stressed" && [0, 1].map(i => <View key={i} style={[s.sweat, { left: 4 + i * 4, top: 12 + i * 5 }]} />)}
    </View>
  );
}

const faceStyles = (ink: string, cheek: string) => StyleSheet.create({
  canvas: { position: "absolute", top: 0, left: 0, width: 64, height: 60, transformOrigin: "top left" },
  eyes: { position: "absolute", top: 20, left: 15, flexDirection: "row", gap: 16 },
  eyeSlot: { width: 9, height: 13, justifyContent: "center" },
  eye: { width: 9, height: 13, borderRadius: 5, backgroundColor: ink, alignItems: "center", paddingTop: 2 },
  sleepyEye: { height: 7, borderRadius: 4, marginTop: 4 },
  sickEye: { opacity: 0.85 },
  lid: { position: "absolute", top: 3, left: -0.5, width: 10, height: 2.5, borderRadius: 2, backgroundColor: ink },
  squint: { width: 10, height: 3, borderRadius: 2, backgroundColor: ink, transform: [{ rotate: "-8deg" }] },
  closedEye: { width: 11, height: 5, borderBottomWidth: 2.3, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, borderColor: ink },
  fullMouth: { width: 11, height: 6, borderRadius: 5, borderWidth: 2, borderColor: ink },
  happyEye: { width: 11, height: 7, borderTopWidth: 2.4, borderLeftWidth: 2.4, borderRightWidth: 2.4, borderColor: ink, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  glint: { width: 3, height: 3, borderRadius: 2, backgroundColor: WHITE },
  brow: { position: "absolute", top: -4, width: 10, height: 2, backgroundColor: ink, borderRadius: 2 },
  cheeks: { position: "absolute", top: 33, left: 8, flexDirection: "row", gap: 30 },
  cheek: { width: 9, height: 5, borderRadius: 3, backgroundColor: cheek, opacity: 0.75 },
  flush: { width: 12, height: 7, marginLeft: -1.5, marginTop: -1, backgroundColor: FLUSH, opacity: 0.85 },
  mouthSlot: { position: "absolute", top: 38, width: 64, alignItems: "center" },
  smile: { width: 18, height: 8, borderBottomWidth: 2.2, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderColor: ink, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  smallSmile: { width: 11, height: 4 },
  flatMouth: { width: 12, height: 2.2, borderRadius: 2, backgroundColor: ink, marginTop: 3 },
  wavyMouth: { flexDirection: "row", marginTop: 2 },
  wave: { width: 7, height: 4, borderTopWidth: 2, borderColor: ink, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  frown: { width: 14, height: 7, borderTopWidth: 2.2, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderColor: ink, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  thirstyMouth: { width: 7, height: 9, borderWidth: 2, borderColor: ink, borderRadius: 5 },
  openMouth: { width: 18, height: 11, backgroundColor: ink, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: "hidden", alignItems: "center", justifyContent: "flex-end" },
  tongue: { width: 12, height: 5, borderRadius: 5, backgroundColor: TONGUE },
  droplet: { position: "absolute", right: 5, top: 18, width: 5, height: 8, borderRadius: 5, borderTopLeftRadius: 0, backgroundColor: TEAR, transform: [{ rotate: "35deg" }] },
  drool: { position: "absolute", left: 40, top: 46, width: 3, height: 6, borderRadius: 3, backgroundColor: TEAR, opacity: 0.9 },
  sweat: { position: "absolute", width: 3.5, height: 5.5, borderRadius: 3, borderTopLeftRadius: 0, backgroundColor: TEAR, transform: [{ rotate: "-30deg" }] },
});
