import EventEmitter from '@stackpress/lib/EventEmitter';
import type { ProofDatabase, ProofRecord } from './database.js';
import type { Principal } from './security.js';

export type RenameAction = {
  action: 'record.rename';
  expectedVersion: number;
  forceFailure?: boolean;
  id: number;
  name: string;
};

type CapabilityEvents = {
  'tabular.capability': [
    Principal,
    RenameAction,
    (record: ProofRecord) => void
  ];
};

export class CapabilityError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function createCapability(database: ProofDatabase) {
  const events = new EventEmitter<CapabilityEvents>();

  events.on('tabular.capability', async (principal, action, reply) => {
    if (principal.databaseRole !== 'tabular_member') {
      throw new CapabilityError('Capability denied', 403);
    }
    if (action.action !== 'record.rename') {
      throw new CapabilityError('Action denied', 400);
    }
    const record = await database.engine.transaction(async (tx) => {
      const rows = await tx.query<ProofRecord>({
        query: `UPDATE tabular.proof_record
          SET name = ?, version = version + 1
          WHERE id = ? AND version = ?
          RETURNING id, name, version`,
        values: [action.name, action.id, action.expectedVersion]
      });
      if (!rows[0]) {
        throw new CapabilityError('Stale expected version', 409);
      }
      if (action.forceFailure) {
        throw new CapabilityError('Forced rollback', 422);
      }
      return rows[0];
    });
    reply(record);
  });

  return {
    events,
    async execute(principal: Principal, action: RenameAction) {
      let result: ProofRecord | undefined;
      await events.emit('tabular.capability', principal, action, (record) => {
        result = record;
      });
      if (!result) throw new CapabilityError('Capability produced no result', 500);
      return result;
    }
  };
}

export type Capability = ReturnType<typeof createCapability>;
