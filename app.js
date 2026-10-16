const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const UTM_VALUE = /^[a-z0-9_-]{1,128}$/;
const DEFAULT_ATTRIBUTION = {
  utm_source: "waitlist",
  utm_medium: "referral",
  utm_campaign: "academy_acquisition",
};

function getAttribution() {
  const search = new URLSearchParams(window.location.search);
  const values = {};

  for (const key of UTM_KEYS) {
    const value = search.get(key)?.trim().toLowerCase();
    if (value && UTM_VALUE.test(value)) values[key] = value;
  }

  return Object.keys(values).length ? values : DEFAULT_ATTRIBUTION;
}

function passAttributionToZaltyko(attribution) {
  document.querySelectorAll("a[data-track-attribution]").forEach((link) => {
    try {
      const destination = new URL(link.href);
      for (const key of UTM_KEYS) destination.searchParams.delete(key);
      for (const [key, value] of Object.entries(attribution)) {
        destination.searchParams.set(key, value);
      }
      link.href = destination.toString();
    } catch {
      // A malformed CTA should not break the rest of the page.
    }
  });
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message;
}

function validateForm(name, email) {
  let valid = true;
  const cleanName = name.value.trim();

  setFieldError(name, "");
  setFieldError(email, "");
  if (cleanName.length < 2) {
    setFieldError(name, "Escribe tu nombre para poder atender la solicitud.");
    valid = false;
  }
  if (!email.value.trim()) {
    setFieldError(email, "Escribe un email de contacto.");
    valid = false;
  } else if (!email.validity.valid) {
    setFieldError(email, "Revisa el formato del email.");
    valid = false;
  }

  if (!valid) {
    document.querySelector('[aria-invalid="true"]')?.focus();
  }
  return valid;
}

function responseMessage(payload) {
  return payload?.message || payload?.data?.message || payload?.error || payload?.data?.error;
}

function setupContactForm(attribution) {
  const form = document.getElementById("academy-interest-form");
  if (!form) return;

  const name = document.getElementById("name");
  const email = document.getElementById("email");
  const academy = document.getElementById("academy");
  const honeypot = document.getElementById("website");
  const button = document.getElementById("submit-button");
  const feedback = document.getElementById("form-feedback");
  const successPanel = document.getElementById("success-panel");
  const defaultButton = button.innerHTML;
  let isSubmitting = false;
  let retryFingerprint = "";
  let retrySubmissionId = "";
  button.disabled = false;

  [name, email].forEach((input) => {
    input.addEventListener("input", () => setFieldError(input, ""));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting || !validateForm(name, email)) return;
    if (honeypot.value.trim()) return;

    const cleanName = name.value.trim();
    const cleanEmail = email.value.trim().toLowerCase();
    const cleanAcademy = academy.value.trim();
    const fingerprint = JSON.stringify([cleanName, cleanEmail, cleanAcademy, attribution]);
    if (fingerprint !== retryFingerprint) {
      retryFingerprint = fingerprint;
      retrySubmissionId = crypto.randomUUID();
    }

    isSubmitting = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = "<span>Enviando…</span><span aria-hidden=\"true\">↻</span>";
    feedback.hidden = true;
    feedback.textContent = "";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          ...(cleanAcademy ? { academy: cleanAcademy } : {}),
          reason: "sales",
          source: "academy_waitlist",
          message: "Solicitud de información desde la landing de academias.",
          visitorId: null,
          submissionId: retrySubmissionId,
          attribution,
          honeypot: honeypot.value,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.ok !== true) {
        if (response.status === 429) {
          throw new Error("Hemos recibido demasiadas solicitudes desde esta conexión. Espera un minuto y vuelve a intentarlo.");
        }
        if (response.status >= 500) {
          throw new Error("Ahora no podemos guardar tu solicitud. Tus datos siguen aquí; inténtalo de nuevo dentro de unos minutos.");
        }
        throw new Error(responseMessage(payload) || "No se pudo guardar la solicitud. Revisa los datos e inténtalo de nuevo.");
      }

      form.hidden = true;
      successPanel.hidden = false;
      successPanel.focus();
    } catch (error) {
      feedback.textContent = error instanceof Error
        ? error.message
        : "No se pudo enviar la solicitud. Tus datos siguen aquí; inténtalo de nuevo.";
      feedback.hidden = false;
    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = defaultButton;
    }
  });
}

const attribution = getAttribution();
passAttributionToZaltyko(attribution);
setupContactForm(attribution);
