# Module 2.2 — Tower, Block & Unit Management

**Phase:** 2 — Property Structure & Leasing  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 2.1 (Property Management)

---

## Overview

Defines the physical structure beneath a property: Towers → Floors → Units. Each unit has a rich profile (type, area, floor plan, ownership, occupancy status) and is the atomic entity that gets leased, billed, and maintained. Supports bulk unit generation for large buildings.

**Key capabilities:**
- Tower/Block CRUD with section grouping (e.g. Wings A/B/C)
- Bulk unit generation (e.g. "create 10 floors × 8 units per floor")
- Unit type catalog (Studio, 1BR, 2BR, Office, Retail, Storage, Parking)
- Unit status lifecycle with history
- Floor plan document attachment
- Ownership tracking (Freehold/Leasehold/Strata)
- Utility meter assignment (Water, Electricity, Gas)
- Unit availability calendar view

---

## DB Schema

```sql
-- Towers / Blocks
CREATE TABLE towers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         VARCHAR(150) NOT NULL,
  code         VARCHAR(50),
  description  TEXT,
  total_floors SMALLINT,
  year_built   SMALLINT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tower_code_property UNIQUE (code, property_id)
);

CREATE INDEX idx_towers_property ON towers(property_id);

-- Sections/Wings within a tower (optional grouping)
CREATE TABLE tower_sections (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tower_id   UUID NOT NULL REFERENCES towers(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,          -- 'Wing A', 'East Block', etc.
  code       VARCHAR(20),
  sort_order SMALLINT DEFAULT 0
);

-- Unit types (seeded reference data)
CREATE TABLE unit_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(30) NOT NULL,           -- 'residential' | 'commercial' | 'storage' | 'parking'
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
-- Seeds: studio, 1br, 2br, 3br, penthouse, office_small, office_medium, office_large,
--        retail, f_and_b, storage, car_park, bike_park

-- Units
CREATE TABLE units (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tower_id          UUID REFERENCES towers(id) ON DELETE SET NULL,
  section_id        UUID REFERENCES tower_sections(id) ON DELETE SET NULL,
  company_id        UUID NOT NULL REFERENCES companies(id),
  unit_number       VARCHAR(50) NOT NULL,
  unit_type_id      UUID REFERENCES unit_types(id),
  unit_type         VARCHAR(50) NOT NULL,           -- denormalized for query convenience
  floor_number      SMALLINT,
  floor_label       VARCHAR(20),                    -- 'G', 'M', 'B1', etc.
  area_sqft         NUMERIC(10,2),
  area_sqm          NUMERIC(10,2),
  bedroom_count     SMALLINT DEFAULT 0,
  bathroom_count    SMALLINT DEFAULT 0,
  direction         VARCHAR(20),                    -- 'north' | 'south' | 'east' | 'west' | 'corner'
  floor_plan_url    VARCHAR(500),                   -- S3 link to floor plan PDF/image
  status            VARCHAR(30) NOT NULL DEFAULT 'available',
                    -- 'available' | 'occupied' | 'reserved' | 'maintenance' | 'not_for_rent'
  ownership_type    VARCHAR(30) DEFAULT 'leasehold', -- 'freehold' | 'leasehold' | 'strata'
  owner_name        VARCHAR(255),
  owner_contact     VARCHAR(255),
  purchase_date     DATE,
  purchase_price    NUMERIC(15,2),
  current_market_value NUMERIC(15,2),
  furnishing        VARCHAR(20) DEFAULT 'unfurnished',
                    -- 'unfurnished' | 'partially_furnished' | 'fully_furnished'
  description       TEXT,
  notes             TEXT,                           -- internal notes
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_unit_number_property UNIQUE (unit_number, property_id)
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_tower ON units(tower_id);
CREATE INDEX idx_units_status ON units(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_type ON units(unit_type);

-- Unit status history
CREATE TABLE unit_status_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  from_status  VARCHAR(30),
  to_status    VARCHAR(30) NOT NULL,
  reason       TEXT,
  changed_by   UUID NOT NULL REFERENCES users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unit_status_history ON unit_status_history(unit_id, changed_at DESC);

-- Utility meters assigned to units
CREATE TABLE utility_meters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  meter_type      VARCHAR(20) NOT NULL,         -- 'electricity' | 'water' | 'gas' | 'chilled_water'
  meter_serial_no VARCHAR(100) NOT NULL,
  meter_provider  VARCHAR(100),
  location        VARCHAR(255),
  last_reading    NUMERIC(12,3),
  last_reading_date DATE,
  is_smart_meter  BOOLEAN NOT NULL DEFAULT FALSE,
  smart_meter_id  VARCHAR(100),                 -- reference to IoT device ID
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meter_serial_property UNIQUE (meter_serial_no, property_id)
);

CREATE INDEX idx_meters_unit ON utility_meters(unit_id);
CREATE INDEX idx_meters_property ON utility_meters(property_id);

-- Unit amenities (additional features per unit — different from property facilities)
CREATE TABLE unit_amenities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amenity     VARCHAR(100) NOT NULL,            -- 'balcony' | 'bathtub' | 'built_in_wardrobe' | ...
  notes       VARCHAR(255)
);
```

