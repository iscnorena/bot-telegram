import { EstadoSolicitud } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProveedor } from "@/lib/proveedorSesion";
import { panel } from "@/lib/copy";
import { marcarNoEncontradaAction } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS_ABIERTOS: EstadoSolicitud[] = [
  EstadoSolicitud.enviado_proveedor,
  EstadoSolicitud.no_encontrado_proveedor,
];

function fecha(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function ProveedorPage({
  searchParams,
}: {
  searchParams: { entregada?: string; error?: string };
}) {
  await requireProveedor();

  const solicitudes = await prisma.solicitud.findMany({
    where: { estado: { in: ESTADOS_ABIERTOS } },
    orderBy: { enviadoProveedorAt: "asc" },
  });

  return (
    <>
      <h1>{panel.subtitulo}</h1>
      <p className="panel__sub">
        Sube el PDF del acta o marca la solicitud como no encontrada.
      </p>

      {searchParams.entregada ? (
        <p className="banner banner--ok">
          {panel.ok.entregada(Number(searchParams.entregada))}
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="banner banner--err">{searchParams.error}</p>
      ) : null}

      {solicitudes.length === 0 ? (
        <p>{panel.sinPendientes}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{panel.columnas.id}</th>
              <th>{panel.columnas.curp}</th>
              <th>{panel.columnas.nombre}</th>
              <th>{panel.columnas.estado}</th>
              <th>{panel.columnas.recibida}</th>
              <th>{panel.columnas.acciones}</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.curp}</td>
                <td>
                  {[s.nombre, s.apellidoPaterno, s.apellidoMaterno]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </td>
                <td>
                  <span className="estado">{s.estado}</span>
                </td>
                <td>{fecha(s.enviadoProveedorAt)}</td>
                <td>
                  <div className="acciones">
                    <form
                      method="post"
                      action={`/api/proveedor/solicitudes/${s.id}/entregar`}
                      encType="multipart/form-data"
                    >
                      <input
                        type="file"
                        name="archivo"
                        accept="application/pdf"
                        required
                      />
                      <button type="submit" className="btn btn--primary">
                        {panel.subirPdf}
                      </button>
                    </form>
                    <form action={marcarNoEncontradaAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="btn">
                        {panel.marcarNoEncontrada}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
