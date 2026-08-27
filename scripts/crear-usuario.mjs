// Alta / actualización de una cuenta del panel (proveedor o admin).
// Uso:
//   npm run usuario:crear -- --email correo@dominio.mx --nombre "Nombre" [--rol admin|proveedor]
//   npm run proveedor:crear -- --email correo@dominio.mx --nombre "Nombre"   (rol proveedor)
// Pide la contraseña por consola (se muestra al teclear; es una utilidad de dev).

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = (arg("email") ?? "").toLowerCase().trim();
const nombre = (arg("nombre") ?? "").trim();
const rol = (arg("rol") ?? "proveedor").trim();

if (!email || !nombre) {
  console.error(
    'Uso: npm run usuario:crear -- --email correo@dominio.mx --nombre "Nombre" [--rol admin|proveedor]',
  );
  process.exit(1);
}
if (rol !== "admin" && rol !== "proveedor") {
  console.error("El rol debe ser 'admin' o 'proveedor'.");
  process.exit(1);
}

const rl = createInterface({ input, output });
const password = await rl.question("Contraseña (mín. 8): ");
rl.close();

if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await prisma.usuario.upsert({
    where: { email },
    update: { nombre, passwordHash, rol, activo: true },
    create: { email, nombre, passwordHash, rol },
  });
  console.log(`Usuario listo: #${u.id}  ${u.email}  (${u.nombre}, rol=${u.rol})`);
} finally {
  await prisma.$disconnect();
}
