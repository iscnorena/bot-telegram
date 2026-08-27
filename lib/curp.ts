/**
 * Validación de CURP (formato local, sin consultar RENAPO — regla 6 del brief).
 * Estructura oficial de 18 caracteres, con códigos de entidad federativa.
 */
const CURP_RE =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

/** trim + mayúsculas + sin espacios internos. */
export function normalizarCurp(entrada: string): string {
  return entrada.trim().toUpperCase().replace(/\s+/g, "");
}

/** true si la cadena normalizada tiene forma de CURP válida. */
export function esCurpValida(entrada: string): boolean {
  return CURP_RE.test(normalizarCurp(entrada));
}
