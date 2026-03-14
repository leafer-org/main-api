import { Controller, Get } from '@nestjs/common';

import { GetCitiesInteractor } from '../../application/use-cases/cities/get-cities.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicResponse } from '@/infra/contracts/types.js';

@Public()
@Controller('cities')
export class CitiesController {
  public constructor(private readonly getCities: GetCitiesInteractor) {}

  @Get()
  public async list(): Promise<PublicResponse['getCities']> {
    return this.getCities.execute();
  }
}
