// NomNom design system — reusable primitives. Every screen composes from these.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, Platform, KeyboardAvoidingView,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, fontSize, radius, shadow, spacing, touch } from "./theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color = colors.onSurface }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

// --- Button ------------------------------------------------------------------
type ButtonProps = {
  title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "md" | "lg" | "sm"; icon?: IconName; loading?: boolean; disabled?: boolean; style?: ViewStyle; testID?: string;
};
export function Button({ title, onPress, variant = "primary", size = "md", icon, loading, disabled, style, testID }: ButtonProps) {
  const bg = { primary: colors.brandPrimary, secondary: colors.surfaceSecondary, ghost: "transparent", danger: colors.error, dark: colors.surfaceInverse }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.brandPrimary, ghost: colors.brandPrimary, danger: colors.onError, dark: colors.onSurfaceInverse }[variant];
  const h = size === "lg" ? touch.button + 4 : size === "sm" ? 38 : touch.button - 4;
  return (
    <Pressable
      testID={testID} onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [
        s.btn, { backgroundColor: bg, height: h, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: 1.5, borderColor: colors.brandPrimary },
        variant === "primary" && !disabled && shadow.brand, style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={s.btnInner}>
          {icon && <Icon name={icon} size={size === "sm" ? 16 : 19} color={fg} />}
          <Text style={[s.btnText, { color: fg, fontSize: size === "sm" ? fontSize.sm : size === "lg" ? fontSize.lg : fontSize.md }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, size = 40, color = colors.onSurface, bg = colors.surfaceSecondary, testID, label }: { name: IconName; onPress?: () => void; size?: number; color?: string; bg?: string; testID?: string; label?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? name} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={name} size={size * 0.5} color={color} />
    </Pressable>
  );
}

// --- Card / layout --------------------------------------------------------------
export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; testID?: string }) {
  if (onPress) {
    return <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  }
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && <Pressable onPress={onAction} hitSlop={8}><Text style={s.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

export function ScreenHeader({ title, onBack, close, right, subtitle }: { title: string; onBack?: () => void; close?: boolean; right?: React.ReactNode; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={{ width: 40 }}>{onBack && <IconButton name={close ? "close" : "chevron-back"} onPress={onBack} label={close ? "Close" : "Back"} testID="header-back" />}</View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={s.headerSub}>{subtitle}</Text>}
      </View>
      <View style={{ width: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

// --- Progress -----------------------------------------------------------------
export function ProgressBar({ value, color = colors.brandPrimary, height = 10, track = colors.surfaceTertiary }: { value: number; color?: string; height?: number; track?: string }) {
  const w = useSharedValue(0);
  const pct = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  useEffect(() => { w.value = withTiming(pct, { duration: 600, easing: Easing.out(Easing.cubic) }); }, [pct]);
  const st = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}>
      <Animated.View style={[{ height: "100%", borderRadius: height / 2, backgroundColor: color }, st]} />
    </View>
  );
}

export function MacroCard({ label, value, target, color, unit = "g", testID }: { label: string; value: number; target: number; color: string; unit?: string; testID?: string }) {
  const left = Math.max(0, target - value);
  return (
    <Card style={s.macroCard} testID={testID}>
      <View style={s.macroTop}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.macroLabel}>{label}</Text>
      </View>
      <Text style={s.macroValue}>{Math.round(value)}<Text style={s.macroTarget}> / {target}{unit}</Text></Text>
      <ProgressBar value={value / Math.max(target, 1)} color={color} height={6} />
      <Text style={s.macroLeft}>{left > 0 ? `${Math.round(left)}${unit} left` : "Target reached"}</Text>
    </Card>
  );
}

export function StatCard({ label, value, sub, icon, color = colors.brandPrimary, testID, style }: { label: string; value: string; sub?: string; icon?: IconName; color?: string; testID?: string; style?: ViewStyle }) {
  return (
    <Card style={[s.statCard, style ?? {}]} testID={testID}>
      <View style={s.statTop}>
        {icon && <View style={[s.statIcon, { backgroundColor: color + "22" }]}><Icon name={icon} size={16} color={color} /></View>}
        <Text style={s.statLabel}>{label}</Text>
      </View>
      <Text style={s.statValue}>{value}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </Card>
  );
}

// --- States -----------------------------------------------------------------
export function EmptyState({ icon = "leaf-outline", title, message, ctaTitle, onCta, compact }: { icon?: IconName; title: string; message?: string; ctaTitle?: string; onCta?: () => void; compact?: boolean }) {
  return (
    <View style={[s.state, compact && { paddingVertical: spacing.lg }]}>
      <View style={s.stateIcon}><Icon name={icon} size={28} color={colors.brandPrimary} /></View>
      <Text style={s.stateTitle}>{title}</Text>
      {message && <Text style={s.stateMsg}>{message}</Text>}
      {ctaTitle && onCta && <Button title={ctaTitle} onPress={onCta} size="sm" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry, secondaryTitle, onSecondary, title = "Something went wrong" }: { message: string; onRetry?: () => void; secondaryTitle?: string; onSecondary?: () => void; title?: string }) {
  return (
    <View style={s.state} testID="error-state">
      <View style={[s.stateIcon, { backgroundColor: colors.error + "1A" }]}><Icon name="alert-circle-outline" size={28} color={colors.error} /></View>
      <Text style={s.stateTitle}>{title}</Text>
      <Text style={s.stateMsg}>{message}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {onRetry && <Button title="Try again" onPress={onRetry} size="sm" style={{ paddingHorizontal: spacing.lg }} />}
        {secondaryTitle && onSecondary && <Button title={secondaryTitle} onPress={onSecondary} size="sm" variant="secondary" style={{ paddingHorizontal: spacing.lg }} />}
      </View>
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%", radius: r = radius.sm, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: ViewStyle }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    const loop = () => { o.value = withTiming(o.value > 0.7 ? 0.5 : 1, { duration: 700 }, () => loop()); };
    loop();
  }, []);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: colors.skeleton }, st, style]} />;
}

