import { requireAdmin } from "@/lib/sesion";
import { listarServicios } from "@/lib/services/servicioService";
import { actualizarServicioAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  await requireAdmin();
  const servicios = await listarServicios();

  return (
    <>
      <div className="page-head">
        <h1>Servicios</h1>
        <p>
          Precio que paga la persona usuaria por cada servicio. El alta de nuevos
          servicios se hace por migración.
        </p>
      </div>

      <div className="card">
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Clave</th>
                <th>Nombre</th>
                <th style={{ width: 160 }}>Precio al usuario</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id}>
                  <td className="col-id">{s.slug}</td>
                  <td colSpan={3}>
                    <form
                      action={actualizarServicioAction}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <input
                        name="nombre"
                        defaultValue={s.nombre}
                        className="select"
                        style={{ flex: 1, minWidth: 220 }}
                      />
                      <span className="captura">
                        <input
                          name="precioUsuario"
                          inputMode="decimal"
                          defaultValue={Number(s.precioUsuario).toFixed(2)}
                        />
                      </span>
                      <button type="submit" className="btn btn--primary">
                        Guardar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
