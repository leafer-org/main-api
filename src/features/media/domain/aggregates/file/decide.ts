import type { FileCommand } from './commands.js';
import { FileAlreadyExistsError, FileAlreadyInUseError, FileNotFoundError } from './errors.js';
import type { FileEvent } from './events.js';
import type { FileState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function fileDecide(
  state: FileState | null,
  command: FileCommand,
): Either<FileAlreadyExistsError | FileNotFoundError | FileAlreadyInUseError, FileEvent> {
  switch (command.type) {
    case 'UploadFile': {
      if (state) return Left(new FileAlreadyExistsError());
      return Right({
        type: 'file.uploaded',
        id: command.id,
        name: command.name,
        bucket: command.bucket,
        mimeType: command.mimeType,
        createdAt: command.now,
      });
    }

    case 'UseFile': {
      if (!state) return Left(new FileNotFoundError());
      if (!state.isTemporary) return Left(new FileAlreadyInUseError());
      return Right({
        type: 'file.used',
        usedAt: command.now,
      });
    }

    case 'FreeFile': {
      if (!state) return Left(new FileNotFoundError());
      return Right({
        type: 'file.freed',
      });
    }

    default:
      assertNever(command);
  }
}
