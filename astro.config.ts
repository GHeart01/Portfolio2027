import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/content/site";
import validateContent from "./src/integrations/validate-content";

export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
    inlineStylesheets: "always",
  },
  integrations: [validateContent(), sitemap()],
  security: {
    // Emitted as a <meta> CSP with hashes for Astro's own scripts/styles. frame-ancestors is set in
    // public/_headers because it can't be delivered via <meta>.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        // WebLLM (the `ask` command) downloads model weights and its wasm runtime from these hosts.
        "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com",
        "worker-src 'self' blob:",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
    },
  },
  server: { port: 5190 },
  devToolbar: { enabled: false },
  markdown: { syntaxHighlight: false },
  vite: {
    // WebLLM (loaded only after [load model]) is one ~6 MB module; that's expected.
    build: { chunkSizeWarningLimit: 7000 },
    server: {
      strictPort: true,
      // `pnpm dev:worker` serves /mcp; proxy it so the site and the endpoint share an origin in dev.
      proxy: { "/mcp": "http://localhost:8787" },
    },
  },
});
