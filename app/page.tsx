export default function Home() {
  return (
    <main
      style={{
        fontFamily:
          'var(--font-sans, "Public Sans"), system-ui, -apple-system, "Segoe UI", sans-serif',
        color: "#16181b",
        background: "#f7f8f8",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#8b8f96",
          }}
        >
          Gestoría de acta de nacimiento
        </p>
        <h1
          style={{
            margin: "6px 0 12px",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
          }}
        >
          Backend del servicio de gestoría
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#60646c" }}>
          Este sistema gestiona el trámite del acta de nacimiento como
          intermediario; no expide ni emite el documento oficial. El flujo con
          las personas usuarias ocurre en Telegram; los proveedores trabajan
          desde el panel.
        </p>
      </div>
    </main>
  );
}
