/** Tope de tamaño para el PDF que sube el proveedor por el panel web.
 *  Se mantiene por debajo del límite de body (~4.5 MB) de una función
 *  serverless en Vercel. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/** Precio del servicio de gestoría (solo para mostrar; el cobro está fuera
 *  de alcance en esta fase). */
export const PRECIO_GESTORIA = "$350 MXN";

/** Reintentos de CURP inválida antes de devolver al menú. */
export const MAX_REINTENTOS_CURP = 3;
