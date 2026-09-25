import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Icon } from "./ui";

// Fixed illustration palette: character clothing keeps its color in light and dark mode.
const P = { ink: "#2B2D42", white: "#FFFFFF", cheese: "#FFD166", hole: "#D99B32", coral: "#FF7369", blue: "#507DC4", denim: "#355E9C", mint: "#8FE3C6", purple: "#9A7EE8", orange: "#FF9F43", silver: "#D7DFED", syrup: "#AB6841" };

function Art({ u, children }: { u: number; children: React.ReactNode }) {
  return <View pointerEvents="none" style={[s.canvas, { transform: [{ scale: u }] }]}>{children}</View>;
}

export function nomShape(shape: string, u: number): ViewStyle {
  const shapes = StyleSheet.create({
    shape_round: { borderRadius: 32 * u },
    shape_squircle: { borderRadius: 15 * u },
    shape_bean: { borderTopLeftRadius: 40 * u, borderTopRightRadius: 17 * u, borderBottomLeftRadius: 18 * u, borderBottomRightRadius: 40 * u },
    shape_dumpling: { borderTopLeftRadius: 40 * u, borderTopRightRadius: 40 * u, borderBottomLeftRadius: 13 * u, borderBottomRightRadius: 13 * u },
    shape_cloud: { borderRadius: 24 * u },
    shape_drop: { borderTopLeftRadius: 4 * u, borderTopRightRadius: 38 * u, borderBottomLeftRadius: 38 * u, borderBottomRightRadius: 38 * u },
  });
  return shapes[shape as keyof typeof shapes] ?? shapes.shape_round;
}

export function ShapeDetails({ shape, u, body }: { shape: string; u: number; body: string }) {
  if (shape !== "shape_cloud" && shape !== "shape_dumpling") return null;
  return <Art u={u}>{shape === "shape_cloud" ? <>
    <View style={[s.cloudLeft, { backgroundColor: body }]} /><View style={[s.cloudTop, { backgroundColor: body }]} /><View style={[s.cloudRight, { backgroundColor: body }]} />
  </> : <View style={s.pleats}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[s.pleat, { transform: [{ rotate: `${(i - 2) * 12}deg` }] }]} />)}</View>}</Art>;
}

export function ExtraHat({ id, u }: { id: string; u: number }) {
  if (id === "hat_cheese") return <Art u={u}>
    <View style={s.cheeseWedge} /><View style={s.cheeseRind} />
    <View style={s.holeOne} /><View style={s.holeTwo} /><View style={s.holeThree} />
  </Art>;
  if (id === "hat_beer") return <Art u={u}>
    <View style={s.helmet} /><View style={s.helmetBrim} />
    {[false, true].map(right => <View key={String(right)} style={[s.can, right ? s.canRight : s.canLeft]}>
      <View style={s.canTop} /><Icon name="beer" size={9} color={P.white} /><View style={s.canBottom} />
    </View>)}
    <View style={s.strawLeft} /><View style={s.strawRight} />
  </Art>;
  if (id === "hat_pancakes") return <Art u={u}>
    {[0, 1, 2].map(i => <View key={i} style={[s.pancake, { top: -9 - i * 6, width: 49 - i * 4, left: 7 + i * 2 }]} />)}
    <View style={s.syrup} /><View style={s.butter} />
  </Art>;
  if (id === "hat_ufo") return <Art u={u}>
    <View style={s.ufoDome} /><View style={s.ufoRim} /><View style={s.ufoLights}>{[0, 1, 2, 3].map(i => <View key={i} style={s.ufoLight} />)}</View>
  </Art>;
  return null;
}

export function ExtraOutfit({ id, u }: { id: string; u: number }) {
  if (!new Set(["outfit_denim", "outfit_pajamas", "outfit_astronaut", "outfit_superhero", "outfit_pirate"]).has(id)) return null;
  return <Art u={u}>
    {id === "outfit_denim" && <><View style={[s.clothes, s.denim]} /><View style={[s.strap, s.strapLeft]} /><View style={[s.strap, s.strapRight]} /><View style={s.denimPocket} /><View style={s.buttonLeft} /><View style={s.buttonRight} /></>}
    {id === "outfit_pajamas" && <><View style={[s.clothes, s.pajamas]} />{[0, 1, 2].map(i => <View key={i} style={[s.stripe, { top: 43 + i * 7 }]} />)}<View style={s.badge}><Icon name="moon" size={8} color={P.ink} /></View></>}
    {id === "outfit_astronaut" && <><View style={[s.clothes, s.space]} /><View style={s.spaceBelt} /><View style={s.controlPanel}><View style={s.controlLight} /><View style={s.controlBlue} /></View></>}
    {id === "outfit_superhero" && <><View style={[s.clothes, s.super]} /><View style={s.superBelt} /><View style={s.superBadge}><Icon name="flash" size={10} color={P.cheese} /></View></>}
    {id === "outfit_pirate" && <><View style={[s.clothes, s.pirate]} /><View style={s.pirateSash} /><View style={s.badge}><Icon name="skull" size={10} color={P.white} /></View></>}
  </Art>;
}