### TypeORM Entities

```typescript
// src/modules/units/entities/unit.entity.ts
@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'property_id' }) propertyId: string;
  @Column({ name: 'tower_id', nullable: true }) towerId: string | null;
  @Column({ name: 'section_id', nullable: true }) sectionId: string | null;
  @Column({ name: 'company_id' }) companyId: string;
  @Column({ name: 'unit_number', length: 50 }) unitNumber: string;
  @Column({ name: 'unit_type_id', nullable: true }) unitTypeId: string | null;
  @Column({ name: 'unit_type', length: 50 }) unitType: string;
  @Column({ name: 'floor_number', nullable: true }) floorNumber: number | null;
  @Column({ name: 'floor_label', nullable: true, length: 20 }) floorLabel: string | null;
  @Column({ name: 'area_sqft', type: 'numeric', precision: 10, scale: 2, nullable: true }) areaSqft: number | null;
  @Column({ name: 'area_sqm', type: 'numeric', precision: 10, scale: 2, nullable: true }) areaSqm: number | null;
  @Column({ name: 'bedroom_count', default: 0 }) bedroomCount: number;
  @Column({ name: 'bathroom_count', default: 0 }) bathroomCount: number;
  @Column({ nullable: true, length: 20 }) direction: string | null;
  @Column({ name: 'floor_plan_url', nullable: true }) floorPlanUrl: string | null;
  @Column({ length: 30, default: 'available' }) status: string;
  @Column({ name: 'ownership_type', length: 30, default: 'leasehold' }) ownershipType: string;
  @Column({ name: 'owner_name', nullable: true }) ownerName: string | null;
  @Column({ length: 20, default: 'unfurnished' }) furnishing: string;
  @Column({ nullable: true, type: 'text' }) description: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt: Date | null;

  @ManyToOne(() => Property) @JoinColumn({ name: 'property_id' }) property: Property;
  @ManyToOne(() => Tower, { nullable: true }) @JoinColumn({ name: 'tower_id' }) tower: Tower;
  @OneToMany(() => UtilityMeter, (m) => m.unit) meters: UtilityMeter[];
  @OneToMany(() => UnitAmenity, (a) => a.unit) amenities: UnitAmenity[];
}
```

---

## Server-Side Architecture

```
src/modules/units/
├── units.module.ts
├── towers.controller.ts
├── towers.service.ts
├── units.controller.ts
├── units.service.ts
├── meters.controller.ts
├── meters.service.ts
├── dto/
│   ├── create-tower.dto.ts
│   ├── update-tower.dto.ts
│   ├── create-unit.dto.ts
│   ├── update-unit.dto.ts
│   ├── bulk-create-units.dto.ts
│   ├── update-unit-status.dto.ts
│   ├── create-meter.dto.ts
│   └── unit-query.dto.ts
├── entities/
│   ├── tower.entity.ts
│   ├── tower-section.entity.ts
│   ├── unit-type.entity.ts
│   ├── unit.entity.ts
│   ├── unit-status-history.entity.ts
│   ├── utility-meter.entity.ts
│   └── unit-amenity.entity.ts
└── seeds/
    └── unit-types.seed.ts
```

