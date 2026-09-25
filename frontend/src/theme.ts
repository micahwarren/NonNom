// NomNom design tokens. Warm, playful, tactile light theme.
import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#FFF9F5",
  onSurface: "#2B2D42",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2B2D42",
  surfaceTertiary: "#FFE3D8",
  onSurfaceTertiary: "#2B2D42",
  surfaceInverse: "#2B2D42",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8D99AE",

  // Brand
  brand: "#FF7369",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF7369",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFD166",
  onBrandSecondary: "#2B2D42",
  brandTertiary: "#FFAA99",
  onBrandTertiary: "#2B2D42",

  // Status
  success: "#06D6A0",
  onSuccess: "#FFFFFF",
  warning: "#FFD166",
  onWarning: "#2B2D42",
  error: "#EF476F",
  onError: "#FFFFFF",
  info: "#4CC9F0",
  onInfo: "#FFFFFF",

  // Lines
  border: "#F3E4DA",
  borderStrong: "#E6CFC0",
  divider: "#F3E4DA",

  // Text hierarchy (higher contrast than muted)
  textSecondary: "#5B6478",
  // Semantic nutrition colors
  calories: "#FF7369",
  protein: "#7C5CFF",
  carbs: "#F2A93B",
  fat: "#2EC4B6",
  water: "#3DA5F4",
  premium: "#C9932F",
  overlay: "rgba(43,45,66,0.45)",
  skeleton: "#F0E6DF",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
const dark: ThemeColors = {
  ...light,
  surface: "#13171F", onSurface: "#F2F3F7",
  surfaceSecondary: "#1E2430", onSurfaceSecondary: "#F2F3F7",
  surfaceTertiary: "#30303B", onSurfaceTertiary: "#F2F3F7",
  surfaceInverse: "#343F53", onSurfaceInverse: "#FFFFFF",
  muted: "#9BA6BB", textSecondary: "#BFC7D6",
  brand: "#FF897F", brandPrimary: "#FF897F", onBrand: "#211A20", onBrandPrimary: "#211A20",
  brandTertiary: "#B8776C", onBrandTertiary: "#FFFFFF",
  border: "#323A49", borderStrong: "#586377", divider: "#323A49",
  protein: "#B49AFF", carbs: "#F9C365", fat: "#65DACB", water: "#72BDFF",
  premium: "#E3B760", calories: "#FF897F", error: "#FF7C98",
  overlay: "rgba(0,0,0,0.65)", skeleton: "#303949",
};
export const themes: Record<ColorScheme, ThemeColors> = { light, dark };
const THEME_KEY = "nomnom-color-scheme";
let currentScheme: ColorScheme = defaultScheme;
let ready = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());

let hydration: Promise<void> | null = null;
export function initializeTheme(): Promise<void> {
  // Called after the root mounts, not during module evaluation. Theme colors
  // and StatusBar are controlled by React; no native Appearance override needed.
  hydration ??= AsyncStorage.getItem(THEME_KEY).then(saved => {
    if (saved === "dark" || saved === "light") currentScheme = saved;
  }).catch(() => {}).finally(() => { ready = true; notify(); });
  return hydration;
}

export async function setColorScheme(scheme: ColorScheme | null) {
  const next = scheme ?? defaultScheme;
  // Persist before publishing so failed writes never pretend the choice was saved.
  await AsyncStorage.setItem(THEME_KEY, next);
  currentScheme = next;
  notify();
}

export function useTheme() {
  const scheme = useSyncExternalStore<ColorScheme>(subscribe, () => currentScheme, () => defaultScheme);
  const isReady = useSyncExternalStore(subscribe, () => ready, () => false);
  return { scheme, colors: themes[scheme], ready: isReady, setColorScheme };
}

export function useThemeStyles<T>(factory: (colors: ThemeColors) => T) {
  const theme = useTheme();
  const styles = useMemo(() => factory(theme.colors), [factory, theme.colors]);
  return { ...theme, styles };
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

export const typography = {
  displayFont: "System",
  textFont: "System",
};

export const fontSize = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, display: 36, hero: 48 };

export const shadow = {
  card: { shadowColor: "#2B2D42", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  raised: { shadowColor: "#2B2D42", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 5 },
  brand: { shadowColor: "#FF7369", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
};

export const touch = { min: 44, button: 52 };

export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const colors = light;
