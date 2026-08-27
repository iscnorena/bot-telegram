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
    <form className="login" onSubmit={onSubmit}>
      <h1>{panel.login.titulo}</h1>
      {error ? <p className="banner banner--err">{panel.login.error}</p> : null}
      <label htmlFor="email">{panel.login.email}</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">{panel.login.password}</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <button type="submit" className="btn btn--primary" disabled={cargando}>
        {cargando ? "…" : panel.login.entrar}
      </button>
    </form>
  );
}