export function ExtraAccessory({ id, u, behind = false }: { id: string; u: number; behind?: boolean }) {
  if (behind) return id === "acc_wings" ? <Art u={u}><View style={s.wingLeft} /><View style={s.wingRight} /></Art> : null;
  if (id === "acc_moustache") return <Art u={u}><View style={s.stacheLeft} /><View style={s.stacheRight} /></Art>;
  if (id === "acc_floatie") return <Art u={u}><View style={s.floatie} /><View style={s.duckHead}><View style={s.duckEye} /></View><View style={s.duckBeak} /></Art>;
  return null;
}

export function NomShoes({ id, u }: { id: string; u: number }) {
  if (id === "shoes_none") return null;
  return <Art u={u}>{[0, 1].map(i => <View key={i} style={[s.shoePosition, i === 0 ? s.leftFoot : s.rightFoot]}>
    {id === "shoes_rocket" && <View style={s.rocketFlame} />}
    <View style={[s.shoe, id === "shoes_duck" ? s.duckShoe : id === "shoes_rocket" ? s.rocketShoe : id === "shoes_skates" ? s.skateShoe : s.sneaker]}>
      {id === "shoes_duck" ? <><View style={s.slipperEye} /><View style={s.slipperBeak} /></> : <><View style={s.laceOne} /><View style={s.laceTwo} /><View style={s.sole} /></>}
    </View>
    {id === "shoes_skates" && <View style={s.wheels}><View style={s.wheel} /><View style={s.wheel} /></View>}
  </View>)}</Art>;
}

