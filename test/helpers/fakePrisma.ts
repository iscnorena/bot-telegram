/**
 * Prisma falso en memoria. Solo implementa lo que usan los servicios y los
 * route handlers. `updateMany` aplica el `where` condicional real, así la prueba
 * de condición de carrera es fiel y determinista.
 */
import { Prisma } from "@prisma/client";

type Dec = Prisma.Decimal;

export interface SolicitudRow {
  id: number;
  chatIdUsuario: bigint;
  curp: string;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  estado: string;
  servicioId: number | null;
  metodoEntrega: string | null;
  fileIdEntregado: string | null;
  proveedorId: number | null;
  pagadoAt: Date | null;
  enviadoProveedorAt: Date | null;
  entregadoAt: Date | null;
  costoProveedorEsperado: Dec | null;
  costoProveedorReal: Dec | null;
  facturadoAt: Date | null;
  facturadoPor: number | null;
  corteId: number | null;
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

export interface ConversacionRow {
  chatId: bigint;
  paso: string;
  solicitudId: number | null;
  intentos: number;
  updatedAt: Date;
}

export interface UsuarioRow {
  id: number;
  email: string;
  passwordHash: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

export interface ServicioRow {
  id: number;
  slug: string;
  nombre: string;
  precioUsuario: Dec;
  activo: boolean;
}

export interface TarifaRow {
  id: number;
  usuarioId: number;
  servicioId: number;
  monto: Dec;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  createdAt: Date;
}

export interface CorteRow {
  id: number;
  inicio: Date;
  fin: Date;
  cerradoAt: Date | null;
  cerradoPor: number | null;
  totalEntregadas: number | null;
  totalEsperado: Dec | null;
  totalReal: Dec | null;
  totalDiferencia: Dec | null;
}

interface Store {
  rows: Map<number, SolicitudRow>;
  logs: LogRow[];
  conversaciones: Map<string, ConversacionRow>;
  usuarios: UsuarioRow[];
  servicios: ServicioRow[];
  tarifas: TarifaRow[];
  cortes: CorteRow[];
  next: Record<string, number>;
}

export const store: Store = {
  rows: new Map(),
  logs: [],
  conversaciones: new Map(),
  usuarios: [],
  servicios: [],
  tarifas: [],
  cortes: [],
  next: { solicitud: 1, log: 1, usuario: 1, servicio: 1, tarifa: 1, corte: 1 },
};

const D = (v: number | string) => new Prisma.Decimal(v);

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
    servicioId: 1,
    metodoEntrega: null,
    fileIdEntregado: null,
    proveedorId: null,
    pagadoAt: null,
    enviadoProveedorAt: now,
    entregadoAt: null,
    costoProveedorEsperado: null,
    costoProveedorReal: null,
    facturadoAt: null,
    facturadoPor: null,
    corteId: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Reinicia el store y precarga solicitudes. Deja un `Servicio` por defecto. */
export function resetStore(seed: Array<Partial<SolicitudRow>> = []): SolicitudRow[] {
  store.rows.clear();
  store.logs = [];
  store.conversaciones.clear();
  store.usuarios = [];
  store.servicios = [
    {
      id: 1,
      slug: "acta_nacimiento",
      nombre: "Gestoría de acta de nacimiento",
      precioUsuario: D("350.00"),
      activo: true,
    },
  ];
  store.tarifas = [];
  store.cortes = [];
  store.next = { solicitud: 1, log: 1, usuario: 1, servicio: 2, tarifa: 1, corte: 1 };
  return seed.map((s) => {
    const id = s.id ?? store.next.solicitud;
    store.next.solicitud = Math.max(store.next.solicitud, id) + 1;
    const row = baseRow({ ...s, id });
    store.rows.set(id, row);
    return { ...row };
  });
}

export function seedUsuarios(us: Array<Partial<UsuarioRow>>): UsuarioRow[] {
  return us.map((u) => {
    const id = u.id ?? store.next.usuario;
    store.next.usuario = Math.max(store.next.usuario, id) + 1;
    const row: UsuarioRow = {
      id,
      email: u.email ?? `u${id}@test.mx`,
      passwordHash: u.passwordHash ?? "x",
      nombre: u.nombre ?? `Usuario ${id}`,
      rol: u.rol ?? "proveedor",
      activo: u.activo ?? true,
    };
    store.usuarios.push(row);
    return { ...row };
  });
}

export function seedTarifas(ts: Array<Partial<TarifaRow>>): TarifaRow[] {
  return ts.map((t) => {
    const id = t.id ?? store.next.tarifa;
    store.next.tarifa = Math.max(store.next.tarifa, id) + 1;
    const row: TarifaRow = {
      id,
      usuarioId: t.usuarioId ?? 1,
      servicioId: t.servicioId ?? 1,
      monto: t.monto ?? D("100.00"),
      vigenteDesde: t.vigenteDesde ?? new Date("2020-01-01"),
      vigenteHasta: t.vigenteHasta ?? null,
      createdAt: new Date(),
    };
    store.tarifas.push(row);
    return { ...row };
  });
}

// ---- where helpers -------------------------------------------------------

type EstadoWhere = string | { in?: string[]; notIn?: string[] } | undefined;

function estadoMatches(v: string, cond: EstadoWhere): boolean {
  if (cond === undefined) return true;
  if (typeof cond === "string") return v === cond;
  if (Array.isArray(cond.in)) return cond.in.includes(v);
  if (Array.isArray(cond.notIn)) return !cond.notIn.includes(v);
  return true;
}

interface DateRange {
  gte?: Date;
  lte?: Date;
  gt?: Date;
  lt?: Date;
}
function dateMatches(v: Date | null, cond: DateRange | undefined): boolean {
  if (cond === undefined) return true;
  if (v === null) return false;
  const ms = v.getTime();
  if (cond.gte && ms < cond.gte.getTime()) return false;
  if (cond.lte && ms > cond.lte.getTime()) return false;
  if (cond.gt && ms <= cond.gt.getTime()) return false;
  if (cond.lt && ms >= cond.lt.getTime()) return false;
  return true;
}

interface SolicitudWhere {
  id?: number;
  curp?: string;
  chatIdUsuario?: bigint;
  estado?: EstadoWhere;
  entregadoAt?: DateRange;
  servicioId?: number;
  costoProveedorReal?: { not: null } | null;
}

function solicitudMatches(r: SolicitudRow, w: SolicitudWhere): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.curp !== undefined && r.curp !== w.curp) return false;
  if (w.chatIdUsuario !== undefined && r.chatIdUsuario !== w.chatIdUsuario)
    return false;
  if (!estadoMatches(r.estado, w.estado)) return false;
  if (!dateMatches(r.entregadoAt, w.entregadoAt)) return false;
  if (w.servicioId !== undefined && r.servicioId !== w.servicioId) return false;
  if (w.costoProveedorReal && "not" in w.costoProveedorReal) {
    if (r.costoProveedorReal === null) return false;
  }
  return true;
}

