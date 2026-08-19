export function supportsWebGL(): boolean {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}
