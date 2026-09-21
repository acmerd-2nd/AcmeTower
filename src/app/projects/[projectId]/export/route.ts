import { requireWebActor } from "@/lib/core/actor";
import { buildProjectExport } from "@/lib/data/export";
import { httpProjectRow } from "@/lib/mcp/httpdata";

export const dynamic = "force-dynamic";

/** GET /projects/<id>/export — 人类会话专属（中间件已对 /projects* 强制登录）。 */
export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  await requireWebActor();
  const { projectId } = await ctx.params;
  const project = await httpProjectRow(projectId);
  if (!project) return new Response("Not found", { status: 404 });
  const data = await buildProjectExport(projectId);
  const ascii = project.slug?.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="acmetower-${ascii}.json"`,
    },
  });
}
