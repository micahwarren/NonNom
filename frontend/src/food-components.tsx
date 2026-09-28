// Shared food UI: FoodRow, EditFoodSheet (edit/move/duplicate/delete), DbFoodSheet (database product confirm), ConfirmItems (AI results before logging).
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStyles, ThemeColors, fontSize, radius, spacing } from "./theme";
import { Button, Chip, Field, Icon, MealPicker, Sheet, useToast } from "./ui";
import { AiItem, api, DbFood, FoodEntry, FoodItemIn, Meal, fileUrl } from "./api";
import { useAuthToken } from "./auth-context";
import { track } from "./analytics";

export function SourceTag({ source }: { source: string }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  const label = source === "database" ? "Database" : source === "ai_estimate" ? "AI estimate" : "Manual";
  const color = source === "database" ? colors.success : source === "ai_estimate" ? colors.protein : colors.muted;
  return <View style={[s.tag, { borderColor: color + "66" }]}><Text style={[s.tagText, { color }]}>{label}</Text></View>;
}

export function MacroLine({ p, c, f, size = fontSize.xs }: { p: number; c: number; f: number; size?: number }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  return (
    <Text style={[s.macroLine, { fontSize: size }]}>
      <Text style={{ color: colors.protein }}>P {Math.round(p)}g</Text> · <Text style={{ color: colors.carbs }}>C {Math.round(c)}g</Text> · <Text style={{ color: colors.fat }}>F {Math.round(f)}g</Text>
    </Text>
  );
}

