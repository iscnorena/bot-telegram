import { requireAdmin } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { enviarAProveedorAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const PENDIENTES = ["pendiente_curp", "pagado"] as const;

export default async function SolicitudesPendientesPage() {
  await requireAdmin();

  const solicitudes = await prisma.solicitud.findMany({
    where: { estado: { in: [...PENDIENTES] } },
    include: { servicio: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <div className="page-head">
        <h1>Solicitudes por enviar al proveedor</h1>
        <p>
          Puente manual mientras no hay pasarela de pago: confirma el pago y envía
          la solicitud al proveedor.
        </p>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Pendientes</h2>
          <span className="card__count">
            {solicitudes.length}{" "}
            {solicitudes.length === 1 ? "solicitud" : "solicitudes"}
          </span>
        </div>

        {solicitudes.length === 0 ? (
          <p className="sin-pendientes">No hay solicitudes por enviar.</p>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 68 }}>ID</th>
                  <th style={{ width: 190 }}>CURP</th>
                  <th>Servicio</th>
                  <th style={{ width: 150 }}>Estado</th>
                  <th style={{ width: 130 }}>Creada</th>
                  <th style={{ width: 190 }} />
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td className="col-id">#{s.id}</td>
                    <td className="col-curp">{s.curp}</td>
                    <td>{s.servicio?.nombre ?? "—"}</td>
                    <td>
                      <span className="pill pill--info">{s.estado}</span>
                    </td>
                    <td className="col-when">{FMT.format(s.createdAt)}</td>
                    <td>
                      <form action={enviarAProveedorAction}>
                        <input type="hidden" name="solicitudId" value={s.id} />
                        <button type="submit" className="btn btn--primary">
                          Enviar a proveedor
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