function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>,
): Partial<T> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out as Partial<T>;
}

/** Extrae de un `select` las claves que son relaciones (valor objeto). */
function relacionesEnSelect(
  select?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!select) return undefined;
  const rel: Record<string, unknown> = {};
  for (const k of ["proveedor", "servicio", "corte"]) {
    if (select[k] && typeof select[k] === "object") rel[k] = select[k];
  }
  return Object.keys(rel).length ? rel : undefined;
}

function conInclude(r: SolicitudRow, include?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...r };
  if (!include) return out;
  if (include.proveedor)
    out.proveedor = store.usuarios.find((u) => u.id === r.proveedorId) ?? null;
  if (include.servicio)
    out.servicio = store.servicios.find((s) => s.id === r.servicioId) ?? null;
  if (include.corte)
    out.corte = store.cortes.find((c) => c.id === r.corteId) ?? null;
  return out;
}

function ordenar<T>(rows: T[], orderBy: unknown): T[] {
  const specs = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const spec of specs as Record<string, "asc" | "desc">[]) {
      const [k, dir] = Object.entries(spec)[0];
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      const cmp =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : (av as number) < (bv as number)
            ? -1
            : (av as number) > (bv as number)
              ? 1
              : 0;
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

// ---- fake client -------------------------------------------------------

export const fakePrisma = {
  async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(fakePrisma);
  },

  solicitud: {
    async findUnique(args: {
      where: { id: number };
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) {
      const row = store.rows.get(args.where.id);
      if (!row) return null;
      const rel = args.include ?? relacionesEnSelect(args.select);
      const base = rel ? conInclude(row, rel) : { ...row };
      if (!args.select) return base;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(args.select)) {
        if (args.select[k]) out[k] = (base as Record<string, unknown>)[k];
      }
      return out;
    },

    async findMany(args: {
      where?: SolicitudWhere;
      orderBy?: unknown;
      include?: Record<string, unknown>;
    }) {
      const w = args.where ?? {};
      let rows = [...store.rows.values()].filter((r) => solicitudMatches(r, w));
      rows = ordenar(rows, args.orderBy ?? { id: "asc" });
      return rows.map((r) => (args.include ? conInclude(r, args.include) : { ...r }));
    },

    async findFirst(args: { where?: SolicitudWhere; orderBy?: unknown }) {
      const w = args.where ?? {};
      let rows = [...store.rows.values()].filter((r) => solicitudMatches(r, w));
      rows = ordenar(rows, args.orderBy ?? { id: "asc" });
      return rows.length ? { ...rows[0] } : null;
    },

    async count(args: { where?: SolicitudWhere }) {
      const w = args?.where ?? {};
      return [...store.rows.values()].filter((r) => solicitudMatches(r, w)).length;
    },

    async aggregate(args: {
      where?: SolicitudWhere;
      _sum?: Record<string, boolean>;
    }) {
      const w = args.where ?? {};
      const rows = [...store.rows.values()].filter((r) => solicitudMatches(r, w));
      const _sum: Record<string, Dec | null> = {};
      for (const k of Object.keys(args._sum ?? {})) {
        let acc: Dec | null = null;
        for (const r of rows) {
          const v = (r as unknown as Record<string, unknown>)[k] as Dec | null;
          if (v !== null) acc = (acc ?? D(0)).plus(v);
        }
        _sum[k] = acc;
      }
      return { _sum };
    },

    async create(args: {
      data: Partial<SolicitudRow>;
      select?: Record<string, boolean>;
    }) {
      const id = store.next.solicitud++;
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
      where: SolicitudWhere;
      data: Partial<SolicitudRow>;
    }) {
      let count = 0;
      for (const row of store.rows.values()) {
        if (!solicitudMatches(row, args.where)) continue;
        Object.assign(row, args.data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    },
  },

  conversacion: {
    async upsert(args: {
      where: { chatId: bigint };
      update: Partial<ConversacionRow>;
      create: Partial<ConversacionRow> & { chatId: bigint };
    }) {
      const key = args.where.chatId.toString();
      const e = store.conversaciones.get(key);
      if (e) {
        Object.assign(e, args.update, { updatedAt: new Date() });
        return { ...e };
      }
      const row: ConversacionRow = {
        chatId: args.create.chatId,
        paso: args.create.paso ?? "menu",
        solicitudId: args.create.solicitudId ?? null,
        intentos: args.create.intentos ?? 0,
        updatedAt: new Date(),
      };
      store.conversaciones.set(key, row);
      return { ...row };
    },
    async findUnique(args: { where: { chatId: bigint } }) {
      const row = store.conversaciones.get(args.where.chatId.toString());
      return row ? { ...row } : null;
    },
  },

  usuario: {
    async findMany(args?: {
      where?: { rol?: string; activo?: boolean };
      select?: Record<string, boolean>;
      orderBy?: unknown;
      take?: number;
      include?: Record<string, unknown>;
    }) {
      const w = args?.where ?? {};
      let rows = store.usuarios.filter(
        (u) =>
          (w.rol === undefined || u.rol === w.rol) &&
          (w.activo === undefined || u.activo === w.activo),
      );
      rows = ordenar(rows, args?.orderBy);
      if (args?.take) rows = rows.slice(0, args.take);
      return rows.map((u) => {
        const base = args?.select ? project({ ...u }, args.select) : { ...u };
        if (args?.include?.tarifas) {
          (base as Record<string, unknown>).tarifas = store.tarifas
            .filter((t) => t.usuarioId === u.id)
            .map((t) => ({
              ...t,
              servicio: store.servicios.find((s) => s.id === t.servicioId) ?? null,
            }));
        }
        return base;
      });
    },
    async findUnique(args: { where: { id?: number; email?: string } }) {
      const u = store.usuarios.find(
        (x) =>
          (args.where.id !== undefined && x.id === args.where.id) ||
          (args.where.email !== undefined && x.email === args.where.email),
      );
      return u ? { ...u } : null;
    },
    async count(args?: { where?: { rol?: string; activo?: boolean } }) {
      const w = args?.where ?? {};
      return store.usuarios.filter(
        (u) =>
          (w.rol === undefined || u.rol === w.rol) &&
          (w.activo === undefined || u.activo === w.activo),
      ).length;
    },
  },

  servicio: {
    async findUnique(args: { where: { id?: number; slug?: string } }) {
      const s = store.servicios.find(
        (x) =>
          (args.where.id !== undefined && x.id === args.where.id) ||
          (args.where.slug !== undefined && x.slug === args.where.slug),
      );
      return s ? { ...s } : null;
    },
    async findFirst(args?: { where?: { activo?: boolean }; orderBy?: unknown }) {
      let rows = store.servicios.filter(
        (s) => args?.where?.activo === undefined || s.activo === args.where.activo,
      );
      rows = ordenar(rows, args?.orderBy ?? { id: "asc" });
      return rows.length ? { ...rows[0] } : null;
    },
    async findMany(args?: { where?: { activo?: boolean }; orderBy?: unknown }) {
      let rows = store.servicios.filter(
        (s) => args?.where?.activo === undefined || s.activo === args.where.activo,
      );
      rows = ordenar(rows, args?.orderBy ?? { id: "asc" });
      return rows.map((s) => ({ ...s }));
    },
    async update(args: { where: { id: number }; data: Partial<ServicioRow> }) {
      const s = store.servicios.find((x) => x.id === args.where.id);
      if (!s) throw new Error("servicio no existe");
      Object.assign(s, args.data);
      return { ...s };
    },
  },

  tarifa: {
    async findFirst(args: {
      where: {
        usuarioId: number;
        servicioId: number;
        vigenteDesde?: DateRange;
        OR?: Array<{ vigenteHasta: null | { gt: Date } }>;
      };
      orderBy?: unknown;
    }) {
      const w = args.where;
      let rows = store.tarifas.filter((t) => {
        if (t.usuarioId !== w.usuarioId || t.servicioId !== w.servicioId)
          return false;
        if (!dateMatches(t.vigenteDesde, w.vigenteDesde)) return false;
        if (w.OR) {
          const ok = w.OR.some((c) => {
            if (c.vigenteHasta === null) return t.vigenteHasta === null;
            return t.vigenteHasta !== null && t.vigenteHasta > c.vigenteHasta.gt;
          });
          if (!ok) return false;
        }
        return true;
      });
      rows = ordenar(rows, args.orderBy ?? { vigenteDesde: "desc" });
      return rows.length ? { ...rows[0] } : null;
    },
    async findMany(args?: { where?: { usuarioId?: number }; orderBy?: unknown }) {
      let rows = store.tarifas.filter(
        (t) =>
          args?.where?.usuarioId === undefined ||
          t.usuarioId === args.where.usuarioId,
      );
      rows = ordenar(rows, args?.orderBy);
      return rows.map((t) => ({ ...t }));
    },
    async updateMany(args: {
      where: { usuarioId: number; servicioId: number; vigenteHasta: null };
      data: { vigenteHasta: Date };
    }) {
      let count = 0;
      for (const t of store.tarifas) {
        if (
          t.usuarioId === args.where.usuarioId &&
          t.servicioId === args.where.servicioId &&
          t.vigenteHasta === null
        ) {
          t.vigenteHasta = args.data.vigenteHasta;
          count++;
        }
      }
      return { count };
    },
    async create(args: { data: Omit<TarifaRow, "id" | "createdAt"> }) {
      const row: TarifaRow = {
        ...args.data,
        vigenteHasta: args.data.vigenteHasta ?? null,
        id: store.next.tarifa++,
        createdAt: new Date(),
      };
      store.tarifas.push(row);
      return { ...row };
    },
  },

  corte: {
    async findUnique(args: {
      where: { inicio_fin: { inicio: Date; fin: Date } };
    }) {
      const { inicio, fin } = args.where.inicio_fin;
      const c = store.cortes.find(
        (x) => x.inicio.getTime() === inicio.getTime() && x.fin.getTime() === fin.getTime(),
      );
      return c ? { ...c } : null;
    },
    async upsert(args: {
      where: { inicio_fin: { inicio: Date; fin: Date } };
      update: Partial<CorteRow>;
      create: { inicio: Date; fin: Date };
    }) {
      const { inicio, fin } = args.where.inicio_fin;
      let c = store.cortes.find(
        (x) => x.inicio.getTime() === inicio.getTime() && x.fin.getTime() === fin.getTime(),
      );
      if (c) {
        Object.assign(c, args.update);
        return { ...c };
      }
      c = {
        id: store.next.corte++,
        inicio,
        fin,
        cerradoAt: null,
        cerradoPor: null,
        totalEntregadas: null,
        totalEsperado: null,
        totalReal: null,
        totalDiferencia: null,
      };
      store.cortes.push(c);
      return { ...c };
    },
    async update(args: { where: { id: number }; data: Partial<CorteRow> }) {
      const c = store.cortes.find((x) => x.id === args.where.id);
      if (!c) throw new Error("corte no existe");
      Object.assign(c, args.data);
      return { ...c };
    },
  },

  solicitudLog: {
    async create(args: { data: Omit<LogRow, "id" | "createdAt"> }) {
      const log: LogRow = {
        ...args.data,
        id: store.next.log++,
        createdAt: new Date(),
        detalle: args.data.detalle ?? null,
      };
      store.logs.push(log);
      return { ...log };
    },
    async createMany(args: {
      data: Array<
        Omit<LogRow, "id" | "createdAt" | "detalle"> & { detalle?: string | null }
      >;
    }) {
      for (const d of args.data) {
        store.logs.push({
          ...d,
          id: store.next.log++,
          createdAt: new Date(),
          detalle: d.detalle ?? null,
        });
      }
      return { count: args.data.length };
    },
  },
};

// ---- assertion helpers ------------------------------------------------

export function logsDe(solicitudId: number): LogRow[] {
  return store.logs.filter((l) => l.solicitudId === solicitudId);
}
export function acciones(solicitudId: number): string[] {
  return logsDe(solicitudId).map((l) => l.accion);
}
export function estadoDe(id: number): string | undefined {
  return store.rows.get(id)?.estado;
}
export function conversacionDe(
  chatId: bigint | number,
): ConversacionRow | undefined {
  return store.conversaciones.get(chatId.toString());
}
export function solicitudes(): SolicitudRow[] {
  return [...store.rows.values()];
}
export function solicitudDe(id: number): SolicitudRow | undefined {
  return store.rows.get(id);
}
