/** The model the ask chat offers. Kept apart from ./engine so the UI can name it without loading WebLLM. */
export const MODEL = {
  label: "Qwen3 1.7B",
  f16: "Qwen3-1.7B-q4f16_1-MLC",
  f32: "Qwen3-1.7B-q4f32_1-MLC",
  approxDownload: "~980 MB",
} as const;
