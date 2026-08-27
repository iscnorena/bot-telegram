import { requireAdmin } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { mxn } from "@/lib/dinero";
import { ponerTarifaAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function TarifasPage() {
  await requireAdmin();

  const [proveedores, servicios] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: "proveedor" },
      orderBy: { nombre: "asc" },
      include: {
        tarifas: {
          orderBy: [{ servicioId: "asc" }, { vigenteDesde: "desc" }],
          include: { servicio: true },
        },
      },
    }),
    prisma.servicio.findMany({ where: { activo: true }, orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>Tarifas del proveedor</h1>
        <p>
          Costo que cobra cada proveedor por trámite. Una tarifa nueva cierra la
          anterior; los cortes viejos conservan la tarifa vigente en su momento.
        </p>
      </div>

      {proveedores.map((p) => (
        <div className="card" key={p.id} style={{ marginBottom: 16 }}>
          <div className="card__head">
            <h2>
              {p.nombre} {p.activo ? "" : "(inactivo)"}
            </h2>
            <span className="card__count">{p.email}</span>
          </div>
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th className="num">Monto</th>
                  <th>Vigente desde</th>
                  <th>Vigente hasta</th>
                </tr>
              </thead>
              <tbody>
                {p.tarifas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="sin-pendientes">
                      Sin tarifas registradas.
                    </td>
                  </tr>
                ) : (
                  p.tarifas.map((t) => (
                    <tr key={t.id}>
                      <td>{t.servicio.nombre}</td>
                      <td className="num">{mxn(t.monto)}</td>
                      <td className="col-when">{FMT.format(t.vigenteDesde)}</td>
                      <td className="col-when">
                        {t.vigenteHasta ? (
                          FMT.format(t.vigenteHasta)
                        ) : (
                          <span className="pill pill--info">Vigente</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <form
            action={ponerTarifaAction}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "12px 18px",
              flexWrap: "wrap",
            }}
          >
            <input type="hidden" name="usuarioId" value={p.id} />
            <select name="servicioId" className="select" defaultValue={servicios[0]?.id}>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <span className="captura">
              <input name="monto" inputMode="decimal" placeholder="Monto" />
            </span>
            <input
              type="date"
              name="desde"
              className="select"
              aria-label="Vigente desde"
            />
            <button type="submit" className="btn btn--primary">
              Nueva tarifa
            </button>
          </form>
        </div>
      ))}
    </>
  );
}
