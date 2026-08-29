import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type NormalisedPhone = {
  e164: string | null;
  national: string | null;
  country: string | null;
  valid: boolean;
  raw: string;
};

/**
 * Every phone number is normalised to E.164 on write and deduped on that value.
 * Falsely-formatted sheet exports ("0300-1234567", "+92 300 1234567", "'03001234567")
 * all collapse to the same +923001234567.
 */
export function normalisePhone(raw: string | null | undefined, defaultCountry = "PK"): NormalisedPhone {
  const input = (raw ?? "").toString().trim();
  const empty: NormalisedPhone = { e164: null, national: null, country: null, valid: false, raw: input };
  if (!input) return empty;

  const cleaned = input.replace(/^['`]/, "").replace(/[^\d+]/g, (c) => (c === "+" ? "+" : ""));
  if (!cleaned) return empty;

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) {
    // Keep digits so the row is still importable and searchable, flagged invalid.
    return { ...empty, e164: cleaned.startsWith("+") ? cleaned : null, raw: input };
  }

  return {
    e164: parsed.number,
    national: parsed.formatNational(),
    country: parsed.country ?? null,
    valid: true,
    raw: input,
  };
}

export function formatPhone(e164: string | null | undefined, defaultCountry = "PK"): string {
  if (!e164) return "—";
  const parsed = parsePhoneNumberFromString(e164, defaultCountry as CountryCode);
  return parsed?.formatInternational() ?? e164;
}

export function telHref(e164: string | null | undefined): string {
  return `tel:${(e164 ?? "").replace(/[^\d+]/g, "")}`;
}

/** wa.me wants digits only, no leading plus. */
export function whatsAppHref(e164: string | null | undefined, message?: string): string {
  const digits = (e164 ?? "").replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
