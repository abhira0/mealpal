export interface RunoutInput {
  stock: number;        // current canonical units on hand
  dailyRate: number;    // mean planned consumption per day
  dailyStdDev: number;  // std dev of daily consumption from history
  historyDays: number;  // how many days of cooked history informed the stddev
  bufferDays: number;   // safety buffer (days) the user wants
}

export interface RunoutResult {
  pointDays: number; // days until stock hits zero at the mean rate
  lowDays: number;   // earliest plausible run-out (when to act), buffer applied
  highDays: number;  // latest plausible run-out
}

const MIN_HISTORY_DAYS = 7; // below this, variance is untrustworthy -> collapse to point

export function predictRunout(input: RunoutInput): RunoutResult {
  const { stock, dailyRate, dailyStdDev, historyDays, bufferDays } = input;
  if (dailyRate <= 0) {
    return { pointDays: Infinity, lowDays: Infinity, highDays: Infinity };
  }
  const pointDays = Math.floor(stock / dailyRate);
  // collapse the range to the point estimate when history is too thin to trust
  const sigma = historyDays >= MIN_HISTORY_DAYS ? dailyStdDev : 0;
  const highRate = dailyRate + sigma;            // faster use -> sooner run-out
  const lowRate = Math.max(dailyRate - sigma, 1); // slower use -> later run-out (avoid /0)
  const lowDays = Math.max(Math.floor(stock / highRate) - bufferDays, 0);
  const highDays = Math.round(stock / lowRate);
  return { pointDays, lowDays, highDays };
}
