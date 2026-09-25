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
  border: "#F5E1D5",
  borderStrong: "#E8C9B8",
  divider: "#F5E1D5",
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
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const typography = {
  displayFont: "System",
  textFont: "System",
};

export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const colors = light;
