/** Regenerates content/resume.schema.json (editor autocomplete + validation for resume.json). */
import { writeFileSync } from "node:fs";
import { resumeJsonSchema } from "./json-schema";

writeFileSync("content/resume.schema.json", resumeJsonSchema());
console.log("wrote content/resume.schema.json");
