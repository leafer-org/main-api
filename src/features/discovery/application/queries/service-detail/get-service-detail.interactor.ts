import { Inject, Injectable } from '@nestjs/common';

import type { ServiceId } from '@/kernel/domain/ids.js';
import { Left, Right } from '@/infra/lib/box.js';
import { ServiceNotFoundError } from '../../../domain/errors.js';
import { ServiceDetailQueryPort } from '../../ports.js';

@Injectable()
export class GetServiceDetailInteractor {
  public constructor(
    @Inject(ServiceDetailQueryPort) private readonly detailQuery: ServiceDetailQueryPort,
  ) {}

  public async execute(command: { serviceId: ServiceId }) {
    const readModel = await this.detailQuery.findByServiceId(command.serviceId);

    if (!readModel) return Left(new ServiceNotFoundError());

    return Right(readModel);
  }
}
