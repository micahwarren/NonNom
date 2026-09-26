// Body rig for Nom. All artwork is laid out in a 64x60 "unit" design space (scaled by u = size/100 at render time).
// The rig turns (shape, bodyState) into anchor points so clothing, hats, accessories and shoes are placed relative to the
// actual silhouette instead of being uniformly stretched. Add a new body state here and every garment adapts.
import type { ViewStyle } from "react-native";
import type { NomBody } from "./nom-state";

export type Radii = { tl: number; tr: number; bl: number; br: number };
export type NomRig = {
  width: number; height: number; centerX: number; radii: Radii;
  eyeY: number; neckY: number; torsoTop: number; waistY: number; bellyY: number; feetY: number;
  shoulderL: number; shoulderR: number; hipL: number; hipR: number; footL: number; footR: number; footW: number;
  hatX: number; hatLift: number; bellyBulge: number; faceOffsetX: number; faceScale: number; bodyState: NomBody;
};

const BASE_RADII: Record<string, Radii> = {
  shape_round: { tl: 32, tr: 32, bl: 32, br: 32 },
  shape_squircle: { tl: 15, tr: 15, bl: 15, br: 15 },
  shape_bean: { tl: 40, tr: 17, bl: 18, br: 40 },
  shape_dumpling: { tl: 40, tr: 40, bl: 13, br: 13 },
  shape_cloud: { tl: 24, tr: 24, bl: 24, br: 24 },
  shape_drop: { tl: 4, tr: 38, bl: 38, br: 38 },
};
const HAT_X: Record<string, number> = { shape_drop: 3, shape_bean: -2 };
// Body-state silhouettes: width/height/belly bulge. Face scales slightly so it reads as the same character.
const BODY: Record<NomBody, { w: number; h: number; belly: number; face: number }> = {
  normal: { w: 64, h: 60, belly: 0, face: 1 },
  full: { w: 74, h: 62, belly: 8, face: 1.04 },
  bloated: { w: 70, h: 61, belly: 5, face: 1.02 },
  slim: { w: 57, h: 59, belly: -3, face: 0.96 },
};

/** Horizontal inset of a rounded-rect silhouette at vertical position y, for the left (rl) and right (rr) radii. */
function inset(y: number, height: number, rTop: number, rBottom: number) {
  if (y < rTop) { const dy = rTop - y; return rTop - Math.sqrt(Math.max(0, rTop * rTop - dy * dy)); }
  const fromBottom = height - y;
  if (fromBottom < rBottom) { const dy = rBottom - fromBottom; return rBottom - Math.sqrt(Math.max(0, rBottom * rBottom - dy * dy)); }
  return 0;
}

export function nomRig(shape: string, bodyState: NomBody = "normal"): NomRig {
  const b = BODY[bodyState] ?? BODY.normal;
  const base = BASE_RADII[shape] ?? BASE_RADII.shape_round;
  const k = b.w / 64;
  const radii: Radii = { tl: Math.min(base.tl * k, b.w / 2), tr: Math.min(base.tr * k, b.w / 2), bl: Math.min(base.bl * k, b.w / 2), br: Math.min(base.br * k, b.w / 2) };
  const torsoTop = Math.round(b.h * 0.64);
  const waistY = Math.round(b.h * 0.84);
  const insL = (y: number) => inset(y, b.h, radii.tl, radii.bl);
  const insR = (y: number) => inset(y, b.h, radii.tr, radii.br);
  return {
    width: b.w, height: b.h, centerX: b.w / 2, radii, bodyState,
    eyeY: 20 * b.face, neckY: torsoTop - 3, torsoTop, waistY, bellyY: Math.round((torsoTop + b.h) / 2) + 1, feetY: b.h - 5,
    shoulderL: insL(torsoTop + 3) + 6, shoulderR: b.w - insR(torsoTop + 3) - 6,
    hipL: insL(waistY) + 4, hipR: b.w - insR(waistY) - 4,
    footL: Math.round(b.w * 0.09), footR: Math.round(b.w * 0.09), footW: Math.round(b.w * 0.375),
    hatX: (HAT_X[shape] ?? 0) * k, hatLift: shape === "shape_cloud" ? -6 : 0, bellyBulge: b.belly,
    faceOffsetX: (b.w - 64) / 2, faceScale: b.face,
  };
}

export function rigShapeStyle(rig: NomRig, u: number): ViewStyle {
  return { borderTopLeftRadius: rig.radii.tl * u, borderTopRightRadius: rig.radii.tr * u, borderBottomLeftRadius: rig.radii.bl * u, borderBottomRightRadius: rig.radii.br * u };
}
