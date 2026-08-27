import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Public_Sans } from "next/font/google";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestoría de acta de nacimiento",
  description:
    "Servicio de gestoría que tramita tu acta de nacimiento. Intermediario; no expide ni emite el documento oficial.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={publicSans.variable}>
      <body>{children}</body>
    </html>
  );
}
