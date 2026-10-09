const TJ_COUNTRY_CODE = "992";

export class PhoneValidationError extends Error {
  constructor(message = "Введите корректный номер телефона Таджикистана") {
    super(message);
    this.name = "PhoneValidationError";
  }
}

export function normalizeTajikPhone(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const digits = compact.replace(/^\+/, "");
  let national: string;

  if (/^992\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  else throw new PhoneValidationError();

  if (!/^[1-9]\d{8}$/.test(national)) throw new PhoneValidationError();
  return `+${TJ_COUNTRY_CODE}${national}`;
}

export function formatTajikPhone(phoneE164: string): string {
  const normalized = normalizeTajikPhone(phoneE164);
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7, 9)} ${normalized.slice(9, 11)} ${normalized.slice(11)}`;
}

export function isTajikPhone(input: string): boolean {
  try {
    normalizeTajikPhone(input);
    return true;
  } catch {
    return false;
  }
}
