import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware edge: usa solo la config sin Prisma/bcrypt.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/proveedor/:path*"],
};
