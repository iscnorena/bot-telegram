import type { NextAuthConfig } from "next-auth";

/**
 * Config de Auth.js **edge-safe**: sin Prisma ni bcrypt. La usa `middleware.ts`.
 * El provider Credentials (que sí toca la DB) vive en `auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/proveedor/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const logueado = !!auth?.user;
      const enPanel =
        nextUrl.pathname.startsWith("/proveedor") &&
        nextUrl.pathname !== "/proveedor/login";
      if (enPanel) return logueado;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = "proveedor";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role =
          typeof token.role === "string" ? token.role : undefined;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
