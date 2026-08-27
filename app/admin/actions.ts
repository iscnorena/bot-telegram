"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/sesion";
import { aDecimal } from "@/lib/dinero";
import { semanaDesdeLunesISO } from "@/lib/corte";
import {
  asignarProveedor,
  capturarFactura,
  cerrarCorte,
  reabrirCorte,
} from "@/lib/services/conciliacionService";
import { ponerTarifa } from "@/lib/services/tarifaService";
import { actualizarServicio } from "@/lib/services/servicioService";
import { enviarAProveedor } from "@/lib/services/solicitudService";

function n(formData: FormData, k: string): number {
  return Number(formData.get(k));
}

export async function capturarFacturaAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const monto = aDecimal(String(formData.get("monto") ?? ""));
  const solicitudId = n(formData, "solicitudId");
  if (monto && Number.isSafeInteger(solicitudId)) {
    await capturarFactura(solicitudId, monto, Number(admin.id));
  }
  revalidatePath(`/admin/cortes/${formData.get("semana")}`);
}

export async function asignarProveedorAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const solicitudId = n(formData, "solicitudId");
  const proveedorId = n(formData, "proveedorId");
  if (Number.isSafeInteger(solicitudId) && Number.isSafeInteger(proveedorId)) {
    await asignarProveedor(solicitudId, proveedorId, Number(admin.id));
  }
  revalidatePath(`/admin/cortes/${formData.get("semana")}`);
}

export async function cerrarCorteAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const iso = String(formData.get("semana") ?? "");
  const semana = semanaDesdeLunesISO(iso);
  if (semana) await cerrarCorte(semana, Number(admin.id));
  revalidatePath(`/admin/cortes/${iso}`);
  revalidatePath("/admin");
}

export async function reabrirCorteAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const corteId = n(formData, "corteId");
  if (Number.isSafeInteger(corteId)) await reabrirCorte(corteId, Number(admin.id));
  revalidatePath(`/admin/cortes/${formData.get("semana")}`);
  revalidatePath("/admin");
}

/**
 * Puente hasta que exista la pasarela de pago: marca la solicitud como pagada y
 * la envía al proveedor.
 */
export async function enviarAProveedorAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const solicitudId = n(formData, "solicitudId");
  if (Number.isSafeInteger(solicitudId)) {
    await enviarAProveedor(solicitudId);
  }
  revalidatePath("/admin/solicitudes");
}

export async function ponerTarifaAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const monto = aDecimal(String(formData.get("monto") ?? ""));
  const usuarioId = n(formData, "usuarioId");
  const servicioId = n(formData, "servicioId");
  const desdeRaw = String(formData.get("desde") ?? "");
  const desde = desdeRaw ? new Date(desdeRaw) : new Date();
  if (
    monto &&
    Number.isSafeInteger(usuarioId) &&
    Number.isSafeInteger(servicioId) &&
    !Number.isNaN(desde.getTime())
  ) {
    await ponerTarifa(usuarioId, servicioId, monto, desde);
  }
  revalidatePath("/admin/tarifas");
}

export async function actualizarServicioAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = n(formData, "id");
  const precio = aDecimal(String(formData.get("precioUsuario") ?? ""));
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (Number.isSafeInteger(id)) {
    await actualizarServicio(id, {
      ...(nombre ? { nombre } : {}),
      ...(precio ? { precioUsuario: precio } : {}),
    });
  }
  revalidatePath("/admin/servicios");
}
