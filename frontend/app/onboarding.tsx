import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api, Profile, Targets } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Chip, Field, Icon, IconName, ProgressBar, Segmented, useToast } from "@/src/ui";
import { ftInToCm, cmToFtIn, lbToKg, kgToLb, fmtNum, fmtWater, fmtWeight } from "@/src/units";
import { track } from "@/src/analytics";

type Step = "welcome" | "goal" | "about" | "body" | "activity" | "diet" | "plan";
const GOALS: { v: Profile["goal"]; label: string; icon: IconName; sub: string }[] = [
  { v: "lose", label: "Lose weight", icon: "trending-down-outline", sub: "A steady, sustainable deficit" },
  { v: "maintain", label: "Maintain weight", icon: "remove-outline", sub: "Stay where you are, eat well" },
  { v: "gain", label: "Gain weight", icon: "trending-up-outline", sub: "Build with a modest surplus" },
  { v: "improve", label: "Improve nutrition", icon: "leaf-outline", sub: "Focus on protein and balance" },
];
const ACTIVITY = [
  { v: "sedentary", label: "Mostly sitting", sub: "Desk work, little exercise" }, { v: "light", label: "Lightly active", sub: "Walks, 1–2 workouts a week" },
  { v: "moderate", label: "Moderately active", sub: "3–5 workouts a week" }, { v: "active", label: "Very active", sub: "Hard training most days" },
];
const DIETS = ["No preference", "Vegetarian", "Vegan", "Pescatarian", "Keto", "Halal", "Kosher", "Gluten-free"];
const ALLERGIES = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Shellfish", "Fish"];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const p0 = user?.profile ?? {};
  const [step, setStep] = useState<Step>(edit ? "goal" : "welcome");
  const [units, setUnits] = useState<"imperial" | "metric">(p0.units ?? "imperial");
  const [goal, setGoal] = useState<Profile["goal"]>(p0.goal ?? undefined);
  const [age, setAge] = useState(p0.age ? String(p0.age) : "");
  const [sex, setSex] = useState<Profile["sex"]>(p0.sex ?? undefined);
  const [ft, setFt] = useState(p0.height_cm ? String(cmToFtIn(p0.height_cm).ft) : ""); const [inch, setInch] = useState(p0.height_cm ? String(cmToFtIn(p0.height_cm).inch) : ""); const [cm, setCm] = useState(p0.height_cm ? String(Math.round(p0.height_cm)) : "");
  const [weight, setWeight] = useState(p0.weight_kg ? (units === "metric" ? p0.weight_kg.toFixed(1) : kgToLb(p0.weight_kg).toFixed(0)) : "");
  const [goalWeight, setGoalWeight] = useState(p0.goal_weight_kg ? (units === "metric" ? p0.goal_weight_kg.toFixed(1) : kgToLb(p0.goal_weight_kg).toFixed(0)) : "");
  const [activity, setActivity] = useState(p0.activity_level ?? "light");
  const [pace, setPace] = useState(p0.pace_lb_per_week ?? 1);
  const [diet, setDiet] = useState(p0.diet ?? "No preference");
  const [allergies, setAllergies] = useState<string[]>(p0.allergies ?? []);
  const [plan, setPlan] = useState<(Targets & { rationale?: string[]; fiber_g?: number }) | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = useMemo(() => ["welcome", "goal", "about", "body", "activity", "diet", "plan"], []);
  const idx = steps.indexOf(step);

  function profile(): Profile {
    const heightCm = units === "metric" ? parseFloat(cm) : ftInToCm(parseFloat(ft) || 0, parseFloat(inch) || 0);
    const w = parseFloat(weight); const gw = parseFloat(goalWeight);
    return {
      goal, age: parseInt(age) || undefined, sex, height_cm: heightCm || undefined,
      weight_kg: w ? (units === "metric" ? w : lbToKg(w)) : undefined, goal_weight_kg: gw && goal !== "maintain" ? (units === "metric" ? gw : lbToKg(gw)) : undefined,
      activity_level: activity, pace_lb_per_week: goal === "lose" || goal === "gain" ? pace : undefined,
      diet: diet === "No preference" ? undefined : diet, allergies, units,
    };
  }
  async function next() {
    if (step === "diet") {
      setBusy(true);
      try { setPlan(await api.previewTargets(profile())); setStep("plan"); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
      return;
    }
    setStep(steps[idx + 1]);
  }
  async function finish() {
    setBusy(true);
    try {
      const u = await api.onboarding(profile());
      track("onboarding_completed", { goal });
      setUser(u);
      router.replace("/(tabs)");
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  const canNext = step === "goal" ? !!goal : step === "about" ? !!(parseInt(age) && sex) : step === "body" ? !!(parseFloat(weight) && (units === "metric" ? parseFloat(cm) : parseFloat(ft))) : true;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      {step !== "welcome" && (
        <View style={styles.top}>
          <Pressable onPress={() => (idx > 1 || edit ? (idx > (edit ? 1 : 0) ? setStep(steps[idx - 1]) : router.back()) : setStep("welcome"))} hitSlop={10} accessibilityLabel="Back" testID="onb-back"><Icon name="chevron-back" size={24} /></Pressable>
          <View style={{ flex: 1 }}><ProgressBar value={idx / (steps.length - 1)} height={6} /></View>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === "welcome" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingTop: spacing.xxl }}>
            <BuddyAvatar state="celebrating" size={200} />
            <Text style={styles.h1}>Welcome to NomNom</Text>
            <Text style={styles.lead}>Meet the nutrition buddy that helps you figure out what to eat next.</Text>
          </View>
        )}
        {step === "goal" && (
          <>
            <Text style={styles.h1}>What's your primary goal?</Text>
            {GOALS.map(g => (
              <Pressable key={g.v} testID={`goal-${g.v}`} onPress={() => setGoal(g.v)} style={[styles.option, goal === g.v && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: goal === g.v }}>
                <View style={styles.optIcon}><Icon name={g.icon} size={22} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}><Text style={styles.optTitle}>{g.label}</Text><Text style={styles.optSub}>{g.sub}</Text></View>
                {goal === g.v && <Icon name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
          </>
        )}
        {step === "about" && (
          <>
            <Text style={styles.h1}>A little about you</Text>
            <Text style={styles.lead}>Used only to estimate your calorie needs.</Text>
            <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="30" testID="onb-age" />
            <Text style={styles.label}>Sex (for calorie estimate)</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(["female", "male", "unspecified"] as const).map(s => <Chip key={s} label={s === "unspecified" ? "Prefer not to say" : s[0].toUpperCase() + s.slice(1)} selected={sex === s} onPress={() => setSex(s)} testID={`sex-${s}`} />)}
            </View>
          </>
        )}
        {step === "body" && (
          <>
            <Text style={styles.h1}>Height and weight</Text>
            <Segmented options={[{ value: "imperial", label: "lb / ft" }, { value: "metric", label: "kg / cm" }]} value={units} onChange={setUnits} />
            {units === "metric" ? <Field label="Height (cm)" value={cm} onChangeText={setCm} keyboardType="number-pad" placeholder="170" testID="onb-cm" /> : (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Field label="Height (ft)" value={ft} onChangeText={setFt} keyboardType="number-pad" placeholder="5" testID="onb-ft" /></View>
                <View style={{ flex: 1 }}><Field label="(in)" value={inch} onChangeText={setInch} keyboardType="number-pad" placeholder="9" testID="onb-in" /></View>
              </View>
            )}
            <Field label={`Current weight (${units === "metric" ? "kg" : "lb"})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={units === "metric" ? "75" : "165"} testID="onb-weight" />
            {(goal === "lose" || goal === "gain") && <Field label={`Goal weight (${units === "metric" ? "kg" : "lb"})`} value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" testID="onb-goal-weight" />}
          </>
        )}
        {step === "activity" && (
          <>
            <Text style={styles.h1}>How active are you?</Text>
            {ACTIVITY.map(a => (
              <Pressable key={a.v} testID={`activity-${a.v}`} onPress={() => setActivity(a.v)} style={[styles.option, activity === a.v && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: activity === a.v }}>
                <View style={{ flex: 1 }}><Text style={styles.optTitle}>{a.label}</Text><Text style={styles.optSub}>{a.sub}</Text></View>
                {activity === a.v && <Icon name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
            {(goal === "lose" || goal === "gain") && (
              <>
                <Text style={styles.label}>Desired pace</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                  {[0.5, 1, 1.5, 2].map(v => <Chip key={v} label={`${v} lb/week`} selected={pace === v} onPress={() => setPace(v)} testID={`pace-${v}`} />)}
                </View>
                <Text style={styles.optSub}>Slower paces are easier to sustain.</Text>
              </>
            )}
          </>
        )}
        {step === "diet" && (
          <>
            <Text style={styles.h1}>Any dietary preferences?</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>{DIETS.map(d => <Chip key={d} label={d} selected={diet === d} onPress={() => setDiet(d)} testID={`diet-${d}`} />)}</View>
            <Text style={styles.label}>Allergies (optional)</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>{ALLERGIES.map(a => <Chip key={a} label={a} selected={allergies.includes(a)} onPress={() => setAllergies(x => x.includes(a) ? x.filter(y => y !== a) : [...x, a])} />)}</View>
            <Text style={styles.optSub}>Used to filter "What should I eat?" suggestions.</Text>
          </>
        )}
        {step === "plan" && plan && (
          <View style={{ gap: spacing.md }} testID="plan-reveal">
            <View style={{ alignItems: "center" }}><BuddyAvatar state="excellent" size={120} /></View>
            <Text style={[styles.h1, { textAlign: "center" }]}>Your NomNom Plan</Text>
            <View style={styles.planCard}>
              <Text style={styles.planBig}>{fmtNum(plan.calories)}</Text><Text style={styles.planBigL}>calories / day</Text>
              <View style={styles.planRow}>
                <PlanStat v={`${plan.protein_g}g`} l="protein" c={colors.protein} /><PlanStat v={`${plan.carbs_g}g`} l="carbs" c={colors.carbs} /><PlanStat v={`${plan.fat_g}g`} l="fat" c={colors.fat} /><PlanStat v={fmtWater(plan.water_ml, units)} l="water" c={colors.water} />
              </View>
            </View>
            {(goal === "lose" || goal === "gain") && parseFloat(weight) && parseFloat(goalWeight) ? (
              <Text style={styles.lead}>Goal: {fmtWeight(profile().weight_kg!, units, 0)} → {fmtWeight(profile().goal_weight_kg!, units, 0)} · about {pace} lb/week</Text>
            ) : null}
            <Pressable onPress={() => setShowWhy(v => !v)} style={styles.whyBtn} testID="plan-why" accessibilityRole="button">
              <Icon name="flask-outline" size={16} color={colors.brandPrimary} /><Text style={styles.whyText}>How we calculated this</Text><Icon name={showWhy ? "chevron-up" : "chevron-down"} size={16} color={colors.brandPrimary} />
            </Pressable>
            {showWhy && (
              <View style={styles.whyBox} testID="plan-rationale">
                {(plan.rationale ?? []).map((r, i) => <Text key={i} style={styles.whyLine}>• {r}</Text>)}
                <Text style={styles.whyRef}>Sources: Mifflin-St Jeor (1990); Frankenfield et al., JADA 2005; ISSN Position Stand on protein (Jäger et al., 2017); Morton et al., BJSM 2018; IOM Dietary Reference Intakes (2005); EFSA water adequate intakes (2010).</Text>
              </View>
            )}
            <Text style={styles.fine}>These targets are estimates based on published formulas. You can adjust them any time in Profile → Daily Targets. NomNom isn't medical advice.</Text>
          </View>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        {step === "plan"
          ? <Button title={edit ? "Save My Plan" : "Start My Plan"} size="lg" onPress={finish} loading={busy} testID="onb-finish" />
          : <Button title="Continue" size="lg" onPress={next} disabled={!canNext} loading={busy} testID="onb-next" />}
      </View>
    </View>
  );
}

function PlanStat({ v, l, c }: { v: string; l: string; c: string }) {
  return <View style={{ alignItems: "center", flex: 1 }}><Text style={[styles.planV, { color: c }]}>{v}</Text><Text style={styles.planL}>{l}</Text></View>;
}

const styles = StyleSheet.create({
  whyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44 },
  whyText: { fontWeight: "800", color: colors.brandPrimary, fontSize: fontSize.sm },
  whyBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 6, borderWidth: 1, borderColor: colors.border },
  whyLine: { fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 20 },
  whyRef: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 16, marginTop: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  h1: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  lead: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 24, textAlign: "center" },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border, minHeight: 68 },
  optionOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  optIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  optTitle: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  optSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  planCard: { backgroundColor: colors.surfaceInverse, borderRadius: radius.xl, padding: spacing.xl, alignItems: "center", gap: 4 },
  planBig: { fontSize: fontSize.hero, fontWeight: "800", color: colors.onSurfaceInverse, letterSpacing: -1.5 },
  planBigL: { fontSize: fontSize.sm, color: colors.onSurfaceInverse, opacity: 0.75, fontWeight: "600", marginBottom: spacing.md },
  planRow: { flexDirection: "row", alignSelf: "stretch" },
  planV: { fontSize: fontSize.lg, fontWeight: "800" },
  planL: { fontSize: fontSize.xs, color: colors.onSurfaceInverse, opacity: 0.75, fontWeight: "600" },
  fine: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface },
});
