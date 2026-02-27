export abstract class Clock {
  public abstract now(): Date;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
