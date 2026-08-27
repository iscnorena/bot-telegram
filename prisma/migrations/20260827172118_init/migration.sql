-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('pendiente_curp', 'pagado', 'enviado_proveedor', 'entregando', 'no_encontrado_proveedor', 'entregado', 'no_encontrado');

-- CreateTable
CREATE TABLE "solicitudes" (
    "id" SERIAL NOT NULL,
    "chat_id_usuario" BIGINT NOT NULL,
    "curp" VARCHAR(18) NOT NULL,
    "nombre" TEXT,
    "apellido_paterno" TEXT,
    "apellido_materno" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'pendiente_curp',
    "metodo_entrega" TEXT,
    "file_id_entregado" TEXT,
    "proveedor_id" INTEGER,
    "pagado_at" TIMESTAMP(3),
    "enviado_proveedor_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_logs" (
    "id" SERIAL NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_curp_idx" ON "solicitudes"("curp");

-- CreateIndex
CREATE INDEX "solicitudes_chat_id_usuario_idx" ON "solicitudes"("chat_id_usuario");

-- CreateIndex
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes"("estado");

-- CreateIndex
CREATE INDEX "solicitud_logs_solicitud_id_idx" ON "solicitud_logs"("solicitud_id");

-- AddForeignKey
ALTER TABLE "solicitud_logs" ADD CONSTRAINT "solicitud_logs_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
