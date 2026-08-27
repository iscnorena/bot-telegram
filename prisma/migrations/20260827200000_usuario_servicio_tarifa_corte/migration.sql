-- Generaliza `proveedores` a `usuarios` (con rol) preservando los datos
ALTER TABLE "proveedores" RENAME TO "usuarios";
ALTER INDEX "proveedores_email_key" RENAME TO "usuarios_email_key";
ALTER TABLE "usuarios" ADD COLUMN "rol" TEXT NOT NULL DEFAULT 'proveedor';

-- Servicio (precio al usuario configurable)
CREATE TABLE "servicios" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_usuario" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "servicios_slug_key" ON "servicios"("slug");

INSERT INTO "servicios" ("slug", "nombre", "precio_usuario", "activo", "updated_at")
VALUES ('acta_nacimiento', 'Gestoría de acta de nacimiento', 350.00, true, CURRENT_TIMESTAMP);

-- Tarifa (costo del proveedor, con historial de vigencias)
CREATE TABLE "tarifas" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "servicio_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL,
    "vigente_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tarifas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tarifas_usuario_id_servicio_id_vigente_desde_idx" ON "tarifas"("usuario_id", "servicio_id", "vigente_desde");

-- Corte semanal
CREATE TABLE "cortes" (
    "id" SERIAL NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "cerrado_at" TIMESTAMP(3),
    "cerrado_por" INTEGER,
    "total_entregadas" INTEGER,
    "total_esperado" DECIMAL(12,2),
    "total_real" DECIMAL(12,2),
    "total_diferencia" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cortes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cortes_inicio_fin_key" ON "cortes"("inicio", "fin");

-- Solicitud: servicio + campos de conciliación
ALTER TABLE "solicitudes"
    ADD COLUMN "servicio_id" INTEGER,
    ADD COLUMN "costo_proveedor_esperado" DECIMAL(10,2),
    ADD COLUMN "costo_proveedor_real" DECIMAL(10,2),
    ADD COLUMN "facturado_at" TIMESTAMP(3),
    ADD COLUMN "facturado_por" INTEGER,
    ADD COLUMN "corte_id" INTEGER;

UPDATE "solicitudes"
SET "servicio_id" = (SELECT "id" FROM "servicios" WHERE "slug" = 'acta_nacimiento')
WHERE "servicio_id" IS NULL;

CREATE INDEX "solicitudes_entregado_at_idx" ON "solicitudes"("entregado_at");

-- Llaves foráneas
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_servicio_id_fkey"
    FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_servicio_id_fkey"
    FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_proveedor_id_fkey"
    FOREIGN KEY ("proveedor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_corte_id_fkey"
    FOREIGN KEY ("corte_id") REFERENCES "cortes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
