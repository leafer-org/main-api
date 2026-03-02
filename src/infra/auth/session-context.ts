import { Injectable } from '@nestjs/common';

export abstract class SessionContext {
  public abstract getRole(): string;
}

@Injectable()
export class StaticSessionContext implements SessionContext {
  public constructor(private readonly role: string) {}

  public getRole(): string {
    return this.role;
  }
}
