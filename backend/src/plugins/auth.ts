import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "../db/schema.js";
import type { Container } from "../container.js";
import { forbidden, unauthorized } from "../lib/errors.js";

export interface RequestUser {
  id: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    user: RequestUser;
  }
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/**
 * preHandler factory. Verifies the access token, then re-reads the user so a blocked
 * or deleted account (or a changed role) takes effect immediately, not at token expiry.
 */
export function requireAuth(c: Container, ...roles: UserRole[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = bearer(req.headers.authorization);
    if (!token) throw unauthorized();
    const claims = await c.tokens.verifyAccess(token);
    const user = await c.auth.activeUser(claims.sub);
    req.user = { id: user.id, role: user.role };
    if (roles.length && !roles.includes(user.role)) {
      // Office and staff accounts can't book: say so plainly instead of a generic refusal.
      if (roles.length === 1 && roles[0] === "customer") {
        throw forbidden(
          `This number is set up as an Xtreme ${user.role === "admin" ? "office" : "staff"} account, so it can't book or pay. Sign in with a customer number to book.`,
          "customer_only",
        );
      }
      throw forbidden();
    }
  };
}
