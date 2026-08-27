import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", async () => {
  const mod = await import("./helpers/fakePrisma");
  return { prisma: mod.fakePrisma };
});
vi.mock("@/lib/services/telegramService", async () => {
  const mod = await import("./helpers/fakeTelegram");
  return { telegramService: mod.fakeTelegram };
});

import { auth } from "@/auth";
import { POST } from "@/app/api/proveedor/solicitudes/[id]/entregar/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
import { acciones, estadoDe, resetStore, store } from "./helpers/fakePrisma";
import { fakeTelegram, resetFakeTelegram } from "./helpers/fakeTelegram";
import { MAX_PDF_BYTES } from "@/lib/config";
import { panel } from "@/lib/copy";

function archivo(
  bytes: number,
  type = "application/pdf",
  name = "acta.pdf",
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function req(file?: File): Request {
  const fd = new FormData();
  if (file) fd.append("archivo", file);
  return new Request("http://localhost/api/proveedor/solicitudes/1/entregar", {
    method: "POST",
    body: fd,
  });
}

const ctx = { params: { id: "1" } };

/** Lee ?error / ?entregada del header Location de una respuesta redirect. */
function query(res: Response, key: string): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).searchParams.get(key) : null;
}

beforeEach(() => {
  resetStore();
  resetFakeTelegram();
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "7", name: "Proveedor Uno" } });
});

describe("POST /api/proveedor/solicitudes/[id]/entregar", () => {
  it("PDF válido con sesión: entrega por pass-through y redirige", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor", chatIdUsuario: 900n }]);

    const res = await POST(req(archivo(2048)), ctx);

    expect(res.status).toBe(303);
    expect(query(res, "entregada")).toBe("1");
    expect(estadoDe(s.id)).toBe("entregado");
    const row = store.rows.get(s.id)!;
    expect(row.metodoEntrega).toBe("panel_web");
    expect(row.proveedorId).toBe(7);
    expect(acciones(s.id)).toContain("entrega");
    expect(fakeTelegram.sendDocumentBinary).toHaveBeenCalledTimes(1);
  });

  it("sin sesión: 401 y sin cambios", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);
    mockAuth.mockResolvedValue(null);

    const res = await POST(req(archivo(2048)), ctx);

    expect(res.status).toBe(401);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(fakeTelegram.sendDocumentBinary).not.toHaveBeenCalled();
  });

  it("archivo no-PDF: redirige con error, sin llamar a Telegram", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(req(archivo(2048, "text/plain", "x.txt")), ctx);

    expect(res.status).toBe(303);
    expect(query(res, "error")).toBe(panel.err.noPdf);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(fakeTelegram.sendDocumentBinary).not.toHaveBeenCalled();
  });

  it("archivo mayor a MAX_PDF_BYTES: redirige con error", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(req(archivo(MAX_PDF_BYTES + 1)), ctx);

    expect(res.status).toBe(303);
    expect(query(res, "error")).toBe(panel.err.muyGrande);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(fakeTelegram.sendDocumentBinary).not.toHaveBeenCalled();
  });

  it("falta el archivo: redirige con error", async () => {
    resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(303);
    expect(query(res, "error")).toBe(panel.err.faltaArchivo);
  });

  it("solicitud ya cerrada: el servicio devuelve false y redirige con error", async () => {
    const [s] = resetStore([{ estado: "entregado" }]);

    const res = await POST(req(archivo(2048)), ctx);

    expect(res.status).toBe(303);
    expect(query(res, "error")).toBe(panel.err.noProcesada);
    expect(estadoDe(s.id)).toBe("entregado");
  });
});
