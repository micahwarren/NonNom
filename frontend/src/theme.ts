// NomNom design tokens. Warm, playful, tactile light theme.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

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
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && system !== "unspecified" && themes[system as ColorScheme] ? (system as ColorScheme) : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
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
