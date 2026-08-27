// Alta / actualización de una cuenta de proveedor para el panel web.
// Uso: npm run proveedor:crear -- --email correo@dominio.mx --nombre "Nombre Visible"
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

if (!email || !nombre) {
  console.error(
    'Uso: npm run proveedor:crear -- --email correo@dominio.mx --nombre "Nombre Visible"',
  );
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
  const prov = await prisma.proveedor.upsert({
    where: { email },
    update: { nombre, passwordHash, activo: true },
    create: { email, nombre, passwordHash },
  });
  console.log(`Proveedor listo: #${prov.id}  ${prov.email}  (${prov.nombre})`);
} finally {
  await prisma.$disconnect();
}
