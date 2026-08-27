"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { panel } from "@/lib/copy";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    setCargando(true);
    const data = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      redirect: false,
    });
    setCargando(false);
    if (res?.error) {
      setError(true);
      return;
    }
    router.push("/proveedor");
    router.refresh();
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="panel__brand" style={{ marginBottom: 22 }}>
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
          <span>
            <span className="panel__kicker">Panel de proveedor</span>
            <span className="panel__name" style={{ fontSize: 13.5 }}>
              {panel.titulo}
            </span>
          </span>
        </div>

        <h1>{panel.login.titulo}</h1>
        <p className="sub">Ingresa con la cuenta que te asignó el administrador.</p>

        {error ? (
          <p className="banner banner--err">{panel.login.error}</p>
        ) : null}

        <div className="field">
          <label htmlFor="email">{panel.login.email}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="tu@dominio.mx"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">{panel.login.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        <button type="submit" className="btn btn--primary" disabled={cargando}>
          {cargando ? "…" : panel.login.entrar}
        </button>

        <p className="login-foot">
          Este panel gestiona el trámite de acta de nacimiento como intermediario.
          No expide ni emite el documento oficial.
        </p>
      </form>
    </div>
  );
}
