export type GridDensity = "compact" | "comfortable";

export const readGridDensity = (key: string): GridDensity => {
  if (typeof window === "undefined") {
    return "compact";
  }

  return localStorage.getItem(key) === "comfortable" ? "comfortable" : "compact";
};

export const writeGridDensity = (key: string, density: GridDensity) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(key, density);
};
