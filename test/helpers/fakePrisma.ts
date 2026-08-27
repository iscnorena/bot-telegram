/**
 * Prisma falso en memoria. Solo implementa lo que usan los servicios y los
 * route handlers. `updateMany` aplica el `where` condicional (incluido
 * `estado: { in: [...] }`) y devuelve un `count` real, así la prueba de
 * condición de carrera es fiel y determinista.
 */

export interface SolicitudRow {
  id: number;
  chatIdUsuario: bigint;
  curp: string;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  estado: string;
  metodoEntrega: string | null;
  fileIdEntregado: string | null;
  proveedorId: number | null;
  pagadoAt: Date | null;
  enviadoProveedorAt: Date | null;
  entregadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LogRow {
  id: number;
  solicitudId: number;
  canal: string;
  accion: string;
  detalle: string | null;
  createdAt: Date;
}

interface Store {
  rows: Map<number, SolicitudRow>;
  logs: LogRow[];
  nextSolicitudId: number;
  nextLogId: number;
}

export const store: Store = {
  rows: new Map(),
  logs: [],
  nextSolicitudId: 1,
  nextLogId: 1,
};

function baseRow(partial: Partial<SolicitudRow>): SolicitudRow {
  const now = new Date();
  return {
    id: 0,
    chatIdUsuario: 555n,
    curp: "ABCD010203HDFXYZ01",
    nombre: null,
    apellidoPaterno: null,
    apellidoMaterno: null,
    estado: "enviado_proveedor",
    metodoEntrega: null,
    fileIdEntregado: null,
    proveedorId: null,
    pagadoAt: null,
    enviadoProveedorAt: now,
    entregadoAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Reinicia el store y precarga filas. Devuelve las filas creadas (con id). */
export function resetStore(seed: Array<Partial<SolicitudRow>> = []): SolicitudRow[] {
  store.rows.clear();
  store.logs = [];
  store.nextSolicitudId = 1;
  store.nextLogId = 1;
  return seed.map((s) => {
    const id = s.id ?? store.nextSolicitudId;
    store.nextSolicitudId = Math.max(store.nextSolicitudId, id) + 1;
    const row = baseRow({ ...s, id });
    store.rows.set(id, row);
    return { ...row };
  });
}

type EstadoWhere = string | { in?: string[] } | undefined;

function estadoMatches(rowEstado: string, cond: EstadoWhere): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "string") return rowEstado === cond;
  if (Array.isArray(cond.in)) return cond.in.includes(rowEstado);
  return true;
}

function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>,
): Partial<T> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out as Partial<T>;
}

export const fakePrisma = {
  solicitud: {
    async findUnique(args: {
      where: { id: number };
      select?: Record<string, boolean>;
    }) {
      const row = store.rows.get(args.where.id);
      if (!row) return null;
      return project({ ...row }, args.select);
    },

    async findMany(args: {
      where?: { curp?: string; estado?: EstadoWhere };
      orderBy?: { id?: "asc" | "desc" };
    }) {
      let rows = [...store.rows.values()];
      const w = args.where ?? {};
      if (w.curp !== undefined) rows = rows.filter((r) => r.curp === w.curp);
      rows = rows.filter((r) => estadoMatches(r.estado, w.estado));
      if (args.orderBy?.id === "desc") rows.sort((a, b) => b.id - a.id);
      else rows.sort((a, b) => a.id - b.id);
      return rows.map((r) => ({ ...r }));
    },

    async create(args: {
      data: Partial<SolicitudRow>;
      select?: Record<string, boolean>;
    }) {
      const id = store.nextSolicitudId++;
      const row = baseRow({ ...args.data, id });
      store.rows.set(id, row);
      return project({ ...row }, args.select);
    },

    async update(args: { where: { id: number }; data: Partial<SolicitudRow> }) {
      const row = store.rows.get(args.where.id);
      if (!row) throw new Error(`fakePrisma: solicitud ${args.where.id} no existe`);
      Object.assign(row, args.data, { updatedAt: new Date() });
      return { ...row };
    },

    async updateMany(args: {
      where: { id?: number; estado?: EstadoWhere };
      data: Partial<SolicitudRow>;
    }) {
      let count = 0;
      for (const row of store.rows.values()) {
        if (args.where.id !== undefined && row.id !== args.where.id) continue;
        if (!estadoMatches(row.estado, args.where.estado)) continue;
        Object.assign(row, args.data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    },
  },

  solicitudLog: {
    async create(args: { data: Omit<LogRow, "id" | "createdAt"> }) {
      const log: LogRow = {
        ...args.data,
        id: store.nextLogId++,
        createdAt: new Date(),
        detalle: args.data.detalle ?? null,
      };
      store.logs.push(log);
      return { ...log };
    },

    async createMany(args: {
      data: Array<Omit<LogRow, "id" | "createdAt" | "detalle"> & { detalle?: string | null }>;
    }) {
      for (const d of args.data) {
        store.logs.push({
          ...d,
          id: store.nextLogId++,
          createdAt: new Date(),
          detalle: d.detalle ?? null,
        });
      }
      return { count: args.data.length };
    },
  },
};

/** Atajos para asertar en los tests. */
export function logsDe(solicitudId: number): LogRow[] {
  return store.logs.filter((l) => l.solicitudId === solicitudId);
}
export function acciones(solicitudId: number): string[] {
  return logsDe(solicitudId).map((l) => l.accion);
}
export function estadoDe(id: number): string | undefined {
  return store.rows.get(id)?.estado;
}