### Services

```typescript
// src/modules/units/units.service.ts
@Injectable()
export class UnitsService {
  async bulkCreate(dto: BulkCreateUnitsDto, propertyId: string, companyId: string): Promise<BulkCreateResult> {
    /**
     * Generates units for multiple floors.
     * dto.floors: array of floor configs OR
     * dto.floorRange: { from: 1, to: 20, unitsPerFloor: 8, unitTypeId, prefix: '0' }
     */
    const units: Partial<Unit>[] = [];

    if (dto.floorRange) {
      const { from, to, unitsPerFloor, unitTypeId, prefix, areaSqft } = dto.floorRange;
      const unitType = await this.unitTypeRepo.findOneOrFail({ where: { id: unitTypeId } });

      for (let floor = from; floor <= to; floor++) {
        for (let u = 1; u <= unitsPerFloor; u++) {
          const unitNum = u.toString().padStart(2, '0');
          units.push({
            propertyId,
            companyId,
            towerId: dto.towerId,
            unitNumber: `${floor}${prefix ?? ''}${unitNum}`,  // e.g. "0101"
            unitType: unitType.code,
            unitTypeId,
            floorNumber: floor,
            areaSqft,
            status: 'available',
          });
        }
      }
    }

    // Detect duplicates within batch and against DB
    const existing = await this.unitRepo.find({
      where: { propertyId, unitNumber: In(units.map(u => u.unitNumber!)) },
      select: ['unitNumber'],
    });
    const existingNums = new Set(existing.map(e => e.unitNumber));
    const conflicts = units.filter(u => existingNums.has(u.unitNumber!));

    if (conflicts.length > 0) {
      throw new ConflictException({
        code: 'UNIT_NUMBER_CONFLICT',
        message: `${conflicts.length} unit number(s) already exist`,
        conflicts: conflicts.map(c => c.unitNumber),
      });
    }

    const saved = await this.unitRepo.save(units);
    // Update property totalUnits counter
    await this.propertyRepo.increment({ id: propertyId }, 'totalUnits', saved.length);

    return { created: saved.length, units: saved.map(u => ({ id: u.id, unitNumber: u.unitNumber })) };
  }

  async updateStatus(unitId: string, dto: UpdateUnitStatusDto, changedBy: string): Promise<Unit> {
    const unit = await this.unitRepo.findOneOrFail({ where: { id: unitId } });
    this.validateStatusTransition(unit.status, dto.status);

    await this.statusHistoryRepo.save({
      unitId, fromStatus: unit.status, toStatus: dto.status, reason: dto.reason, changedBy,
    });
    await this.unitRepo.update(unitId, { status: dto.status });

    // Invalidate property stats cache
    await this.redis.del(`pms:property:stats:${unit.propertyId}`);

    return this.unitRepo.findOneOrFail({ where: { id: unitId } });
  }

  async getFloorPlan(propertyId: string, towerId?: string): Promise<FloorPlanMatrix> {
    /**
     * Returns a 2D matrix for the floor plan visualiser:
     * { floors: [{ floorNumber, floorLabel, units: [{ id, unitNumber, type, status }] }] }
     */
    const qb = this.unitRepo.createQueryBuilder('u')
      .where('u.property_id = :propertyId', { propertyId })
      .andWhere('u.deleted_at IS NULL')
      .orderBy('u.floor_number', 'DESC')
      .addOrderBy('u.unit_number', 'ASC');

    if (towerId) qb.andWhere('u.tower_id = :towerId', { towerId });

    const units = await qb.getMany();

    const floorMap = new Map<number, Unit[]>();
    for (const unit of units) {
      const floor = unit.floorNumber ?? 0;
      if (!floorMap.has(floor)) floorMap.set(floor, []);
      floorMap.get(floor)!.push(unit);
    }

    return {
      floors: Array.from(floorMap.entries()).map(([floorNumber, floorUnits]) => ({
        floorNumber,
        floorLabel: floorUnits[0]?.floorLabel ?? String(floorNumber),
        units: floorUnits.map(u => ({
          id: u.id,
          unitNumber: u.unitNumber,
          unitType: u.unitType,
          areaSqft: u.areaSqft,
          status: u.status,
          furnishing: u.furnishing,
        })),
      })),
    };
  }

  private validateStatusTransition(from: string, to: string): void {
    const allowed: Record<string, string[]> = {
      available: ['reserved', 'maintenance', 'not_for_rent'],
      reserved: ['available', 'occupied'],
      occupied: ['available', 'maintenance'],  // 'available' after move-out
      maintenance: ['available', 'not_for_rent'],
      not_for_rent: ['available', 'maintenance'],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Cannot transition unit from '${from}' to '${to}'`);
    }
  }
}
```

---

## API Contract

### Towers

### `GET /properties/:propertyId/towers`
**Access:** `properties.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Tower A",
      "code": "TWR-A",
      "totalFloors": 30,
      "isActive": true,
      "sortOrder": 1,
      "sections": [
        { "id": "uuid", "name": "Wing A", "code": "WA" }
      ],
      "unitStats": { "total": 240, "available": 30, "occupied": 200, "maintenance": 10 }
    }
  ]
}
```

### `POST /properties/:propertyId/towers`
**Access:** `properties.update`

```json
{
  "name": "Tower A",
  "code": "TWR-A",
  "totalFloors": 30,
  "yearBuilt": 2018,
  "sections": [
    { "name": "Wing A", "code": "WA" },
    { "name": "Wing B", "code": "WB" }
  ]
}
```

### `PUT /properties/:propertyId/towers/:towerId`
### `DELETE /properties/:propertyId/towers/:towerId`
Blocked if tower has units.

---

### Units

### `GET /properties/:propertyId/units`
**Access:** `properties.read`  
**Query:** `?towerId=&status=available&unitType=2br&floor=&search=&page=1&limit=50`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "unitNumber": "0101",
      "unitType": "1br",
      "floorNumber": 1,
      "floorLabel": "1",
      "areaSqft": 750,
      "areaSqm": 69.7,
      "bedroomCount": 1,
      "bathroomCount": 1,
      "status": "available",
      "furnishing": "unfurnished",
      "direction": "north",
      "tower": { "id": "uuid", "name": "Tower A" },
      "currentLease": null,
      "meters": [
        { "meterType": "electricity", "serialNo": "E-123456" },
        { "meterType": "water", "serialNo": "W-654321" }
      ]
    }
  ],
  "meta": { "total": 240, "page": 1, "limit": 50, "totalPages": 5 }
}
```

