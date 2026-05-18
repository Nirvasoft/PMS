/** Seed data for PropertyType and FacilityType tables */

export const PROPERTY_TYPES = [
  { code: 'residential',  name: 'Residential',  description: 'Apartments, condos, and residential buildings' },
  { code: 'commercial',   name: 'Commercial',   description: 'Office buildings and commercial spaces' },
  { code: 'retail',       name: 'Retail',       description: 'Shopping malls, retail parks, and shops' },
  { code: 'mixed_use',    name: 'Mixed-Use',    description: 'Combined residential and commercial' },
  { code: 'industrial',   name: 'Industrial',   description: 'Warehouses, factories, and industrial parks' },
  { code: 'hospitality',  name: 'Hospitality',  description: 'Hotels, serviced apartments, and resorts' },
  { code: 'warehouse',    name: 'Warehouse',    description: 'Storage and logistics facilities' },
];

export const FACILITY_TYPES = [
  // Recreation
  { code: 'swimming_pool',    name: 'Swimming Pool',    icon: 'waves',        category: 'recreation' },
  { code: 'gym',              name: 'Gymnasium',        icon: 'dumbbell',     category: 'recreation' },
  { code: 'bbq_area',         name: 'BBQ Area',         icon: 'flame',        category: 'recreation' },
  { code: 'playground',       name: 'Playground',       icon: 'playground',   category: 'recreation' },
  { code: 'rooftop_garden',   name: 'Rooftop Garden',   icon: 'leaf',         category: 'recreation' },
  { code: 'tennis_court',     name: 'Tennis Court',     icon: 'circle',       category: 'recreation' },
  { code: 'jogging_track',    name: 'Jogging Track',    icon: 'activity',     category: 'recreation' },
  // Convenience
  { code: 'concierge',        name: 'Concierge',        icon: 'user-check',   category: 'convenience' },
  { code: 'meeting_room',     name: 'Meeting Room',     icon: 'users',        category: 'convenience' },
  { code: 'coworking_space',  name: 'Co-working Space', icon: 'monitor',      category: 'convenience' },
  { code: 'mailroom',         name: 'Mailroom',         icon: 'mail',         category: 'convenience' },
  { code: 'laundry',          name: 'Laundry',          icon: 'wind',         category: 'convenience' },
  { code: 'restaurant',       name: 'Restaurant',       icon: 'utensils',     category: 'convenience' },
  { code: 'retail_shops',     name: 'Retail Shops',     icon: 'shopping-bag', category: 'convenience' },
  // Security
  { code: 'cctv',             name: 'CCTV Surveillance', icon: 'camera',      category: 'security' },
  { code: 'access_control',   name: 'Access Control',   icon: 'key',          category: 'security' },
  { code: 'guard_post',       name: '24/7 Guard Post',  icon: 'shield',       category: 'security' },
  // Utility
  { code: 'parking',          name: 'Parking',          icon: 'car',          category: 'utility' },
  { code: 'ev_charging',      name: 'EV Charging',      icon: 'zap',          category: 'utility' },
  { code: 'elevator',         name: 'Elevator / Lift',  icon: 'arrow-up',     category: 'utility' },
  { code: 'locker_room',      name: 'Locker Room',      icon: 'lock',         category: 'utility' },
  { code: 'backup_power',     name: 'Backup Power',     icon: 'battery',      category: 'utility' },
];
