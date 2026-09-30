import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/content/site";

export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
    inlineStylesheets: "always",
  },
  integrations: [sitemap()],
  server: { port: 5190 },
  vite: {
    server: {
      strictPort: true,
      // `pnpm dev:worker` serves /mcp; proxy it so the site and the endpoint share an origin in dev.
      proxy: { "/mcp": "http://localhost:8787" },
    },
  },
});
