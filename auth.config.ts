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
      const { pathname } = nextUrl;

      if (pathname.startsWith("/admin")) {
        if (auth?.user?.role === "admin") return true;
        if (auth?.user) return Response.redirect(new URL("/proveedor", nextUrl));
        return false; // sin sesión -> a la pantalla de login
      }
      if (
        pathname.startsWith("/proveedor") &&
        pathname !== "/proveedor/login"
      ) {
        return !!auth?.user;
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "proveedor";
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
