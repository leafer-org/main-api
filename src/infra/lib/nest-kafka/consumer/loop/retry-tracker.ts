const DEFAULT_INITIAL_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 5000;
const JITTER_MIN = 0.5;
const JITTER_RANGE = 0.5;

export type RetryTrackerOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export class RetryTracker {
  private consecutiveErrors = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  public constructor(
    private readonly maxErrors: number,
    options?: RetryTrackerOptions,
  ) {
    this.initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  public get tryCount(): number {
    return this.consecutiveErrors;
  }

  public get isExhausted(): boolean {
    return this.consecutiveErrors >= this.maxErrors;
  }

  public incrementTry(): void {
    this.consecutiveErrors++;
  }

  public reset(): void {
    this.consecutiveErrors = 0;
  }

  public async delay(): Promise<void> {
    const base = Math.min(this.initialDelayMs * 2 ** (this.consecutiveErrors - 1), this.maxDelayMs);
    const jitter = base * (JITTER_MIN + Math.random() * JITTER_RANGE);
    return new Promise((r) => setTimeout(r, jitter));
  }
}