### `POST /properties/:propertyId/units`
**Access:** `properties.update`

```json
{
  "unitNumber": "0101",
  "unitTypeId": "uuid",
  "towerId": "uuid",
  "sectionId": "uuid",
  "floorNumber": 1,
  "floorLabel": "1",
  "areaSqft": 750,
  "bedroomCount": 1,
  "bathroomCount": 1,
  "direction": "north",
  "furnishing": "unfurnished",
  "ownershipType": "leasehold",
  "amenities": ["balcony", "built_in_wardrobe"]
}
```

### `POST /properties/:propertyId/units/bulk`
**Access:** `properties.update`

```json
{
  "towerId": "uuid",
  "floorRange": {
    "from": 1,
    "to": 20,
    "unitsPerFloor": 8,
    "unitTypeId": "uuid",
    "areaSqft": 750,
    "prefix": ""
  }
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "created": 160,
    "units": [
      { "id": "uuid", "unitNumber": "0101" },
      { "id": "uuid", "unitNumber": "0102" }
    ]
  }
}
```

### `GET /properties/:propertyId/units/:unitId`
**Access:** `properties.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "unitNumber": "0101",
    "unitType": "1br",
    "floorNumber": 1,
    "areaSqft": 750,
    "areaSqm": 69.7,
    "bedroomCount": 1,
    "bathroomCount": 1,
    "direction": "north",
    "furnishing": "unfurnished",
    "floorPlanUrl": "https://cdn.pms.com/...",
    "status": "available",
    "ownershipType": "leasehold",
    "ownerName": null,
    "tower": { "id": "uuid", "name": "Tower A" },
    "amenities": ["balcony", "built_in_wardrobe"],
    "meters": [
      { "id": "uuid", "meterType": "electricity", "serialNo": "E-123456", "lastReading": 1250.5, "lastReadingDate": "2025-01-01" },
      { "id": "uuid", "meterType": "water", "serialNo": "W-654321", "lastReading": 342.1, "lastReadingDate": "2025-01-01" }
    ],
    "currentLease": null,
    "statusHistory": [
      { "fromStatus": null, "toStatus": "available", "changedAt": "2024-01-01T00:00:00Z" }
    ]
  }
}
```

