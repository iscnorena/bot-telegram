// Gestiona el webhook de Telegram del bot.
// Uso:
//   WEBHOOK_BASE_URL="https://tu-app.vercel.app" npm run webhook:set
//   npm run webhook:info
//   npm run webhook:delete
// La base también puede pasarse como  --url https://...

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) {
  console.error("Falta TELEGRAM_BOT_TOKEN en el entorno (.env).");
  process.exit(1);
}

const sub = process.argv[2];
const argUrl = (() => {
  const i = process.argv.indexOf("--url");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const base = (argUrl ?? process.env.WEBHOOK_BASE_URL ?? "").replace(/\/+$/, "");

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function call(method, body) {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) {
    console.error(`Telegram ${method} falló:`, data?.description ?? res.status);
    process.exit(1);
  }
  return data.result;
}

switch (sub) {
  case "set": {
    if (!base) {
      console.error("Falta la URL base (--url o WEBHOOK_BASE_URL).");
      process.exit(1);
    }
    if (!secret) {
      console.error("Falta TELEGRAM_WEBHOOK_SECRET en el entorno.");
      process.exit(1);
    }
    const url = `${base}/api/telegram/webhook`;
    await call("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    console.log(`Webhook registrado: ${url}`);
    break;
  }
  case "delete": {
    await call("deleteWebhook", { drop_pending_updates: true });
    console.log("Webhook eliminado.");
    break;
  }
  case "info":
  case undefined: {
    const info = await call("getWebhookInfo");
    console.log(JSON.stringify(info, null, 2));
    break;
  }
  default:
    console.error(`Subcomando desconocido: ${sub}. Usa: set | info | delete`);
    process.exit(1);
}
