import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { rememberUser, type Member } from "./users";

/** A JSON API handler: the member the Gateway signed in, refusals as status codes. */
export function api(handler: (ctx: { member: Member; request: Request; params: Record<string, string>; body: () => Promise<unknown> }) => Promise<unknown>, status = 200) {
  return async ({ request, params }: { request: Request; params: Record<string, string> }) => {
    const user = await getEveryAppUser(request, env);
    if (!user) return Response.json({ error: "Sign in through your Gateway" }, { status: 401 });
    try {
      const member = await rememberUser(user);
      const body = async () => {
        try {
          return await request.json();
        } catch {
          throw new AppError(400, "The request body must be JSON");
        }
      };
      const result = await handler({ member, request, params, body });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true }, { status });
    } catch (error) {
      if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
      throw error;
    }
  };
}
