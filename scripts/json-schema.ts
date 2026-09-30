import { z } from "zod";
import { Resume } from "../src/content/schema";

export function resumeJsonSchema(): string {
  const schema = z.toJSONSchema(Resume, { target: "draft-2020-12", io: "input" });
  return `${JSON.stringify({ title: "geraltheart.com resume content", ...schema }, null, 2)}\n`;
}
