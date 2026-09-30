import type { APIRoute } from "astro";
import { resumeMd } from "../content/render/markdown";

export const GET: APIRoute = () =>
  new Response(resumeMd(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
