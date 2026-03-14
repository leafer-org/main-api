import { Inject, Injectable } from '@nestjs/common';

import { CityQueryPort } from '../../ports.js';

@Injectable()
export class GetCitiesInteractor {
  public constructor(
    @Inject(CityQueryPort) private readonly cityQuery: CityQueryPort,
  ) {}

  public async execute() {
    return this.cityQuery.findAll();
  }
}
