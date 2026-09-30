import type { APIRoute, GetStaticPaths } from "astro";
import { projectById, projects } from "../../content/index";
import { projectMd } from "../../content/render/markdown";

export const getStaticPaths = (() =>
  projects.map((p) => ({ params: { slug: p.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const p = projectById(params.slug ?? "");
  if (!p) return new Response("not found", { status: 404 });
  return new Response(`${projectMd(p, 1)}\n`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
