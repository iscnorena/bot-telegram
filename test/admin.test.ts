import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { auth } from "@/auth";
import { requireAdmin, requireProveedor } from "@/lib/sesion";
import { enviarAProveedorAction } from "@/app/admin/actions";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockAuth.mockReset());

describe("guards de sesión", () => {
  it("requireAdmin sin sesión redirige a login", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/proveedor/login");
  });

  it("requireAdmin con rol proveedor redirige a /proveedor", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "proveedor" } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/proveedor");
  });

  it("requireAdmin con rol admin devuelve el usuario", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "admin", name: "Admin" } });
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });

  it("requireProveedor acepta cualquier sesión", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "proveedor" } });
    await expect(requireProveedor()).resolves.toMatchObject({ id: "2" });
  });

  it("enviarAProveedorAction rechaza sin rol admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "proveedor" } });
    const fd = new FormData();
    fd.set("solicitudId", "1");
    await expect(enviarAProveedorAction(fd)).rejects.toThrow("REDIRECT:/proveedor");
  });
});
