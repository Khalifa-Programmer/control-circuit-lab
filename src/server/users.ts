import { isAdmin } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Member {
  id: string;
  email: string;
  admin: boolean;
}

/** Records the person on first sight, keyed by the Gateway's user id; admin comes from their organisation role. */
export async function rememberUser(user: { id: string; email: string; orgRole: string }): Promise<Member> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}
