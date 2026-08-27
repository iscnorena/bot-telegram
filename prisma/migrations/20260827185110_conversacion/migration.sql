-- CreateTable
CREATE TABLE "conversaciones" (
    "chat_id" BIGINT NOT NULL,
    "paso" TEXT NOT NULL DEFAULT 'menu',
    "solicitud_id" INTEGER,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("chat_id")
);
