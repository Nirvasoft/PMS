// Module 2.2 seed data — Unit Types
export const UNIT_TYPES = [
  // Residential
  { code: 'studio',      name: 'Studio',         category: 'residential', description: 'Open-plan studio apartment' },
  { code: '1br',         name: '1 Bedroom',      category: 'residential', description: 'One-bedroom apartment' },
  { code: '2br',         name: '2 Bedroom',      category: 'residential', description: 'Two-bedroom apartment' },
  { code: '3br',         name: '3 Bedroom',      category: 'residential', description: 'Three-bedroom apartment' },
  { code: '4br',         name: '4 Bedroom',      category: 'residential', description: 'Four-bedroom apartment' },
  { code: 'penthouse',   name: 'Penthouse',      category: 'residential', description: 'Penthouse / luxury top-floor unit' },
  { code: 'duplex',      name: 'Duplex',         category: 'residential', description: 'Two-level apartment' },
  { code: 'townhouse',   name: 'Townhouse',      category: 'residential', description: 'Multi-floor townhouse unit' },
  // Commercial
  { code: 'office_s',    name: 'Small Office',   category: 'commercial',  description: 'Office < 100 sqm' },
  { code: 'office_m',    name: 'Medium Office',  category: 'commercial',  description: 'Office 100–300 sqm' },
  { code: 'office_l',    name: 'Large Office',   category: 'commercial',  description: 'Office > 300 sqm' },
  { code: 'retail',      name: 'Retail',         category: 'commercial',  description: 'Retail/shopfront unit' },
  { code: 'f_and_b',     name: 'F&B',            category: 'commercial',  description: 'Food & beverage outlet' },
  { code: 'showroom',    name: 'Showroom',       category: 'commercial',  description: 'Vehicle or product showroom' },
  // Storage
  { code: 'storage',     name: 'Storage',        category: 'storage',     description: 'Storage locker or room' },
  { code: 'warehouse',   name: 'Warehouse',      category: 'storage',     description: 'Warehouse / industrial bay' },
  // Parking
  { code: 'car_park',    name: 'Car Park',       category: 'parking',     description: 'Car parking bay' },
  { code: 'bike_park',   name: 'Bike Park',      category: 'parking',     description: 'Motorcycle/bicycle bay' },
  { code: 'ev_bay',      name: 'EV Bay',         category: 'parking',     description: 'EV-equipped parking bay' },
];

// Auto-convert area between sqft and sqm
export const SQM_TO_SQFT = 10.7639;

// Valid unit status transitions
export const UNIT_STATUS_TRANSITIONS: Record<string, string[]> = {
  available:    ['reserved', 'maintenance', 'not_for_rent'],
  reserved:     ['available', 'occupied'],
  occupied:     ['available', 'maintenance'],
  maintenance:  ['available', 'not_for_rent'],
  not_for_rent: ['available', 'maintenance'],
};

// Valid unit number chars
export const UNIT_NUMBER_REGEX = /^[a-zA-Z0-9\-\/]+$/;
export const UNIT_NUMBER_MAX_LENGTH = 50;
