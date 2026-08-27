/**
 * Semana del corte: lunes 00:00:00.000 a domingo 23:59:59.999, hora de Ciudad
 * de México. México abolió el horario de verano en 2022, así que CDMX es
 * **UTC-6 todo el año** y basta un offset fijo (sin librería de zonas).
 */
const OFFSET_CDMX_MS = -6 * 60 * 60 * 1000;
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export interface Semana {
  inicio: Date; // instante UTC del lunes 00:00 CDMX
  fin: Date; // instante UTC del domingo 23:59:59.999 CDMX
}

/** "Reloj de pared" CDMX como campos UTC de un Date auxiliar. */
function aLocal(fecha: Date): Date {
  return new Date(fecha.getTime() + OFFSET_CDMX_MS);
}

export function semanaDe(fecha: Date = new Date()): Semana {
  const local = aLocal(fecha);
  const diaSemana = local.getUTCDay(); // 0=domingo … 6=sábado
  const desdeLunes = (diaSemana + 6) % 7; // lunes = 0
  const lunesLocalMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - desdeLunes,
    0,
    0,
    0,
    0,
  );
  const inicio = lunesLocalMs - OFFSET_CDMX_MS; // de reloj local a UTC real
  return { inicio: new Date(inicio), fin: new Date(inicio + SEMANA_MS - 1) };
}

export function semanaAnterior(s: Semana): Semana {
  return semanaDe(new Date(s.inicio.getTime() - 1));
}

/** Últimas `n` semanas, de la más reciente a la más antigua. */
export function ultimasSemanas(n: number, desde: Date = new Date()): Semana[] {
  const out: Semana[] = [];
  let s = semanaDe(desde);
  for (let i = 0; i < n; i++) {
    out.push(s);
    s = semanaAnterior(s);
  }
  return out;
}

/** Lunes de la semana como `YYYY-MM-DD` (para URLs). */
export function lunesISO(s: Semana): string {
  const l = aLocal(s.inicio);
  const mm = String(l.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(l.getUTCDate()).padStart(2, "0");
  return `${l.getUTCFullYear()}-${mm}-${dd}`;
}

/** Reconstruye la semana a partir del `YYYY-MM-DD` de su lunes. */
export function semanaDesdeLunesISO(iso: string): Semana | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const lunesLocalMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  const inicioMs = lunesLocalMs - OFFSET_CDMX_MS;
  const s = semanaDe(new Date(inicioMs + 60_000)); // +1min para caer dentro
  return s.inicio.getTime() === inicioMs ? s : null;
}

const FMT_DIA = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
});
const FMT_DIA_ANIO = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "18 – 24 ago 2026" */
export function formatoRango(s: Semana): string {
  return `${FMT_DIA.format(s.inicio)} – ${FMT_DIA_ANIO.format(s.fin)}`;
}