export function FoodRow({ item, onPress, testID }: { item: FoodEntry; onPress?: () => void; testID?: string }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  const token = useAuthToken();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.calories} calories`} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surface }]}>
      {item.image_path ? <Image source={{ uri: fileUrl(item.image_path, token) }} style={s.thumb} accessibilityIgnoresInvertColors testID="food-thumb" /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowName} numberOfLines={1}>{item.name}{item.brand ? <Text style={s.rowBrand}> · {item.brand}</Text> : null}</Text>
        <Text style={s.rowServing}>{item.quantity !== 1 ? `${item.quantity} × ` : ""}{item.serving_label}</Text>
        <MacroLine p={item.protein_g} c={item.carbs_g} f={item.fat_g} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={s.rowCal}>{item.calories} <Text style={s.rowKcal}>kcal</Text></Text>
        {item.data_source === "ai_estimate" && <SourceTag source="ai_estimate" />}
      </View>
    </Pressable>
  );
}

// --- Edit an existing entry -------------------------------------------------------
export function EditFoodSheet({ item, onClose, onChanged }: { item: FoodEntry | null; onClose: () => void; onChanged: () => void }) {
  const { styles: s } = useThemeStyles(createStyles);
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [meal, setMeal] = useState<Meal>("lunch");
  const [name, setName] = useState("");
  const [cal, setCal] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (item) { setQty(String(item.quantity)); setMeal(item.meal); setName(item.name); setCal(String(item.calories)); setConfirmDelete(false); } }, [item?.id]);
  if (!item) return null;
  const q = parseFloat(qty) || 1;
  const factor = q / (item.quantity || 1);

  async function save() {
    setBusy(true);
    try {
      const patch: any = { meal };
      if (name.trim() && name.trim() !== item!.name) patch.name = name.trim();
      const calNum = parseFloat(cal);
      if (!isNaN(calNum) && Math.round(calNum) !== item!.calories) patch.calories = calNum;
      if (q !== item!.quantity) patch.quantity = q;
      // When only quantity changed, backend scales macros; when calories edited explicitly, keep quantity edit consistent
      if (patch.quantity && patch.calories === undefined) { /* backend scales */ } else if (patch.quantity) { patch.protein_g = item!.protein_g * factor; patch.carbs_g = item!.carbs_g * factor; patch.fat_g = item!.fat_g * factor; }
      await api.editFood(item!.id, patch);
      toast.show("Entry updated");
      onChanged(); onClose();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try { await api.deleteFood(item!.id); toast.show("Entry removed"); onChanged(); onClose(); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }
  async function dup() {
    setBusy(true);
    try { await api.duplicateFood(item!.id, meal); track("meal_logged", { source: "duplicate" }); toast.show("Logged again"); onChanged(); onClose(); } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  return (
    <Sheet visible={!!item} onClose={onClose} title="Edit entry">
      <Field label="Food" value={name} onChangeText={setName} testID="edit-name" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Servings" value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="edit-qty" hint={item.serving_label} /></View>
        <View style={{ flex: 1 }}><Field label="Calories" value={cal} onChangeText={setCal} keyboardType="number-pad" testID="edit-cal" hint={`≈ ${Math.round(item.calories * factor)} at ${q} servings`} /></View>
      </View>
      <Text style={s.label}>Meal</Text>
      <MealPicker value={meal} onChange={setMeal} />
      <View style={{ height: spacing.sm }} />
      <Button title="Save changes" onPress={save} loading={busy} testID="edit-save" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Log again" icon="copy-outline" variant="secondary" onPress={dup} disabled={busy} style={{ flex: 1 }} testID="edit-duplicate" />
        <Button title={confirmDelete ? "Confirm delete" : "Delete"} icon="trash-outline" variant={confirmDelete ? "danger" : "ghost"} onPress={del} disabled={busy} style={{ flex: 1 }} testID="edit-delete" />
      </View>
    </Sheet>
  );
}

// --- Confirm a database product (search / barcode) -------------------------------
export function DbFoodSheet({ food, onClose, onLogged, source }: { food: DbFood | null; onClose: () => void; onLogged: () => void; source: "search" | "barcode" }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"serving" | "100g">("serving");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQty("1"); setUnit("serving"); }, [food?.provider_id]);
  const base = useMemo(() => (unit === "serving" ? food?.per_serving : food?.per_100g), [food, unit]);
  const q = parseFloat(qty) || 0;
  if (!food || !base) return null;
  const calc = (v?: number) => Math.round(((v ?? 0) * q) * 10) / 10;

  async function add(meal: Meal) {
    if (q <= 0) return toast.show("Enter a quantity", { icon: "alert-circle" });
    setBusy(true);
    const item: FoodItemIn = {
      name: food!.name, brand: food!.brand, calories: calc(base!.calories), protein_g: calc(base!.protein_g), carbs_g: calc(base!.carbs_g), fat_g: calc(base!.fat_g),
      fiber_g: base!.fiber_g != null ? calc(base!.fiber_g) : null, sugar_g: base!.sugar_g != null ? calc(base!.sugar_g) : null, sodium_mg: base!.sodium_mg != null ? calc(base!.sodium_mg) : null,
      serving_label: unit === "serving" ? food!.serving_label : "100 g", quantity: q, meal, source, data_source: "database", barcode: food!.barcode, provider: food!.provider, provider_id: food!.provider_id,
    };
    try {
      const r = await api.logFood(item);
      track("meal_logged", { source });
      toast.show(`Added to ${meal}`);
      if (r.unlocked?.length) setTimeout(() => toast.show(`Achievement unlocked: ${r.unlocked[0].name}`, { icon: "trophy" }), 900);
      onLogged(); onClose();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  return (
    <Sheet visible={!!food} onClose={onClose}>
      <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
        {food.image_url ? <Image source={{ uri: food.image_url }} style={s.prodImg} /> : <View style={[s.prodImg, { alignItems: "center", justifyContent: "center" }]}><Icon name="nutrition-outline" size={26} color={colors.muted} /></View>}
        <View style={{ flex: 1 }}>
          {food.brand && <Text style={s.brand}>{food.brand}</Text>}
          <Text style={s.prodName} testID="db-food-name">{food.name}</Text>
          <SourceTag source="database" />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}><Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="decimal-pad" testID="db-qty" /></View>
        <View style={{ flex: 1.4, gap: 6 }}>
          <Text style={s.label}>Unit</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Chip label={food.serving_label.length > 14 ? "serving" : food.serving_label} selected={unit === "serving"} onPress={() => setUnit("serving")} />
            <Chip label="100 g" selected={unit === "100g"} onPress={() => setUnit("100g")} />
          </View>
        </View>
      </View>
      <View style={s.nutriGrid}>
        <Nutri label="Calories" v={`${Math.round(calc(base.calories))}`} big />
        <Nutri label="Protein" v={`${calc(base.protein_g)}g`} color={colors.protein} />
        <Nutri label="Carbs" v={`${calc(base.carbs_g)}g`} color={colors.carbs} />
        <Nutri label="Fat" v={`${calc(base.fat_g)}g`} color={colors.fat} />
      </View>
      {(base.fiber_g != null || base.sugar_g != null || base.sodium_mg != null) && (
        <Text style={s.extra}>Fiber {calc(base.fiber_g)}g · Sugar {calc(base.sugar_g)}g · Sodium {Math.round(calc(base.sodium_mg))}mg</Text>
      )}
      <Text style={s.label}>Add to</Text>
      <View style={s.mealGrid}>
        {(["breakfast", "lunch", "dinner", "snacks"] as Meal[]).map(m => (
          <Button key={m} title={m[0].toUpperCase() + m.slice(1)} onPress={() => add(m)} variant="secondary" size="sm" disabled={busy} style={{ width: "48%" }} testID={`db-add-${m}`} />
        ))}
      </View>
    </Sheet>
  );
}

function Nutri({ label, v, color, big }: { label: string; v: string; color?: string; big?: boolean }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  color ??= colors.onSurface;
  return (
    <View style={s.nutri}>
      <Text style={[s.nutriV, { color, fontSize: big ? fontSize.xl : fontSize.lg }]}>{v}</Text>
      <Text style={s.nutriL}>{label}</Text>
    </View>
  );
}

// --- Confirm AI-detected items before logging -----------------------------------
type ConfirmAiItem = AiItem & { qty: string };
type AiEditDraft = { name: string; serving: string; qty: string; calories: string; protein: string; carbs: string; fat: string };

const EMPTY_AI_DRAFT: AiEditDraft = { name: "", serving: "1 serving", qty: "1", calories: "", protein: "", carbs: "", fat: "" };

export function ConfirmItems({ items: initial, meal: initialMeal, imagePath, scanId, onDone, onCancel, source }: { items: AiItem[]; meal: Meal; imagePath?: string | null; scanId?: string; onDone: () => void; onCancel: () => void | Promise<void>; source: "photo" | "describe" }) {
  const { colors, styles: s } = useThemeStyles(createStyles);
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<ConfirmAiItem[]>(initial.map(i => ({ ...i, qty: String(i.quantity || 1) })));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<AiEditDraft>(EMPTY_AI_DRAFT);
  const [newName, setNewName] = useState("");
  const [newCal, setNewCal] = useState("");
  const [newProtein, setNewProtein] = useState("");
  const [newCarbs, setNewCarbs] = useState("");
  const [newFat, setNewFat] = useState("");
  const totals = items.reduce((a, i) => { const q = parseFloat(i.qty) || 0; return { cal: a.cal + i.calories * q, p: a.p + i.protein_g * q, c: a.c + i.carbs_g * q, f: a.f + i.fat_g * q }; }, { cal: 0, p: 0, c: 0, f: 0 });

  function openEdit(idx: number) {
    const item = items[idx];
    setEditIndex(idx);
    setDraft({
      name: item.name,
      serving: item.serving_label,
      qty: item.qty,
      calories: String(item.calories),
      protein: String(item.protein_g),
      carbs: String(item.carbs_g),
      fat: String(item.fat_g),
    });
  }

  function saveEdit() {
    if (editIndex == null) return;
    const qty = Number(draft.qty);
    const calories = Number(draft.calories);
    const protein = Number(draft.protein);
    const carbs = Number(draft.carbs);
    const fat = Number(draft.fat);
    if (!draft.name.trim() || !draft.serving.trim()) return toast.show("Add a food name and serving size.", { icon: "alert-circle" });
    if (![qty, calories, protein, carbs, fat].every(Number.isFinite) || qty <= 0 || calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
      return toast.show("Use valid non-negative nutrition values and a serving amount above zero.", { icon: "alert-circle" });
    }
    setItems(current => current.map((item, idx) => idx === editIndex ? {
      ...item,
      name: draft.name.trim(),
      serving_label: draft.serving.trim(),
      qty: String(qty),
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    } : item));
    setEditIndex(null);
  }

  async function save() {
    if (!items.length) return;
    setBusy(true);
    const payload: FoodItemIn[] = items.map(i => { const q = parseFloat(i.qty) || 1; return { name: i.name, serving_label: i.serving_label, quantity: q, calories: Math.round(i.calories * q), protein_g: +(i.protein_g * q).toFixed(1), carbs_g: +(i.carbs_g * q).toFixed(1), fat_g: +(i.fat_g * q).toFixed(1), source, data_source: i.data_source ?? "ai_estimate" }; });
    try {
      const r = await api.logFoodBatch(payload, meal, imagePath ?? null, scanId);
      track("meal_logged", { source, items: payload.length });
      toast.show(`Logged ${payload.length} item${payload.length > 1 ? "s" : ""} to ${meal}`);
      if (r.unlocked?.length) setTimeout(() => toast.show(`Achievement unlocked: ${r.unlocked[0].name}`, { icon: "trophy" }), 900);
      onDone();
    } catch (e: any) { toast.show(e.message, { icon: "alert-circle" }); } finally { setBusy(false); }
  }

  async function startOver(manual = false) {
    if (busy || cancelling) return;
    setCancelling(true);
    try { await onCancel(); if (manual) router.replace("/search"); }
    catch (error: any) { toast.show(error.message ?? "Couldn’t return this scan. Please try again.", { icon: "alert-circle" }); }
    finally { setCancelling(false); }
  }

  function addMissedItem() {
    if (!newName.trim()) return;
    const calories = Math.max(0, Number(newCal) || 0);
    const protein = Math.max(0, Number(newProtein) || 0);
    const carbs = Math.max(0, Number(newCarbs) || 0);
    const fat = Math.max(0, Number(newFat) || 0);
    setItems(a => [...a, { name: newName.trim(), serving_label: "1 serving", calories, protein_g: protein, carbs_g: carbs, fat_g: fat, quantity: 1, data_source: "ai_estimate", qty: "1" }]);
    setNewName(""); setNewCal(""); setNewProtein(""); setNewCarbs(""); setNewFat(""); setAdding(false);
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={s.estimateBanner}><Icon name="sparkles" size={14} color={colors.protein} /><Text style={s.estimateText}>AI estimates can be wrong. Review foods, serving sizes, calories, and macros before logging.</Text></View>
      {items.map((it, idx) => (
        <View key={idx} style={s.aiRow} testID={`ai-item-${idx}`}>
          <Pressable style={{ flex: 1, gap: 2 }} onPress={() => openEdit(idx)} accessibilityRole="button" accessibilityLabel={`Edit ${it.name}`} testID={`ai-edit-${idx}`}>
            <View style={s.aiNameRow}>
              <Text style={s.rowName} numberOfLines={1}>{it.name}</Text>
              <Icon name="create-outline" size={15} color={colors.brandPrimary} />
            </View>
            <Text style={s.rowServing}>{it.qty !== "1" ? `${it.qty} × ` : ""}{it.serving_label} · {Math.round(it.calories * (parseFloat(it.qty) || 0))} kcal</Text>
            <MacroLine p={it.protein_g * (parseFloat(it.qty) || 0)} c={it.carbs_g * (parseFloat(it.qty) || 0)} f={it.fat_g * (parseFloat(it.qty) || 0)} />
          </Pressable>
          <View style={s.qtyBox}>
            <Pressable onPress={() => setItems(a => a.map((x, i) => i === idx ? { ...x, qty: String(Math.max(0.25, (parseFloat(x.qty) || 1) - 0.25)) } : x))} style={s.qtyBtn} accessibilityLabel="Decrease"><Icon name="remove" size={16} /></Pressable>
            <Text style={s.qtyText}>{it.qty}×</Text>
            <Pressable onPress={() => setItems(a => a.map((x, i) => i === idx ? { ...x, qty: String((parseFloat(x.qty) || 1) + 0.25) } : x))} style={s.qtyBtn} accessibilityLabel="Increase"><Icon name="add" size={16} /></Pressable>
          </View>
          <Pressable onPress={() => setItems(a => a.filter((_, i) => i !== idx))} hitSlop={8} accessibilityLabel={`Remove ${it.name}`} testID={`ai-remove-${idx}`}><Icon name="close-circle" size={22} color={colors.muted} /></Pressable>
        </View>
      ))}
      {adding ? (
        <View style={s.addEditor}>
          <Field label="Food" placeholder="Food name" value={newName} onChangeText={setNewName} testID="ai-new-name" />
          <View style={s.editGrid}>
            <View style={s.editCell}><Field label="Calories" placeholder="0" value={newCal} onChangeText={setNewCal} keyboardType="decimal-pad" testID="ai-new-cal" /></View>
            <View style={s.editCell}><Field label="Protein (g)" placeholder="0" value={newProtein} onChangeText={setNewProtein} keyboardType="decimal-pad" testID="ai-new-protein" /></View>
            <View style={s.editCell}><Field label="Carbs (g)" placeholder="0" value={newCarbs} onChangeText={setNewCarbs} keyboardType="decimal-pad" testID="ai-new-carbs" /></View>
            <View style={s.editCell}><Field label="Fat (g)" placeholder="0" value={newFat} onChangeText={setNewFat} keyboardType="decimal-pad" testID="ai-new-fat" /></View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Add item" size="sm" onPress={addMissedItem} style={{ flex: 1 }} />
            <Button title="Cancel" size="sm" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={s.addMissed} testID="ai-add-missed"><Icon name="add-circle-outline" size={18} color={colors.brandPrimary} /><Text style={s.addMissedText}>Add a missed food</Text></Pressable>
      )}
      <View style={s.totalCard}>
        <Text style={s.totalLabel}>Estimated total</Text>
        <Text style={s.totalCal}>{Math.round(totals.cal)} kcal</Text>
        <MacroLine p={totals.p} c={totals.c} f={totals.f} size={fontSize.sm} />
      </View>
      <Text style={s.label}>Meal</Text>
      <MealPicker value={meal} onChange={setMeal} />
      <Button title={items.length ? `Add ${items.length} item${items.length > 1 ? "s" : ""}` : "Nothing to add"} onPress={save} loading={busy} disabled={!items.length || cancelling} size="lg" testID="ai-confirm-log" />
      <Button title={cancelling ? "Starting over…" : "Start over"} variant="ghost" onPress={() => startOver()} loading={cancelling} disabled={busy} testID="ai-start-over" />
      {!items.length && <Button title="Enter manually instead" variant="secondary" onPress={() => startOver(true)} disabled={busy || cancelling} testID="ai-manual-fallback" />}

      <Sheet visible={editIndex != null} onClose={() => setEditIndex(null)} title="Edit AI estimate" testID="ai-edit-sheet">
        <Text style={s.editHelp}>Correct anything the AI got wrong. Nutrition values below are per serving; the quantity multiplies them when you log.</Text>
        <Field label="Food" value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} testID="ai-edit-name" />
        <Field label="Serving size" value={draft.serving} onChangeText={v => setDraft(d => ({ ...d, serving: v }))} placeholder="e.g. 6 oz, 1 cup" testID="ai-edit-serving" />
        <View style={s.editGrid}>
          <View style={s.editCell}><Field label="Servings" value={draft.qty} onChangeText={v => setDraft(d => ({ ...d, qty: v }))} keyboardType="decimal-pad" testID="ai-edit-qty" /></View>
          <View style={s.editCell}><Field label="Calories" value={draft.calories} onChangeText={v => setDraft(d => ({ ...d, calories: v }))} keyboardType="decimal-pad" testID="ai-edit-calories" /></View>
          <View style={s.editCell}><Field label="Protein (g)" value={draft.protein} onChangeText={v => setDraft(d => ({ ...d, protein: v }))} keyboardType="decimal-pad" testID="ai-edit-protein" /></View>
          <View style={s.editCell}><Field label="Carbs (g)" value={draft.carbs} onChangeText={v => setDraft(d => ({ ...d, carbs: v }))} keyboardType="decimal-pad" testID="ai-edit-carbs" /></View>
          <View style={s.editCell}><Field label="Fat (g)" value={draft.fat} onChangeText={v => setDraft(d => ({ ...d, fat: v }))} keyboardType="decimal-pad" testID="ai-edit-fat" /></View>
        </View>
        <Button title="Save corrections" onPress={saveEdit} testID="ai-edit-save" style={{ marginTop: spacing.sm }} />
        <Button title="Cancel" variant="ghost" onPress={() => setEditIndex(null)} />
      </Sheet>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.skeleton, marginRight: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 64 },
  rowName: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface },
  rowBrand: { color: colors.textSecondary, fontWeight: "600", fontSize: fontSize.sm },
  rowServing: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  rowCal: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  rowKcal: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  macroLine: { fontWeight: "700", color: colors.textSecondary },
  tag: { alignSelf: "flex-start", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 10, fontWeight: "800" },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  prodImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  brand: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  prodName: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  nutriGrid: { flexDirection: "row", gap: spacing.sm },
  nutri: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" },
  nutriV: { fontWeight: "800" },
  nutriL: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  extra: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600", textAlign: "center" },
  mealGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  estimateBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.protein + "14", padding: spacing.sm, borderRadius: radius.md },
  estimateText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.protein, flex: 1 },
  aiRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  aiNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 2 },
  qtyBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  qtyText: { fontWeight: "800", fontSize: fontSize.sm, minWidth: 40, textAlign: "center", color: colors.onSurface },
  addMissed: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: spacing.sm, alignSelf: "flex-start" },
  addMissedText: { fontWeight: "700", color: colors.brandPrimary, fontSize: fontSize.sm },
  addEditor: { gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  editHelp: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.xs },
  editGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  editCell: { minWidth: 135, flexGrow: 1, flexBasis: "45%" },
  totalCard: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.lg, gap: 2 },
  totalLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  totalCal: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.onSurface },
});
