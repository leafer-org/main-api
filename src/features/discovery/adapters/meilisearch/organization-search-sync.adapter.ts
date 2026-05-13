import { Inject, Injectable } from '@nestjs/common';

import { OrganizationSearchSyncPort } from '../../application/sync-ports.js';
import {
  DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
  DiscoveryOrganizationsSearchClient,
} from './discovery-organizations-search.index.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class MeiliOrganizationSearchSyncAdapter implements OrganizationSearchSyncPort {
  public constructor(
    @Inject(DiscoveryOrganizationsSearchClient)
    private readonly searchClient: InstanceType<typeof DiscoveryOrganizationsSearchClient>,
  ) {}

  public async upsert(input: { organizationId: OrganizationId; name: string }): Promise<void> {
    const doc = { organizationId: String(input.organizationId), name: input.name };
    await this.searchClient.addDocument(
      DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
      doc.organizationId,
      doc,
    );
  }

  public async delete(organizationId: OrganizationId): Promise<void> {
    await this.searchClient.deleteDoc(
      DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
      String(organizationId),
    );
  }
}
