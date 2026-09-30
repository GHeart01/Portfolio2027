/** Lighthouse CI: run against `wrangler dev` (the real Worker + static assets runtime). */
module.exports = {
  ci: {
    collect: {
      url: [
        "http://localhost:8787/",
        "http://localhost:8787/experience",
        "http://localhost:8787/projects/lidar-scout",
        "http://localhost:8787/resume",
        "http://localhost:8787/ask",
        "http://localhost:8787/sim",
      ],
      numberOfRuns: 1,
      settings: { onlyCategories: ["performance", "accessibility", "best-practices", "seo"] },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