### `PUT /properties/:propertyId/units/:unitId`
**Access:** `properties.update`

### `DELETE /properties/:propertyId/units/:unitId`
**Access:** `properties.delete`  
Blocked if unit has active lease.

### `POST /properties/:propertyId/units/:unitId/status`
**Access:** `properties.update`

```json
{
  "status": "maintenance",
  "reason": "Bathroom renovation until 2025-02-15"
}
```

### `GET /properties/:propertyId/units/:unitId/status-history`
**Access:** `properties.read`

### `GET /properties/:propertyId/floor-plan`
**Access:** `properties.read`  
**Query:** `?towerId=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "floors": [
      {
        "floorNumber": 20,
        "floorLabel": "20",
        "units": [
          { "id": "uuid", "unitNumber": "2001", "unitType": "2br", "areaSqft": 950, "status": "occupied" },
          { "id": "uuid", "unitNumber": "2002", "unitType": "1br", "areaSqft": 750, "status": "available" }
        ]
      }
    ]
  }
}
```

### `POST /properties/:propertyId/units/:unitId/floor-plan`
**Access:** `properties.update`  
**Content-Type:** `multipart/form-data`  
**Body:** `floorPlan` (PDF/PNG/JPEG, max 10MB)

---

### Meters

### `GET /properties/:propertyId/units/:unitId/meters`
**Access:** `properties.read`

### `POST /properties/:propertyId/units/:unitId/meters`
**Access:** `properties.update`

```json
{
  "meterType": "electricity",
  "meterSerialNo": "E-123456",
  "meterProvider": "Singapore Power",
  "location": "DB Box at main door",
  "isSmartMeter": false,
  "installedAt": "2024-01-01"
}
```

### `PUT /properties/:propertyId/units/:unitId/meters/:meterId`
### `DELETE /properties/:propertyId/units/:unitId/meters/:meterId`

### `GET /unit-types`
**Access:** Authenticated

---

## Business Logic & Validation Rules

```
Unit number uniqueness:
- Unique per property (not just per tower)
- Case-insensitive
- Allowed characters: alphanumeric + hyphen + slash (e.g. "A-01", "B1/01")

Bulk creation naming:
- floorRange mode: unitNumber = "{floor}{prefix}{unit_padded}"
  e.g. floor=15, unit=3, prefix="" → "1503"
  e.g. floor=15, unit=3, prefix="-" → "15-03"
- Validates all generated unit numbers are unique within property before any inserts
- Uses DB transaction: all-or-nothing

Status transition rules:
  available    → reserved (when booking/lease reservation created)
  available    → maintenance (admin manual)
  available    → not_for_rent (admin manual)
  reserved     → occupied (when lease activated)
  reserved     → available (reservation expired/cancelled)
  occupied     → available (after lease end + move-out completed)
  occupied     → maintenance (emergency maintenance)
  maintenance  → available (maintenance completed)
  maintenance  → not_for_rent (admin manual)
  not_for_rent → available (admin manual)
  not_for_rent → maintenance (admin manual)

Area conversion:
  If areaSqft provided and areaSqm not: areaSqm = areaSqft / 10.7639
  If areaSqm provided and areaSqft not: areaSqft = areaSqm * 10.7639
  Both auto-populated on save

Meter serial uniqueness:
  Unique per property (a meter can only be assigned to one unit per property)
  One meter per type per unit (enforced: cannot add second electricity meter to same unit)

Floor plan upload:
  - PDF/PNG/JPEG accepted
  - Max 10MB
  - Stored at: {companyId}/properties/{propertyId}/units/{unitId}/floor-plan.{ext}
  - Previous floor plan URL overwritten (old file retained in S3 for 30 days)
```

