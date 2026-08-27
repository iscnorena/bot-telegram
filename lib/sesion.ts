import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Para páginas y server actions del panel de proveedor: exige sesión. */
export async function requireProveedor() {
  const session = await auth();
  if (!session?.user) redirect("/proveedor/login");
  return session.user;
}

/** Para el panel de administración: exige sesión con rol admin. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/proveedor/login");
  if (session.user.role !== "admin") redirect("/proveedor");
  return session.user;
}
