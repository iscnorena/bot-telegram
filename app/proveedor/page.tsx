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

function pill(estado: string): { texto: string; clase: string } {
  if (estado === EstadoSolicitud.no_encontrado_proveedor) {
    return { texto: "No encontrada — reintentable", clase: "pill pill--amber" };
  }
  return { texto: "Enviada al proveedor", clase: "pill pill--info" };
}

function IconUpload() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
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
      <div className="page-head">
        <h1>{panel.subtitulo}</h1>
        <p>
          Sube el PDF del acta o marca la solicitud como no encontrada. Actúas
          como intermediario del trámite.
        </p>
      </div>

      {searchParams.entregada ? (
        <p className="banner banner--ok">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {panel.ok.entregada(Number(searchParams.entregada))}
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="banner banner--err">{searchParams.error}</p>
      ) : null}

      <div className="card">
        <div className="card__head">
          <h2>Abiertas</h2>
          <span className="card__count">
            {solicitudes.length}{" "}
            {solicitudes.length === 1 ? "solicitud" : "solicitudes"}
          </span>
        </div>

        {solicitudes.length === 0 ? (
          <p className="sin-pendientes">{panel.sinPendientes}</p>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 68 }}>{panel.columnas.id}</th>
                  <th style={{ width: 190 }}>{panel.columnas.curp}</th>
                  <th>{panel.columnas.nombre}</th>
                  <th style={{ width: 210 }}>{panel.columnas.estado}</th>
                  <th style={{ width: 120 }}>{panel.columnas.recibida}</th>
                  <th style={{ width: 300 }} aria-label={panel.columnas.acciones} />
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => {
                  const p = pill(s.estado);
                  const nombre =
                    [s.nombre, s.apellidoPaterno, s.apellidoMaterno]
                      .filter(Boolean)
                      .join(" ") || "—";
                  return (
                    <tr key={s.id}>
                      <td className="col-id">#{s.id}</td>
                      <td className="col-curp">{s.curp}</td>
                      <td className="col-nombre">{nombre}</td>
                      <td>
                        <span className={p.clase}>{p.texto}</span>
                      </td>
                      <td className="col-when">{fecha(s.enviadoProveedorAt)}</td>
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
                              className="file-input"
                            />
                            <button type="submit" className="btn btn--primary">
                              <IconUpload />
                              {panel.subirPdf}
                            </button>
                          </form>
                          <form action={marcarNoEncontradaAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="btn btn--danger">
                              <IconX />
                              {panel.marcarNoEncontrada}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
