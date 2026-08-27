import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gestoría de acta de nacimiento",
  description:
    "Servicio de gestoría que tramita tu acta de nacimiento. Intermediario; no expide ni emite el documento oficial.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
