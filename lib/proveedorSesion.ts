import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Para páginas y server actions del panel: exige sesión de proveedor. */
export async function requireProveedor() {
  const session = await auth();
  if (!session?.user) redirect("/proveedor/login");
  return session.user;
}
