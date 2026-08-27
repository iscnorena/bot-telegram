import "../panel.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/sesion";
import { cerrarSesionAction } from "@/app/proveedor/actions";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <span className="panel__brand-mark" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 21h18" />
        <path d="M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </svg>
    </span>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="panel">
      <header className="panel__top">
        <div className="panel__brand">
          <Mark />
          <span>
            <span className="panel__kicker">Panel de administración</span>
            <span className="panel__name">Gestoría de acta de nacimiento</span>
          </span>
        </div>
        <form className="panel__session" action={cerrarSesionAction}>
          <span className="panel__user">{admin.name}</span>
          <button type="submit" className="btn btn--ghost">
            Cerrar sesión
          </button>
        </form>
      </header>
      <nav className="panel__nav">
        <Link href="/admin">Cortes</Link>
        <Link href="/admin/tarifas">Tarifas</Link>
        <Link href="/admin/servicios">Servicios</Link>
      </nav>
      <main className="panel__body">{children}</main>
      <footer className="panel__foot">
        Conciliación semanal (lunes–domingo, hora de Ciudad de México).
      </footer>
    </div>
  );
}
