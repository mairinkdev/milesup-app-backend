export function toIsoString(date: Date | string | null | undefined) {
  if (!date) {
    return null;
  }

  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

export function toRequiredIsoString(date: Date | string) {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

export function toCurrencyAmount(amountMinor: number, currency: string) {
  return {
    amountMinor,
    currency
  };
}

export function buildPagination(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(Math.ceil(totalItems / pageSize), 1)
  };
}
