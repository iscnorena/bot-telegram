"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { requireProveedor } from "@/lib/sesion";
import { entregaActaService } from "@/lib/services/entregaActaService";

export async function marcarNoEncontradaAction(formData: FormData): Promise<void> {
  await requireProveedor();
  const id = Number(formData.get("id"));
  if (Number.isSafeInteger(id)) {
    await entregaActaService.marcarNoEncontrado(id, "panel_web", false);
    revalidatePath("/proveedor");
  }
}

export async function cerrarSesionAction(): Promise<void> {
  await signOut({ redirectTo: "/proveedor/login" });
}
