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

function validateForm(name, email, consent) {
  const errors = [];
  const cleanName = name.value.trim();

  setFieldError(name, "");
  setFieldError(email, "");
  setFieldError(consent, "");
  if (cleanName.length < 2) {
    const message = "Escribe tu nombre para poder atender la solicitud.";
    setFieldError(name, message);
    errors.push({ input: name, message });
  }
  if (!email.value.trim()) {
    const message = "Escribe un email de contacto.";
    setFieldError(email, message);
    errors.push({ input: email, message });
  } else if (!email.validity.valid) {
    const message = "Revisa el formato del email.";
    setFieldError(email, message);
    errors.push({ input: email, message });
  }
  if (!consent.checked) {
    const message = "Marca la casilla para recibir el aviso de lanzamiento y novedades por email.";
    setFieldError(consent, message);
    errors.push({ input: consent, message });
  }

  return errors;
}

function renderValidationSummary(summary, errors) {
  const list = summary.querySelector("ul");
  list.replaceChildren(...errors.map(({ input, message }) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${input.id}`;
    link.textContent = message;
    item.append(link);
    return item;
  }));
  summary.hidden = errors.length === 0;
}

function responseMessage(payload) {
  return payload?.message || payload?.data?.message || payload?.error || payload?.data?.error;
}

function setupContactForm(attribution) {
  const form = document.getElementById("academy-interest-form");
  if (!form) return;

  const name = document.getElementById("name");
  const email = document.getElementById("email");
  const consent = document.getElementById("marketing-consent");
  const academy = document.getElementById("academy");
  const honeypot = document.getElementById("website");
  const button = document.getElementById("submit-button");
  const feedback = document.getElementById("form-feedback");
  const errorSummary = document.getElementById("form-error-summary");
  const successPanel = document.getElementById("success-panel");
  const defaultButton = button.innerHTML;
  let isSubmitting = false;
  let retryFingerprint = "";
  let retrySubmissionId = "";
  button.disabled = false;

  [name, email].forEach((input) => {
    input.addEventListener("input", () => {
      setFieldError(input, "");
      feedback.hidden = true;
      feedback.textContent = "";
      const remainingErrors = [name, email].flatMap((field) => {
        const message = document.getElementById(`${field.id}-error`).textContent;
        return message ? [{ input: field, message }] : [];
      });
      renderValidationSummary(errorSummary, remainingErrors);
    });
  });
  consent.addEventListener("change", () => {
    setFieldError(consent, "");
    const remainingErrors = [name, email, consent].flatMap((field) => {
      const message = document.getElementById(`${field.id}-error`).textContent;
      return message ? [{ input: field, message }] : [];
    });
    renderValidationSummary(errorSummary, remainingErrors);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    const validationErrors = validateForm(name, email, consent);
    if (validationErrors.length) {
      renderValidationSummary(errorSummary, validationErrors);
      errorSummary.focus();
      return;
    }
    if (honeypot.value.trim()) return;

    const cleanName = name.value.trim();
    const cleanEmail = email.value.trim().toLowerCase();
    const cleanAcademy = academy.value.trim();
    const fingerprint = JSON.stringify([cleanName, cleanEmail, cleanAcademy, consent.checked, attribution]);
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
    errorSummary.hidden = true;

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
          marketingConsent: consent.checked,
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
          throw new Error(responseMessage(payload) || "No se ha podido completar el envío. Tus datos siguen en el formulario; inténtalo de nuevo.");
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
      feedback.focus();
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
