// Centralized Nom outfit renderer. Every garment is drawn from rig anchors (shoulders, torso, waist, belly, hips) so the same
// hoodie/jersey/overalls visibly fit Classic, Marshmallow, Jelly Bean, Dumpling, Cloud, Droplet and every body state
// (normal / full / bloated / slim). Garments are clipped by the body silhouette by the caller. Add outfits here only.
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "./ui";
import type { NomRig } from "./nom-rig";

// Illustration palette: identical in light and dark mode on purpose.
const P = { ink: "#2B2D42", white: "#FFFFFF", cheese: "#FFD166", coral: "#FF7369", blue: "#507DC4", denim: "#355E9C", mint: "#8FE3C6", purple: "#9A7EE8", silver: "#D7DFED", slate: "#8D99AE", navy: "#3A4A6B", water: "#4CC9F0", red: "#E63946" };
const FABRIC: Record<string, string> = { outfit_hoodie: P.slate, outfit_gym: P.ink, outfit_business: P.navy, outfit_chef: P.white, outfit_athlete: P.water, outfit_denim: P.blue, outfit_pajamas: P.purple, outfit_astronaut: P.white, outfit_superhero: P.blue, outfit_pirate: P.ink };
export const OUTFIT_IDS = Object.keys(FABRIC);

export type OutfitProps = { rig: NomRig; outfit: string; skin: string; u: number };

