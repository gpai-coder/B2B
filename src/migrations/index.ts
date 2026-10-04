import * as migration_20261003_002619_initial_schema from './20261003_002619_initial_schema';
import * as migration_20261003_021401_media_objectkey from './20261003_021401_media_objectkey';
import * as migration_20261003_025041_product_images from './20261003_025041_product_images';
import * as migration_20261003_025344_catalog_product_fields from './20261003_025344_catalog_product_fields';
import * as migration_20261003_031641_american_standard_catalog_fields from './20261003_031641_american_standard_catalog_fields';
import * as migration_20261003_120000_catalog_search from './20261003_120000_catalog_search';
import * as migration_20261003_120001_fix_search_trigger from './20261003_120001_fix_search_trigger';
import * as migration_20261003_120002_variant_product_id_search_trigger from './20261003_120002_variant_product_id_search_trigger';
import * as migration_20261003_134743 from './20261003_134743';
import * as migration_20261003_145046 from './20261003_145046';
import * as migration_20261003_160555 from './20261003_160555';
import * as migration_20261003_200000_ship_to_addresses from './20261003_200000_ship_to_addresses';
import * as migration_20261003_220000_ship_to_default_index from './20261003_220000_ship_to_default_index';
import * as migration_20261004_120000_admin_pr_a from './20261004_120000_admin_pr_a';
import * as migration_20261005_order_events_fk_restrict from './20261005_order_events_fk_restrict';
import * as migration_20261004_150000_staff_quote_builder from './20261004_150000_staff_quote_builder';

export const migrations = [
  {
    up: migration_20261003_002619_initial_schema.up,
    down: migration_20261003_002619_initial_schema.down,
    name: '20261003_002619_initial_schema',
  },
  {
    up: migration_20261003_021401_media_objectkey.up,
    down: migration_20261003_021401_media_objectkey.down,
    name: '20261003_021401_media_objectkey',
  },
  {
    up: migration_20261003_025041_product_images.up,
    down: migration_20261003_025041_product_images.down,
    name: '20261003_025041_product_images',
  },
  {
    up: migration_20261003_025344_catalog_product_fields.up,
    down: migration_20261003_025344_catalog_product_fields.down,
    name: '20261003_025344_catalog_product_fields',
  },
  {
    up: migration_20261003_031641_american_standard_catalog_fields.up,
    down: migration_20261003_031641_american_standard_catalog_fields.down,
    name: '20261003_031641_american_standard_catalog_fields',
  },
  {
    up: migration_20261003_120000_catalog_search.up,
    down: migration_20261003_120000_catalog_search.down,
    name: '20261003_120000_catalog_search',
  },
  {
    up: migration_20261003_120001_fix_search_trigger.up,
    down: migration_20261003_120001_fix_search_trigger.down,
    name: '20261003_120001_fix_search_trigger',
  },
  {
    up: migration_20261003_120002_variant_product_id_search_trigger.up,
    down: migration_20261003_120002_variant_product_id_search_trigger.down,
    name: '20261003_120002_variant_product_id_search_trigger',
  },
  {
    up: migration_20261003_134743.up,
    down: migration_20261003_134743.down,
    name: '20261003_134743',
  },
  {
    up: migration_20261003_145046.up,
    down: migration_20261003_145046.down,
    name: '20261003_145046',
  },
  {
    up: migration_20261003_160555.up,
    down: migration_20261003_160555.down,
    name: '20261003_160555',
  },
  {
    up: migration_20261003_200000_ship_to_addresses.up,
    down: migration_20261003_200000_ship_to_addresses.down,
    name: '20261003_200000_ship_to_addresses',
  },
  {
    up: migration_20261003_220000_ship_to_default_index.up,
    down: migration_20261003_220000_ship_to_default_index.down,
    name: '20261003_220000_ship_to_default_index',
  },
  {
    up: migration_20261004_120000_admin_pr_a.up,
    down: migration_20261004_120000_admin_pr_a.down,
    name: '20261004_120000_admin_pr_a',
  },
  {
    up: migration_20261005_order_events_fk_restrict.up,
    down: migration_20261005_order_events_fk_restrict.down,
    name: '20261005_order_events_fk_restrict',
  },
  {
    up: migration_20261004_150000_staff_quote_builder.up,
    down: migration_20261004_150000_staff_quote_builder.down,
    name: '20261004_150000_staff_quote_builder',
  },
];
