export type Units = "imperial" | "metric";

export const kgToLb = (kg: number) => kg * 2.20462;
export const lbToKg = (lb: number) => lb / 2.20462;
export const cmToFtIn = (cm: number) => { const total = cm / 2.54; const ft = Math.floor(total / 12); return { ft, inch: Math.round(total - ft * 12) }; };
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;

export function fmtWeight(kg: number | null | undefined, units: Units = "imperial", digits = 1) {
  if (kg == null) return "—";
  return units === "metric" ? `${kg.toFixed(digits)} kg` : `${kgToLb(kg).toFixed(digits)} lb`;
}
export function weightValue(kg: number, units: Units) { return units === "metric" ? kg : kgToLb(kg); }
export function weightToKg(v: number, units: Units) { return units === "metric" ? v : lbToKg(v); }
export function fmtWater(ml: number, units: Units = "imperial") {
  return units === "metric" ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 1 : 2)} L` : `${Math.round(ml / 29.5735)} oz`;
}
export const fmtNum = (n: number) => Math.round(n).toLocaleString();
export function greeting(name?: string) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = (name ?? "").trim().split(" ")[0];
  return first ? `${g}, ${first}` : g;
}
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function dayName(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const t = new Date(); const today = todayISO();
  if (iso === today) return "Today";
  t.setDate(t.getDate() - 1);
  if (iso === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}
