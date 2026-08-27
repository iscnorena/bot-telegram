import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credenciales = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credenciales.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const proveedor = await prisma.proveedor.findUnique({ where: { email } });
        if (!proveedor || !proveedor.activo) return null;

        const ok = await bcrypt.compare(
          parsed.data.password,
          proveedor.passwordHash,
        );
        if (!ok) return null;

        return {
          id: String(proveedor.id),
          email: proveedor.email,
          name: proveedor.nombre,
        };
      },
    }),
  ],
});
