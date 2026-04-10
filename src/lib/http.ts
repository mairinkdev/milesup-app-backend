export function parsePeriodToDateRange(period?: string) {
  const now = new Date();
  const from = new Date(now);

  switch (period) {
    case '7d':
      from.setDate(now.getDate() - 7);
      break;
    case '15d':
      from.setDate(now.getDate() - 15);
      break;
    case '90d':
      from.setDate(now.getDate() - 90);
      break;
    case '30d':
    default:
      from.setDate(now.getDate() - 30);
      break;
  }

  return {
    from,
    to: now
  };
}
