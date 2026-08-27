import Link from "next/link";
import { requireAdmin } from "@/lib/sesion";
import { formatoRango, lunesISO, ultimasSemanas } from "@/lib/corte";
import {
  filasDeCorte,
  resumenSemana,
  totales,
} from "@/lib/services/conciliacionService";
import { mxn } from "@/lib/dinero";

export const dynamic = "force-dynamic";

function claseDiff(n: number): string {
  if (n > 0) return "num diff-pos";
  if (n < 0) return "num diff-neg";
  return "num diff-zero";
}

export default async function AdminHome() {
  await requireAdmin();

  const semanas = ultimasSemanas(8);
  const filasActual = await filasDeCorte(semanas[0]);
  const t = totales(filasActual);
  const resumenes = await Promise.all(semanas.map((s) => resumenSemana(s)));

  return (
    <>
      <div className="page-head">
        <h1>Conciliación semanal</h1>
        <p>
          Semana en curso: {formatoRango(semanas[0])}. El corte se cierra los
          domingos.
        </p>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi__label">Entregadas</div>
          <div className="kpi__value">{t.nEntregadas}</div>
          <div className="kpi__sub">{t.nSinConciliar} sin conciliar</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Esperado (tarifa)</div>
          <div className="kpi__value">{mxn(t.sumaEsperado)}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Facturado (proveedor)</div>
          <div className="kpi__value">{mxn(t.sumaReal)}</div>
          <div className="kpi__sub">{t.nFacturadas} capturadas</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Diferencia</div>
          <div className={`kpi__value ${claseDiff(Number(t.sumaDiferencia))}`}>
            {mxn(t.sumaDiferencia)}
          </div>
          <div className="kpi__sub">{t.nConDiferencia} con diferencia</div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Últimas semanas</h2>
        </div>
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                <th>Estado</th>
                <th className="num">Entregadas</th>
                <th className="num">Sin conciliar</th>
                <th className="num">Esperado</th>
                <th className="num">Facturado</th>
                <th className="num">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s, i) => {
                const r = resumenes[i];
                return (
                  <tr key={lunesISO(s)}>
                    <td>
                      <Link href={`/admin/cortes/${lunesISO(s)}`}>
                        {formatoRango(s)}
                      </Link>
                    </td>
                    <td>
                      {r.cerrado ? (
                        <span className="chip-cerrado">Cerrado</span>
                      ) : (
                        <span className="pill pill--info">Abierto</span>
                      )}
                    </td>
                    <td className="num">{r.nEntregadas}</td>
                    <td className="num">{r.nSinConciliar}</td>
                    <td className="num">
                      {r.sumaEsperado === null ? "—" : mxn(r.sumaEsperado)}
                    </td>
                    <td className="num">
                      {r.sumaReal === null ? "—" : mxn(r.sumaReal)}
                    </td>
                    <td
                      className={
                        r.sumaDiferencia === null
                          ? "num"
                          : claseDiff(Number(r.sumaDiferencia))
                      }
                    >
                      {r.sumaDiferencia === null ? "—" : mxn(r.sumaDiferencia)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
