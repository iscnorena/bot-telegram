/** Tope de tamaño para el PDF que sube el proveedor por el panel web.
 *  Se mantiene por debajo del límite de body (~4.5 MB) de una función
 *  serverless en Vercel. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
