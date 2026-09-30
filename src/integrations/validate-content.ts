import { existsSync, readFileSync } from "node:fs";
import type { AstroIntegration } from "astro";
import { validateResume } from "../content/validate";
import { lintText, parseDenylist } from "../../scripts/content-lint-rules";

const CONTENT = "content/resume.json";

/** Fails the build if resume.json is invalid or trips a content-safety error. */
export default function validateContent(): AstroIntegration {
  return {
    name: "validate-content",
    hooks: {
      "astro:config:setup": ({ logger }) => {
        const text = readFileSync(CONTENT, "utf8");
        const result = validateResume(JSON.parse(text));
        if (!result.ok) {
          throw new Error(`${CONTENT} is invalid:\n${result.errors.join("\n")}`);
        }
        const denylist = process.env.CONTENT_DENYLIST
          ? parseDenylist(process.env.CONTENT_DENYLIST)
          : existsSync(".content-denylist")
            ? parseDenylist(readFileSync(".content-denylist", "utf8"))
            : [];
        const errors = lintText(CONTENT, text, denylist).filter((f) => f.severity === "error");
        if (errors.length) {
          throw new Error(
            `content-lint failed:\n${errors.map((f) => `  ${f.file}:${f.line} ${f.rule}`).join("\n")}`,
          );
        }
        logger.info(`${CONTENT} valid (${denylist.length ? "with" : "without"} private denylist)`);
      },
    },
  };
}
