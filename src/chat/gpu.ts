/**
 * Decides whether to offer the in-browser model. Having WebGPU isn't enough: phones and small devices
 * expose it but can't hold a 1.7B model, so they get keyword search (with a "try anyway" escape hatch).
 */
export type GpuSupport =
  | { ok: true; f16: boolean }
  | { ok: false; reason: "no-webgpu" | "no-adapter" | "small-device" | "touch"; f16: boolean };

interface GpuAdapterLike {
  features: { has(name: string): boolean };
}
interface GpuLike {
  requestAdapter(opts?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
}

export async function detectGpu(): Promise<GpuSupport> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return { ok: false, reason: "no-webgpu", f16: false };
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" }).catch(() => null);
  if (!adapter) return { ok: false, reason: "no-adapter", f16: false };
  const f16 = adapter.features.has("shader-f16");
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory < 8) return { ok: false, reason: "small-device", f16 };
  const touchOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  if (touchOnly) return { ok: false, reason: "touch", f16 };
  return { ok: true, f16 };
}

export const GPU_REASONS: Record<Exclude<GpuSupport, { ok: true }>["reason"], string> = {
  "no-webgpu": "This browser doesn't support WebGPU",
  "no-adapter": "WebGPU is available but no GPU adapter was found",
  "small-device": "This device reports less memory than the model needs",
  touch: "This looks like a phone or tablet, where a 1 GB model is a bad idea",
};
