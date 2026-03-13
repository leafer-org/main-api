import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardAutomationId, BoardId } from '@/kernel/domain/ids.js';

export type BoardAutomationEntity = EntityState<{
  id: BoardAutomationId;
  enabled: boolean;
  agentId: string;
  systemPrompt: string;
  onUncertain: {
    moveToBoardId: BoardId | null;
  };
}>;

export const BoardAutomationEntity = {
  create(
    id: BoardAutomationId,
    agentId: string,
    systemPrompt: string,
    onUncertainMoveToBoardId: BoardId | null,
  ): BoardAutomationEntity {
    return {
      id,
      enabled: true,
      agentId,
      systemPrompt,
      onUncertain: { moveToBoardId: onUncertainMoveToBoardId },
    };
  },

  enable(state: BoardAutomationEntity): BoardAutomationEntity {
    return { ...state, enabled: true };
  },

  disable(state: BoardAutomationEntity): BoardAutomationEntity {
    return { ...state, enabled: false };
  },

  isEnabled(state: BoardAutomationEntity): boolean {
    return state.enabled;
  },

  findEnabled(automations: BoardAutomationEntity[]): BoardAutomationEntity[] {
    return automations.filter((a) => a.enabled);
  },
};
