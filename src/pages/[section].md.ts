import type { APIRoute, GetStaticPaths } from "astro";
import { aboutMd, contactMd, experienceMd, projectsMd, resumeMd, skillsMd } from "../content/render/markdown";
import { mcpMd } from "../content/render/mcp";

const SECTIONS: Record<string, () => string> = {
  about: aboutMd,
  experience: experienceMd,
  projects: projectsMd,
  skills: skillsMd,
  contact: contactMd,
  resume: resumeMd,
  mcp: mcpMd,
};

export const getStaticPaths = (() =>
  Object.keys(SECTIONS).map((section) => ({ params: { section } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const render = SECTIONS[params.section ?? ""];
  if (!render) return new Response("not found", { status: 404 });
  return new Response(`${render()}\n`, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
