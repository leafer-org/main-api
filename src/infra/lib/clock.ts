export abstract class Clock {
  public abstract now(): Date;
}

export class SystemClock extends Clock {
  public now(): Date {
    return new Date();
  }
}
