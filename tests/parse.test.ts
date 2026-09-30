import { beforeAll, describe, expect, it } from "vitest";
import { complete, parse, setProjectIds, suggest } from "../src/shell/parse";

beforeAll(() => setProjectIds(["geraltheart-v2", "lidar-scout", "upcoming-cli"]));

describe("parse", () => {
  it("maps names, keys, and aliases to pages", () => {
    expect(parse("projects")).toMatchObject({ kind: "path", path: "/projects" });
    expect(parse("  EXPERIENCE ")).toMatchObject({ kind: "path", path: "/experience" });
    expect(parse("3")).toMatchObject({ kind: "path", path: "/projects" });
    expect(parse("?")).toMatchObject({ kind: "path", path: "/help" });
    expect(parse("neofetch")).toMatchObject({ kind: "path", path: "/" });
    expect(parse("whoami")).toMatchObject({ kind: "path", path: "/about" });
  });

  it("opens a project by id or unique prefix", () => {
    expect(parse("projects lidar")).toMatchObject({ path: "/projects/lidar-scout" });
    expect(parse("projects nope")).toMatchObject({ kind: "unknown" });
  });

  it("passes an ask question through with its casing", () => {
    expect(parse("ask What has Geralt built with RAG?")).toEqual({
      kind: "path",
      path: "/ask",
      name: "ask",
      arg: "What has Geralt built with RAG?",
    });
  });

  it("handles built-ins", () => {
    expect(parse("clear")).toEqual({ kind: "clear" });
    expect(parse("keys off")).toEqual({ kind: "keys", on: false });
    expect(parse("")).toEqual({ kind: "empty" });
    expect(parse("sudo make me a sandwich").kind).toBe("message");
  });

  it("suggests the closest command for typos", () => {
    expect(parse("exprience")).toEqual({ kind: "unknown", input: "exprience", suggestion: "experience" });
    expect(suggest("zzzzzz")).toBeUndefined();
  });
});

describe("complete", () => {
  it("completes unique prefixes and lists ambiguous ones", () => {
    expect(complete("exp").value).toBe("experience");
    const s = complete("s");
    expect(s.candidates).toEqual(expect.arrayContaining(["skills", "sim"]));
    expect(complete("projects li").value).toBe("projects lidar-scout");
  });
});
