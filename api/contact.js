const CONTACT_ENDPOINT = "https://zaltyko.com/api/contact";
const MAX_BODY_BYTES = 8 * 1024;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function contactProxy(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Método no permitido." });
  }

  // Vercel previews and local builds stay disconnected from the production CRM.
  if (process.env.VERCEL_ENV !== "production") {
    return json(res, 503, {
      ok: false,
      message: "El envío está desactivado en esta vista previa. No se ha enviado ningún dato.",
    });
  }

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return json(res, 415, { ok: false, message: "Formato de solicitud no válido." });
  }

  const incomingLength = Number(req.headers["content-length"] || 0);
  if (incomingLength > MAX_BODY_BYTES) {
    return json(res, 413, { ok: false, message: "La solicitud supera el tamaño permitido." });
  }

  const body = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return json(res, 413, { ok: false, message: "La solicitud supera el tamaño permitido." });
  }

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const upstream = await fetch(CONTACT_ENDPOINT, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    for (const header of ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.end(responseText || JSON.stringify({ ok: false, message: "No se pudo completar la solicitud." }));
  } catch {
    return json(res, 502, {
      ok: false,
      message: "No se pudo conectar con Zaltyko. Tus datos siguen aquí; inténtalo de nuevo.",
    });
  }
};