---

## UI Screens & Component Breakdown

```
properties/[id]/units/
├── UnitsTab/
│   ├── UnitsTab.tsx                        # view toggle: FloorPlanView | ListView
│   └── components/
│       ├── ViewToggle.tsx                  # Floor Plan / List / Grid buttons
│       ├── UnitFilters.tsx                 # status chips, type dropdown, floor range, search
│       ├── UnitStats.tsx                   # Available N | Occupied N | Maintenance N
│       │
│       ├── FloorPlanView/
│       │   ├── FloorPlanView.tsx           # vertical stack of floor rows
│       │   ├── FloorRow.tsx               # floor label + unit cells in a row
│       │   ├── UnitCell.tsx               # colored square: status color, hover tooltip
│       │   │   └── UnitTooltip.tsx        # unit number, type, area, status, tenant name
│       │   └── FloorPlanLegend.tsx        # color legend for statuses
│       │
│       ├── UnitListView/
│       │   ├── UnitTable.tsx
│       │   └── UnitTableRow.tsx           # unit number + type + floor + area + status + actions
│       │
│       └── UnitCard.tsx                   # grid card variant

├── UnitDetailDrawer/
│   ├── UnitDetailDrawer.tsx               # slide-in from right
│   └── tabs/
│       ├── UnitInfoTab.tsx                # all profile fields + edit form
│       ├── MetersTab.tsx                  # meter list + add meter form
│       ├── FloorPlanTab.tsx               # PDF/image viewer + upload button
│       ├── LeaseHistoryTab.tsx            # past + current leases (from Module 2.4)
│       └── StatusHistoryTab.tsx           # timeline of status changes

├── BulkCreateUnitsModal/
│   ├── BulkCreateUnitsModal.tsx
│   └── components/
│       ├── FloorRangeForm.tsx             # from/to floors, units/floor, type, area, prefix
│       ├── UnitPreviewTable.tsx           # preview generated unit numbers (first 20)
│       └── ConflictWarning.tsx            # shows conflicting unit numbers before submit

└── TowerManagementPage/
    └── components/
        ├── TowerList.tsx
        ├── TowerCard.tsx                  # name + floors + unit count + expand
        ├── TowerFormModal.tsx
        └── SectionList.tsx
```

### Key UI Behaviors

```
FloorPlanView unit cell colors:
  available    → green (#4CAF50)
  occupied     → blue (#2196F3)
  reserved     → amber (#FF9800)
  maintenance  → red (#F44336)
  not_for_rent → gray (#9E9E9E)

UnitCell click:
  → opens UnitDetailDrawer for that unit
  → highlights selected cell with border

FloorPlanView interactions:
  - Scroll vertically through floors
  - "Top Floor" / "Ground Floor" jump buttons
  - Filter chips (status) highlight/dim matching cells in real-time
  - "Zoom" slider scales cell size (compact / normal / large)

BulkCreate preview:
  - As user types floorRange inputs, UnitPreviewTable updates in real-time
  - Shows first 20 units with "... and N more" truncation
  - Conflict check runs on blur of each input field (debounced API call)
  - Preview becomes red for conflicting unit numbers

StatusChangeModal:
  - Shows current status → target status with arrow
  - Reason field: required for some transitions, optional for others
  - For 'maintenance': optional estimated completion date
```

