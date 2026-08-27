import "./proveedor.css";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { panel } from "@/lib/copy";
import { cerrarSesionAction } from "./actions";

function BrandMark() {
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
        <path d="M7 4h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M14 4v4h4" />
        <path d="M9 13h6" />
        <path d="M9 16.5h4" />
      </svg>
    </span>
  );
}

export default async function ProveedorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  return (
    <div className="panel">
      <header className="panel__top">
        <div className="panel__brand">
          <BrandMark />
          <span>
            <span className="panel__kicker">Panel de proveedor</span>
            <span className="panel__name">{panel.titulo}</span>
          </span>
        </div>
        {session?.user ? (
          <form className="panel__session" action={cerrarSesionAction}>
            <span className="panel__user">{session.user.name}</span>
            <button type="submit" className="btn btn--ghost">
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                <path d="M10 17 5 12l5-5" />
                <path d="M5 12h12" />
              </svg>
              {panel.cerrarSesion}
            </button>
          </form>
        ) : null}
      </header>
      <main className="panel__body">{children}</main>
      <footer className="panel__foot">
        Este panel gestiona el trámite como intermediario; no expide ni emite el
        documento oficial.
      </footer>
    </div>
  );
}
