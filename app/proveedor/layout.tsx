import "./proveedor.css";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { panel } from "@/lib/copy";
import { cerrarSesionAction } from "./actions";

export default async function ProveedorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  return (
    <div className="panel">
      <header className="panel__top">
        <span className="panel__brand">{panel.titulo}</span>
        {session?.user ? (
          <form action={cerrarSesionAction}>
            <span className="panel__user">{session.user.name}</span>
            <button type="submit" className="btn btn--ghost">
              {panel.cerrarSesion}
            </button>
          </form>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="panel__foot">
        Servicio de gestoría de acta de nacimiento — este panel gestiona el
        trámite como intermediario; no expide ni emite el documento oficial.
      </footer>
    </div>
  );
}