export function LoadingState({ message, rows = 3 }: { message?: string; rows?: number }) {
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }} testID="loading-state">
      {message && <Text style={s.stateMsg}>{message}</Text>}
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={72} radius={radius.lg} />)}
    </View>
  );
}

export function PremiumBadge({ small }: { small?: boolean }) {
  return (
    <View style={[s.premium, small && { paddingHorizontal: 6, paddingVertical: 2 }]}>
      <Icon name="sparkles" size={small ? 10 : 12} color={colors.onSurfaceInverse} />
      <Text style={[s.premiumText, small && { fontSize: 10 }]}>Premium</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={({ pressed }) => [s.chip, selected && s.chipOn, pressed && { opacity: 0.8 }]}>
      {icon && <Icon name={icon} size={14} color={selected ? colors.onBrandPrimary : colors.onSurface} />}
      <Text style={[s.chipText, selected && { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map(o => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} testID={`seg-${o.value}`} style={[s.segItem, value === o.value && s.segOn]} accessibilityRole="button" accessibilityState={{ selected: value === o.value }}>
          <Text style={[s.segText, value === o.value && { color: colors.onSurface }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const MEALS: { value: "breakfast" | "lunch" | "dinner" | "snacks"; label: string; icon: IconName }[] = [
  { value: "breakfast", label: "Breakfast", icon: "sunny-outline" }, { value: "lunch", label: "Lunch", icon: "partly-sunny-outline" },
  { value: "dinner", label: "Dinner", icon: "moon-outline" }, { value: "snacks", label: "Snacks", icon: "cafe-outline" },
];
export function MealPicker({ value, onChange }: { value: string; onChange: (m: "breakfast" | "lunch" | "dinner" | "snacks") => void }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
      {MEALS.map(m => <Chip key={m.value} label={m.label} selected={value === m.value} onPress={() => onChange(m.value)} testID={`meal-${m.value}`} />)}
    </View>
  );
}

// --- Form ---------------------------------------------------------------------
export function Field({ label, hint, style, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.fieldLabel}>{label}</Text>}
      <TextInput placeholderTextColor={colors.muted} {...rest} style={[s.input, style]} />
      {hint && <Text style={s.fieldHint}>{hint}</Text>}
    </View>
  );
}

export function Row({ icon, title, subtitle, onPress, right, danger, testID, iconColor }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean; testID?: string; iconColor?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surface }]}>
      {icon && <View style={[s.rowIcon, danger && { backgroundColor: colors.error + "1A" }]}><Icon name={icon} size={18} color={danger ? colors.error : iconColor ?? colors.brandPrimary} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: colors.error }]}>{title}</Text>
        {subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </Pressable>
  );
}

// --- Sheet (bottom sheet built on Modal for cross-platform reliability) -------
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(400);
  useEffect(() => { if (visible) y.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }); else y.value = 400; }, [visible]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close sheet" />
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }, st]}>
          <View style={s.grabber} />
          {title && <Text style={s.sheetTitle}>{title}</Text>}
          <Body style={{ maxHeight: 560 }} contentContainerStyle={scroll ? { gap: spacing.sm } : undefined} keyboardShouldPersistTaps="handled">{children}</Body>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Toast -------------------------------------------------------------------
type ToastCtx = { show: (msg: string, opts?: { icon?: IconName; actionTitle?: string; onAction?: () => void }) => void };
const ToastContext = createContext<ToastCtx>({ show: () => {} });
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; icon?: IconName; actionTitle?: string; onAction?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((msg: string, opts?: { icon?: IconName; actionTitle?: string; onAction?: () => void }) => {
    setToast({ msg, ...opts });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), opts?.actionTitle ? 5000 : 2600);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[s.toast, { bottom: insets.bottom + 90 }]} pointerEvents="box-none">
          <View style={s.toastInner} testID="toast">
            <Icon name={toast.icon ?? "checkmark-circle"} size={18} color={colors.success} />
            <Text style={s.toastText} numberOfLines={2}>{toast.msg}</Text>
            {toast.actionTitle && (
              <Pressable onPress={() => { toast.onAction?.(); setToast(null); }} hitSlop={8} testID="toast-action"><Text style={s.toastAction}>{toast.actionTitle}</Text></Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// --- styles ------------------------------------------------------------------
const s = StyleSheet.create({
  btn: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontWeight: "700" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  sectionAction: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brandPrimary },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  headerSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  macroCard: { flex: 1, padding: spacing.md, gap: 6 },
  macroTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  macroValue: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  macroTarget: { fontSize: fontSize.xs, fontWeight: "600", color: colors.muted },
  macroLeft: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  statCard: { flex: 1, gap: 4, padding: spacing.md },
  statTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: fontSize.xs, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  statSub: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  state: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  stateIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  stateTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  stateMsg: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  premium: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.premium, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  premiumText: { color: colors.onSurfaceInverse, fontSize: fontSize.xs, fontWeight: "800" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  seg: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3 },
  segItem: { flex: 1, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: colors.surfaceSecondary, ...shadow.card },
  segText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textSecondary },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurface },
  fieldHint: { fontSize: fontSize.xs, color: colors.textSecondary },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: touch.button, fontSize: fontSize.md, color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg },
  toastInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceInverse, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, ...shadow.raised },
  toastText: { flex: 1, color: colors.onSurfaceInverse, fontWeight: "600", fontSize: fontSize.sm },
  toastAction: { color: colors.brandSecondary, fontWeight: "800", fontSize: fontSize.sm },
});