/** Draws the equipped outfit inside a body-sized canvas. Returns null for outfit_none / unknown ids. */
export function NomOutfit({ rig, outfit, skin, u }: OutfitProps) {
  const fabric = FABRIC[outfit];
  if (!fabric) return null;
  const { width: W, height: H, centerX: cx, torsoTop, waistY, bellyY, shoulderL, shoulderR, hipL, hipR, bellyBulge } = rig;
  const chest = shoulderR - shoulderL;
  const hips = hipR - hipL;
  const neck = outfit === "outfit_gym" ? { w: chest * 0.55, h: 10 } : outfit === "outfit_business" ? { w: chest * 0.42, h: 12 } : { w: chest * 0.5, h: 6 };
  const bib = outfit === "outfit_denim";
  const top = bib ? torsoTop - 3 : torsoTop;
  return (
    <View pointerEvents="none" style={[s.canvas, { width: W, height: H, transform: [{ scale: u }] }]} testID="nom-outfit">
      {/* garment body: hem sits at the hips so it reads as clothing, not a floor */}
      <View style={[s.abs, { top, left: 0, width: W, height: H - top, backgroundColor: fabric }]} />
      {/* neckline scoop shows skin, so the garment is "worn" rather than a band */}
      {!bib && <View style={[s.abs, { top: top - neck.h / 2, left: cx - neck.w / 2, width: neck.w, height: neck.h, borderRadius: neck.h, backgroundColor: skin }]} />}
      {/* under-arm shading follows the silhouette */}
      <View style={[s.abs, { top: top + 2, left: hipL - 5, width: 4, height: H - top - 6, borderRadius: 3, backgroundColor: P.ink, opacity: 0.12 }]} />
      <View style={[s.abs, { top: top + 2, left: hipR + 1, width: 4, height: H - top - 6, borderRadius: 3, backgroundColor: P.ink, opacity: 0.12 }]} />
      {/* fabric stretched over a fuller tummy: soft highlight + tighter hem; slim body gets a loose fold */}
      {bellyBulge > 0 && <View style={[s.abs, { top: bellyY - 5, left: cx - hips * 0.32, width: hips * 0.64, height: 10 + bellyBulge, borderRadius: 12, backgroundColor: P.white, opacity: outfit === "outfit_chef" || outfit === "outfit_astronaut" ? 0 : 0.14 }]} />}
      {bellyBulge > 0 && <View style={[s.abs, { top: waistY + 4, left: hipL, width: hips, height: 1.5, backgroundColor: P.ink, opacity: 0.18 }]} />}
      {bellyBulge < 0 && <View style={[s.abs, { top: bellyY, left: cx + 4, width: 1.5, height: H - bellyY - 6, backgroundColor: P.ink, opacity: 0.15, transform: [{ rotate: "6deg" }] }]} />}

      {outfit === "outfit_hoodie" && <>
        {[-3, 3].map(dx => <View key={dx} style={[s.abs, { top: top + 1, left: cx + dx - 1, width: 2, height: 11, borderRadius: 1, backgroundColor: P.white, opacity: 0.8 }]} />)}
        <View style={[s.abs, { top: bellyY - 1, left: cx - hips * 0.28, width: hips * 0.56, height: 9, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, borderWidth: 1.2, borderColor: P.ink, opacity: 0.35 }]} />
      </>}
      {outfit === "outfit_gym" && <View style={[s.abs, { top, left: cx - chest * 0.2, width: chest * 0.4, height: H - top, backgroundColor: P.coral, borderTopLeftRadius: 8, borderTopRightRadius: 8 }]} />}
      {outfit === "outfit_business" && <>
        {[-1, 1].map(dir => <View key={dir} style={[s.abs, { top: top - 2, left: cx + (dir < 0 ? -neck.w / 2 - 2 : neck.w / 2 - 6), width: 8, height: 12, backgroundColor: P.white, transform: [{ rotate: `${dir * 30}deg` }], borderRadius: 2 }]} />)}
        <View style={[s.abs, { top: top + 3, left: cx - 3, width: 6, height: Math.max(12, waistY - top - 4), borderRadius: 2, backgroundColor: P.red }]} />
      </>}
      {outfit === "outfit_chef" && <>
        <View style={[s.abs, { top: top + 1, left: 0, width: W, height: 2.5, backgroundColor: P.silver }]} />
        {[0, 1, 2].map(i => [-5, 5].map(dx => <View key={`${i}${dx}`} style={[s.abs, { top: top + 6 + i * 6, left: cx + dx - 1.5, width: 3, height: 3, borderRadius: 2, backgroundColor: P.ink }]} />))}
      </>}
      {outfit === "outfit_athlete" && <>
        <View style={[s.abs, { top: top + 6, left: 0, width: W, height: 4, backgroundColor: P.white }]} />
        <View style={[s.abs, { top: top + 12, left: cx - 4, width: 8, height: 8, borderRadius: 2, backgroundColor: P.white, opacity: 0.9 }]} />
      </>}
      {outfit === "outfit_denim" && <>
        <View style={[s.abs, { top: top - 6, left: cx - chest * 0.3, width: chest * 0.6, height: 10, backgroundColor: P.blue, borderTopLeftRadius: 3, borderTopRightRadius: 3 }]} />
        {[shoulderL, shoulderR].map((x, i) => <View key={i} style={[s.abs, { top: top - 12, left: x - 3, width: 6, height: 14, backgroundColor: P.denim, borderRadius: 1 }]} />)}
        {[shoulderL, shoulderR].map((x, i) => <View key={`b${i}`} style={[s.abs, { top: top - 1, left: x - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: P.cheese }]} />)}
        <View style={[s.abs, { top: bellyY - 4, left: cx - hips * 0.16, width: hips * 0.32, height: 9, borderWidth: 1, borderColor: P.denim, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }]} />
      </>}
      {outfit === "outfit_pajamas" && <>
        {[0, 1, 2].map(i => <View key={i} style={[s.abs, { top: top + 4 + i * 7, left: 0, width: W, height: 3, backgroundColor: P.white, opacity: 0.65 }]} />)}
        <View style={[s.abs, { top: bellyY - 2, left: cx + hips * 0.2 }]}><Icon name="moon" size={8} color={P.ink} /></View>
      </>}
      {outfit === "outfit_astronaut" && <>
        <View style={[s.abs, { top: waistY, left: 0, width: W, height: 4, backgroundColor: P.silver }]} />
        <View style={[s.abs, { top: bellyY - 6, left: cx - 9, width: 18, height: 9, borderRadius: 3, backgroundColor: P.ink, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 3 }]}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: P.coral }} /><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: P.mint }} />
        </View>
      </>}
      {outfit === "outfit_superhero" && <>
        <View style={[s.abs, { top: waistY + 1, left: 0, width: W, height: 4, backgroundColor: P.cheese }]} />
        <View style={[s.abs, { top: top + 6, left: cx - 7, width: 14, height: 14, borderRadius: 4, backgroundColor: P.coral, alignItems: "center", justifyContent: "center" }]}><Icon name="flash" size={10} color={P.cheese} /></View>
      </>}
      {outfit === "outfit_pirate" && <>
        <View style={[s.abs, { top: bellyY - 5, left: hipL - 2, width: hips + 4, height: 6, backgroundColor: P.coral, transform: [{ rotate: "-24deg" }] }]} />
        <View style={[s.abs, { top: bellyY + 1, left: cx + hips * 0.18 }]}><Icon name="skull" size={10} color={P.white} /></View>
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  canvas: { position: "absolute", top: 0, left: 0, transformOrigin: "top left" },
  abs: { position: "absolute" },
});