---

## State Management

```typescript
// src/store/api/unitsApi.ts
export const unitsApi = createApi({
  reducerPath: 'unitsApi',
  tagTypes: ['Units', 'Towers', 'Meters', 'FloorPlan'],
  endpoints: (builder) => ({
    getTowers: builder.query<Tower[], string>({
      query: (propertyId) => `/properties/${propertyId}/towers`,
      providesTags: ['Towers'],
    }),
    createTower: builder.mutation<Tower, { propertyId: string; data: CreateTowerDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/towers`, method: 'POST', body: data }),
      invalidatesTags: ['Towers'],
    }),
    getUnits: builder.query<PaginatedResponse<UnitListItem>, UnitQueryParams>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/units`, params }),
      providesTags: ['Units'],
    }),
    getUnit: builder.query<UnitDetail, { propertyId: string; unitId: string }>({
      query: ({ propertyId, unitId }) => `/properties/${propertyId}/units/${unitId}`,
      providesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }],
    }),
    createUnit: builder.mutation<Unit, { propertyId: string; data: CreateUnitDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/units`, method: 'POST', body: data }),
      invalidatesTags: ['Units', 'FloorPlan'],
    }),
    bulkCreateUnits: builder.mutation<BulkCreateResult, { propertyId: string; data: BulkCreateUnitsDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/units/bulk`, method: 'POST', body: data }),
      invalidatesTags: ['Units', 'FloorPlan'],
    }),
    updateUnit: builder.mutation<Unit, { propertyId: string; unitId: string; data: UpdateUnitDto }>({
      query: ({ propertyId, unitId, data }) => ({ url: `/properties/${propertyId}/units/${unitId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }, 'FloorPlan'],
    }),
    updateUnitStatus: builder.mutation<Unit, { propertyId: string; unitId: string; data: UpdateUnitStatusDto }>({
      query: ({ propertyId, unitId, data }) => ({ url: `/properties/${propertyId}/units/${unitId}/status`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }, 'Units', 'FloorPlan'],
    }),
    getFloorPlan: builder.query<FloorPlanMatrix, { propertyId: string; towerId?: string }>({
      query: ({ propertyId, towerId }) => ({ url: `/properties/${propertyId}/floor-plan`, params: { towerId } }),
      providesTags: (_, __, { propertyId }) => [{ type: 'FloorPlan', id: propertyId }],
    }),
    getUnitTypes: builder.query<UnitType[], void>({
      query: () => '/unit-types',
    }),
    addMeter: builder.mutation<UtilityMeter, { propertyId: string; unitId: string; data: CreateMeterDto }>({
      query: ({ propertyId, unitId, data }) => ({ url: `/properties/${propertyId}/units/${unitId}/meters`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Meters', id: unitId }],
    }),
  }),
});

// src/store/slices/unitsSlice.ts
interface UnitsState {
  selectedUnitId: string | null;
  drawerOpen: boolean;
  viewMode: 'floor_plan' | 'list' | 'grid';
  floorFilter: number | null;
  statusFilter: string[];
  unitTypeFilter: string | null;
}

export const unitsSlice = createSlice({
  name: 'units',
  initialState: {
    selectedUnitId: null, drawerOpen: false,
    viewMode: 'floor_plan', floorFilter: null, statusFilter: [], unitTypeFilter: null,
  } as UnitsState,
  reducers: {
    selectUnit: (state, action: PayloadAction<string | null>) => {
      state.selectedUnitId = action.payload;
      state.drawerOpen = action.payload !== null;
    },
    setViewMode: (state, action: PayloadAction<UnitsState['viewMode']>) => { state.viewMode = action.payload; },
    setStatusFilter: (state, action: PayloadAction<string[]>) => { state.statusFilter = action.payload; },
    clearFilters: (state) => { state.floorFilter = null; state.statusFilter = []; state.unitTypeFilter = null; },
  },
});
```
