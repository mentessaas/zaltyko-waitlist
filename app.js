const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const UTM_DEFAULTS = {
  utm_source: "waitlist",
  utm_medium: "referral",
  utm_campaign: "academy_acquisition",
};
const UTM_VALUE = /^[a-z0-9_-]{1,128}$/;

function getAttribution() {
  const incoming = new URLSearchParams(window.location.search);
  const values = {};

  for (const key of UTM_KEYS) {
    const value = incoming.get(key)?.trim().toLowerCase();
    if (value && UTM_VALUE.test(value)) values[key] = value;
  }

  if (Object.keys(values).length > 0) return values;
  return UTM_DEFAULTS;
}

function passAttributionToZaltyko() {
  const attribution = getAttribution();

  document.querySelectorAll("a[data-track-attribution]").forEach((link) => {
    try {
      const destination = new URL(link.href);
      for (const key of UTM_KEYS) destination.searchParams.delete(key);
      for (const [key, value] of Object.entries(attribution)) {
        destination.searchParams.set(key, value);
      }
      link.href = destination.toString();
    } catch {
      // A malformed CTA should remain unchanged and must not break the page.
    }
  });
}

passAttributionToZaltyko();