const s = StyleSheet.create({
  canvas: { position: "absolute", top: 0, left: 0, width: 64, height: 60, transformOrigin: "top left" },
  cloudLeft: { position: "absolute", width: 28, height: 32, left: -7, top: 17, borderRadius: 16 },
  cloudTop: { position: "absolute", width: 34, height: 30, left: 15, top: -9, borderRadius: 17 },
  cloudRight: { position: "absolute", width: 28, height: 32, right: -7, top: 17, borderRadius: 16 },
  pleats: { position: "absolute", top: 4, left: 18, flexDirection: "row", gap: 4 },
  pleat: { width: 2, height: 8, backgroundColor: P.syrup, opacity: 0.25, borderRadius: 2 },
  cheeseWedge: { position: "absolute", top: -23, left: 3, width: 58, height: 29, backgroundColor: P.cheese, borderTopLeftRadius: 3, borderTopRightRadius: 24, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, transform: [{ rotate: "-7deg" }] },
  cheeseRind: { position: "absolute", top: 2, left: 3, width: 58, height: 5, backgroundColor: P.hole, borderRadius: 3, transform: [{ rotate: "-7deg" }] },
  holeOne: { position: "absolute", left: 12, top: -17, width: 9, height: 7, borderRadius: 5, backgroundColor: P.hole },
  holeTwo: { position: "absolute", left: 35, top: -11, width: 7, height: 6, borderRadius: 4, backgroundColor: P.hole },
  holeThree: { position: "absolute", left: 23, top: -4, width: 5, height: 4, borderRadius: 3, backgroundColor: P.hole },
  helmet: { position: "absolute", left: 9, top: -14, width: 46, height: 20, borderTopLeftRadius: 23, borderTopRightRadius: 23, backgroundColor: P.blue },
  helmetBrim: { position: "absolute", left: 4, top: 1, width: 56, height: 5, borderRadius: 3, backgroundColor: P.denim },
  can: { position: "absolute", top: -22, width: 13, height: 24, backgroundColor: P.coral, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  canLeft: { left: -2, transform: [{ rotate: "-10deg" }] }, canRight: { right: -2, transform: [{ rotate: "10deg" }] },
  canTop: { position: "absolute", top: 0, width: 13, height: 3, borderRadius: 3, backgroundColor: P.silver },
  canBottom: { position: "absolute", bottom: 0, width: 13, height: 2, backgroundColor: P.silver },
  strawLeft: { position: "absolute", top: -28, left: 3, width: 15, height: 23, borderWidth: 2, borderBottomWidth: 0, borderColor: P.white, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  strawRight: { position: "absolute", top: -28, right: 3, width: 15, height: 23, borderWidth: 2, borderBottomWidth: 0, borderColor: P.white, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  pancake: { position: "absolute", height: 10, borderRadius: 5, backgroundColor: P.cheese, borderBottomWidth: 3, borderColor: P.syrup },
  syrup: { position: "absolute", top: -21, left: 14, width: 36, height: 6, borderRadius: 6, backgroundColor: P.syrup },
  butter: { position: "absolute", top: -25, left: 25, width: 13, height: 5, borderRadius: 2, backgroundColor: P.white },
  ufoDome: { position: "absolute", left: 19, top: -23, width: 26, height: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: P.mint, borderWidth: 2, borderColor: P.white },
  ufoRim: { position: "absolute", top: -8, left: 1, width: 62, height: 12, borderRadius: 12, backgroundColor: P.silver },
  ufoLights: { position: "absolute", top: -3, left: 12, flexDirection: "row", gap: 7 }, ufoLight: { width: 5, height: 3, borderRadius: 2, backgroundColor: P.purple },
  clothes: { position: "absolute", top: 39, left: 0, width: 64, height: 21 },
  denim: { backgroundColor: P.blue }, strap: { position: "absolute", top: 35, width: 6, height: 20, backgroundColor: P.denim }, strapLeft: { left: 9 }, strapRight: { right: 9 },
  denimPocket: { position: "absolute", top: 48, left: 23, width: 18, height: 9, borderWidth: 1, borderColor: P.denim, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  buttonLeft: { position: "absolute", top: 44, left: 10, width: 4, height: 4, borderRadius: 2, backgroundColor: P.cheese }, buttonRight: { position: "absolute", top: 44, right: 10, width: 4, height: 4, borderRadius: 2, backgroundColor: P.cheese },
  pajamas: { backgroundColor: P.purple }, stripe: { position: "absolute", left: 0, width: 64, height: 3, backgroundColor: P.white, opacity: 0.65 },
  badge: { position: "absolute", left: 38, top: 47 }, space: { backgroundColor: P.white }, spaceBelt: { position: "absolute", top: 55, width: 64, height: 4, backgroundColor: P.silver },
  controlPanel: { position: "absolute", left: 23, top: 48, width: 18, height: 9, borderRadius: 3, backgroundColor: P.ink, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 3 },
  controlLight: { width: 4, height: 4, borderRadius: 2, backgroundColor: P.coral }, controlBlue: { width: 4, height: 4, borderRadius: 2, backgroundColor: P.mint },
  super: { backgroundColor: P.blue }, superBelt: { position: "absolute", top: 56, width: 64, height: 4, backgroundColor: P.cheese }, superBadge: { position: "absolute", left: 26, top: 47, backgroundColor: P.coral, borderRadius: 3 },
  pirate: { backgroundColor: P.ink }, pirateSash: { position: "absolute", left: 6, top: 45, width: 53, height: 6, backgroundColor: P.coral, transform: [{ rotate: "-28deg" }] },
  stacheLeft: { position: "absolute", left: 20, top: 35, width: 13, height: 5, borderRadius: 5, borderTopLeftRadius: 0, backgroundColor: P.ink, transform: [{ rotate: "-10deg" }] },
  stacheRight: { position: "absolute", left: 31, top: 35, width: 13, height: 5, borderRadius: 5, borderTopRightRadius: 0, backgroundColor: P.ink, transform: [{ rotate: "10deg" }] },
  floatie: { position: "absolute", top: 48, left: -7, width: 78, height: 15, borderRadius: 12, backgroundColor: P.cheese, borderBottomWidth: 4, borderColor: P.orange },
  duckHead: { position: "absolute", top: 38, right: -9, width: 18, height: 18, borderRadius: 10, backgroundColor: P.cheese }, duckEye: { position: "absolute", top: 5, right: 5, width: 3, height: 3, borderRadius: 2, backgroundColor: P.ink }, duckBeak: { position: "absolute", top: 45, right: -15, width: 10, height: 5, borderRadius: 3, backgroundColor: P.orange },
  wingLeft: { position: "absolute", left: -15, top: 24, width: 25, height: 23, borderRadius: 14, borderTopLeftRadius: 0, backgroundColor: P.white, borderBottomWidth: 3, borderColor: P.silver, transform: [{ rotate: "20deg" }] },
  wingRight: { position: "absolute", right: -15, top: 24, width: 25, height: 23, borderRadius: 14, borderTopRightRadius: 0, backgroundColor: P.white, borderBottomWidth: 3, borderColor: P.silver, transform: [{ rotate: "-20deg" }] },
  shoePosition: { position: "absolute", top: 55, width: 24, height: 17 }, leftFoot: { left: 5 }, rightFoot: { right: 5 },
  shoe: { width: 24, height: 14, borderTopLeftRadius: 8, borderTopRightRadius: 5, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  sneaker: { backgroundColor: P.coral }, duckShoe: { backgroundColor: P.cheese, borderRadius: 9 }, rocketShoe: { backgroundColor: P.silver }, skateShoe: { backgroundColor: P.purple },
  laceOne: { position: "absolute", top: 4, left: 9, width: 7, height: 2, borderRadius: 1, backgroundColor: P.white }, laceTwo: { position: "absolute", top: 7, left: 9, width: 7, height: 2, borderRadius: 1, backgroundColor: P.white },
  sole: { position: "absolute", bottom: 0, width: 24, height: 3, borderRadius: 2, backgroundColor: P.white },
  slipperEye: { position: "absolute", top: 3, left: 5, width: 3, height: 3, borderRadius: 2, backgroundColor: P.ink }, slipperBeak: { position: "absolute", top: 7, left: -3, width: 9, height: 4, borderRadius: 3, backgroundColor: P.orange },
  rocketFlame: { position: "absolute", top: 8, left: 5, width: 14, height: 13, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: P.orange, borderWidth: 3, borderColor: P.cheese },
  wheels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 }, wheel: { width: 6, height: 6, borderRadius: 3, backgroundColor: P.cheese, borderWidth: 1, borderColor: P.hole },
});