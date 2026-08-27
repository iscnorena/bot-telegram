export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Gestoría de acta de nacimiento</h1>
      <p>
        Backend del bot de Telegram para el servicio de gestoría de acta de
        nacimiento. Este sistema gestiona el trámite como intermediario; no
        expide ni emite el documento oficial.
      </p>
      <p>API activa. El flujo con las personas usuarias ocurre en Telegram.</p>
    </main>
  );
}
