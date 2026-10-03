import * as migration_20261003_002619_initial_schema from './20261003_002619_initial_schema';
import * as migration_20261003_021401_media_objectkey from './20261003_021401_media_objectkey';

export const migrations = [
  {
    up: migration_20261003_002619_initial_schema.up,
    down: migration_20261003_002619_initial_schema.down,
    name: '20261003_002619_initial_schema'
  },
  {
    up: migration_20261003_021401_media_objectkey.up,
    down: migration_20261003_021401_media_objectkey.down,
    name: '20261003_021401_media_objectkey'
  },
];
