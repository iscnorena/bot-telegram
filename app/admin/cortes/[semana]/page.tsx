import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { formatoRango, semanaDesdeLunesISO } from "@/lib/corte";
import {
  corteDeSemana,
  filasDeCorte,
  totales,
} from "@/lib/services/conciliacionService";
import { mxn } from "@/lib/dinero";
import {
  asignarProveedorAction,
  capturarFacturaAction,
  cerrarCorteAction,
  reabrirCorteAction,
} from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function claseDiff(n: number | null): string {
  if (n === null) return "num";
  if (n > 0) return "num diff-pos";
  if (n < 0) return "num diff-neg";
  return "num diff-zero";
}

export default async function CorteDetalle({
  params,
}: {
  params: { semana: string };
}) {
  await requireAdmin();
  const semana = semanaDesdeLunesISO(params.semana);
  if (!semana) notFound();

  const [filas, corte, proveedores] = await Promise.all([
    filasDeCorte(semana),
    corteDeSemana(semana),
    prisma.usuario.findMany({
      where: { rol: "proveedor", activo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);
  const t = totales(filas);
  const cerrado = !!corte?.cerradoAt;
  const cerradoPor = corte?.cerradoPor
    ? await prisma.usuario.findUnique({ where: { id: corte.cerradoPor } })
    : null;

  return (
    <>
      <div className="page-head">
        <h1>Corte {formatoRango(semana)}</h1>
        <p>
          {t.nEntregadas} entregadas · {t.nSinConciliar} sin conciliar ·{" "}
          {t.nConDiferencia} con diferencia
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        {cerrado ? (
          <form action={reabrirCorteAction} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="chip-cerrado">
              Cerrado {cerradoPor ? `por ${cerradoPor.nombre}` : ""}{" "}
              {corte?.cerradoAt ? `· ${FMT.format(corte.cerradoAt)}` : ""}
            </span>
            <input type="hidden" name="corteId" value={corte!.id} />
            <input type="hidden" name="semana" value={params.semana} />
            <button type="submit" className="btn">
              Reabrir
            </button>
          </form>
        ) : (
          <form action={cerrarCorteAction}>
            <input type="hidden" name="semana" value={params.semana} />
            <button type="submit" className="btn btn--primary">
              Cerrar corte
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Entregada</th>
                <th style={{ width: 180 }}>CURP</th>
                <th>Proveedor</th>
                <th style={{ width: 90 }}>Canal</th>
                <th className="num" style={{ width: 110 }}>
                  Esperado
                </th>
                <th className="num" style={{ width: 150 }}>
                  Facturado
                </th>
                <th className="num" style={{ width: 110 }}>
                  Diferencia
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sin-pendientes">
                    No hubo entregas en esta semana.
                  </td>
                </tr>
              ) : (
                filas.map((f) => (
                  <tr key={f.solicitudId}>
                    <td className="col-when">{FMT.format(f.entregadoAt)}</td>
                    <td className="col-curp">{f.curp}</td>
                    <td>
                      {f.proveedorNombre ? (
                        f.proveedorNombre
                      ) : cerrado ? (
                        "—"
                      ) : (
                        <form action={asignarProveedorAction} className="captura">
                          <input type="hidden" name="solicitudId" value={f.solicitudId} />
                          <input type="hidden" name="semana" value={params.semana} />
                          <select name="proveedorId" className="select" defaultValue="">
                            <option value="" disabled>
                              Asignar…
                            </option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn">
                            Guardar
                          </button>
                        </form>
                      )}
                    </td>
                    <td>{f.canal ?? "—"}</td>
                    <td className="num">
                      {f.esperado === null ? "—" : mxn(f.esperado)}
                    </td>
                    <td>
                      {cerrado ? (
                        <span className="num">
                          {f.real === null ? "—" : mxn(f.real)}
                        </span>
                      ) : (
                        <form action={capturarFacturaAction} className="captura">
                          <input type="hidden" name="solicitudId" value={f.solicitudId} />
                          <input type="hidden" name="semana" value={params.semana} />
                          <input
                            name="monto"
                            inputMode="decimal"
                            placeholder="0.00"
                            defaultValue={f.real === null ? "" : Number(f.real).toFixed(2)}
                          />
                          <button type="submit" className="btn">
                            ✓
                          </button>
                        </form>
                      )}
                    </td>
                    <td className={claseDiff(f.diferencia === null ? null : Number(f.diferencia))}>
                      {f.diferencia === null ? "—" : mxn(f.diferencia)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={4}>Totales</td>
                  <td className="num">{mxn(t.sumaEsperado)}</td>
                  <td className="num">{mxn(t.sumaReal)}</td>
                  <td className={claseDiff(Number(t.sumaDiferencia))}>
                    {mxn(t.sumaDiferencia)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </>
  );
}
