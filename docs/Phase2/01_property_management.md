# Module 2.1 — Property Management

**Phase:** 2 — Property Structure & Leasing  
**Stack:** Express · Prisma · PostgreSQL · PostGIS · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 1.1, 1.2, 1.3, 1.6 (Document Management)

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)

---

## Overview

Full property profile management — the root entity for all leasing, billing, maintenance, and tenant data. Supports multiple property types (residential, commercial, retail, mixed-use, industrial), multi-building structure, facility/amenity catalogs, geo-location with Google Maps integration, and property-level status lifecycle.

**Key capabilities:**
- Property CRUD with rich profile (type, legal info, geo-location, photos)
- Facilities & amenities catalog linked to properties
- Property status lifecycle (Active → Under Renovation → Decommissioned)
- Property documents linked to Document Management module
- Google Maps embed + geo-fence definition
- Property-level settings overrides (billing cycle, currency, timezone)
- Property summary statistics (unit count, occupancy, revenue — aggregated from child modules)

---

## DB Schema

```sql
-- Enable PostGIS for geo queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Property types (seeded reference data)
CREATE TABLE property_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
-- Seeds: residential, commercial, retail, mixed_use, industrial, hospitality, warehouse

-- Properties (extends stub from Module 1.3)
-- Full column set:
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type_id UUID REFERENCES property_types(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS registration_no VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built SMALLINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_floors SMALLINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_units SMALLINT DEFAULT 0;  -- denormalized counter
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_area_sqm NUMERIC(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_area_sqft NUMERIC(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geo_point GEOMETRY(Point, 4326);  -- PostGIS
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geo_fence GEOMETRY(Polygon, 4326); -- geo-fence polygon
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS billing_day SMALLINT DEFAULT 1;   -- day of month
ALTER TABLE properties ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS timezone VARCHAR(60) DEFAULT 'UTC';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

CREATE INDEX idx_properties_geo ON properties USING GIST(geo_point);
CREATE INDEX idx_properties_status ON properties(status) WHERE deleted_at IS NULL;

-- Property photos (separate from cover image)
CREATE TABLE property_photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  storage_key  VARCHAR(1000) NOT NULL,
  url          VARCHAR(500) NOT NULL,
  caption      VARCHAR(255),
  is_cover     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   SMALLINT DEFAULT 0,
  uploaded_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_photos_property ON property_photos(property_id);

-- Facility catalog (system-wide facilities that can be assigned to properties)
CREATE TABLE facility_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(50),               -- icon key for frontend
  category    VARCHAR(50) NOT NULL,      -- 'recreation' | 'convenience' | 'security' | 'utility'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
-- Seeds: swimming_pool, gym, parking, concierge, meeting_room, bbq_area, playground,
--        rooftop_garden, locker_room, ev_charging, cctv, access_control, elevator,
--        laundry, mailroom, coworking_space, restaurant, retail_shops

-- Property ↔ Facility junction
CREATE TABLE property_facilities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  facility_type_id UUID NOT NULL REFERENCES facility_types(id),
  name            VARCHAR(150),                -- override display name
  description     TEXT,
  floor           VARCHAR(20),
  capacity        SMALLINT,
  operating_hours JSONB,                       -- { mon: '06:00-22:00', tue: ... }
  is_bookable     BOOLEAN NOT NULL DEFAULT FALSE,
  booking_advance_days SMALLINT DEFAULT 7,     -- how far ahead bookings are allowed
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_property_facility UNIQUE (property_id, facility_type_id)
);

-- Property status history
CREATE TABLE property_status_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL,
  reason      TEXT,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property documents (links to document_management module)
-- Uses documents.entity_type = 'property', documents.entity_id = property.id
-- No extra table needed; query via documents table.

-- Property contacts (key contacts: building manager, security, maintenance hotline)
CREATE TABLE property_contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role        VARCHAR(100) NOT NULL,    -- 'building_manager' | 'security' | 'maintenance' | 'emergency'
  name        VARCHAR(200) NOT NULL,
  phone       VARCHAR(50),
  mobile      VARCHAR(50),
  email       VARCHAR(255),
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  SMALLINT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### TypeORM Entities

```typescript
// src/modules/properties/entities/property.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';

@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @Column({ name: 'branch_id', nullable: true }) branchId: string | null;
  @Column({ name: 'business_unit_id', nullable: true }) businessUnitId: string | null;
  @Column({ name: 'region_id', nullable: true }) regionId: string | null;
  @Column({ name: 'property_type_id', nullable: true }) propertyTypeId: string | null;
  @Column({ length: 255 }) name: string;
  @Column({ nullable: true, length: 50 }) code: string | null;
  @Column({ name: 'legal_name', nullable: true }) legalName: string | null;
  @Column({ name: 'registration_no', nullable: true }) registrationNo: string | null;
  @Column({ name: 'property_type', length: 50, default: 'residential' }) propertyType: string;
  @Column({ length: 30, default: 'active' }) status: string;
  @Column({ name: 'address_line1', nullable: true }) addressLine1: string | null;
  @Column({ name: 'address_line2', nullable: true }) addressLine2: string | null;
  @Column({ nullable: true }) city: string | null;
  @Column({ nullable: true }) state: string | null;
  @Column({ name: 'postal_code', nullable: true }) postalCode: string | null;
  @Column({ nullable: true, length: 2 }) country: string | null;
  @Column({ name: 'geo_lat', type: 'numeric', precision: 9, scale: 6, nullable: true }) geoLat: number | null;
  @Column({ name: 'geo_lng', type: 'numeric', precision: 9, scale: 6, nullable: true }) geoLng: number | null;
  @Column({ name: 'year_built', nullable: true }) yearBuilt: number | null;
  @Column({ name: 'total_floors', nullable: true }) totalFloors: number | null;
  @Column({ name: 'total_units', default: 0 }) totalUnits: number;
  @Column({ name: 'total_area_sqft', type: 'numeric', precision: 12, scale: 2, nullable: true }) totalAreaSqft: number | null;
  @Column({ name: 'cover_image_url', nullable: true }) coverImageUrl: string | null;
  @Column({ name: 'manager_id', nullable: true }) managerId: string | null;
  @Column({ name: 'billing_cycle', default: 'monthly' }) billingCycle: string;
  @Column({ name: 'billing_day', default: 1 }) billingDay: number;
  @Column({ default: 'USD', length: 3 }) currency: string;
  @Column({ default: 'UTC' }) timezone: string;
  @Column({ type: 'jsonb', default: {} }) settings: Record<string, unknown>;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt: Date | null;

  @OneToMany(() => PropertyFacility, (f) => f.property)
  facilities: PropertyFacility[];

  @OneToMany(() => PropertyPhoto, (p) => p.property)
  photos: PropertyPhoto[];

  @OneToMany(() => PropertyContact, (c) => c.property)
  contacts: PropertyContact[];
}
```

---

## Server-Side Architecture

```
src/modules/properties/
├── properties.module.ts
├── properties.controller.ts
├── properties.service.ts
├── facilities.controller.ts
├── facilities.service.ts
├── photos.service.ts
├── contacts.service.ts
├── dto/
│   ├── create-property.dto.ts
│   ├── update-property.dto.ts
│   ├── property-query.dto.ts
│   ├── update-property-status.dto.ts
│   ├── add-facility.dto.ts
│   ├── add-property-contact.dto.ts
│   └── upload-photo.dto.ts
├── entities/
│   ├── property.entity.ts
│   ├── property-type.entity.ts
│   ├── property-facility.entity.ts
│   ├── facility-type.entity.ts
│   ├── property-photo.entity.ts
│   ├── property-contact.entity.ts
│   └── property-status-history.entity.ts
└── seeds/
    ├── property-types.seed.ts
    └── facility-types.seed.ts
```

### Services

```typescript
// src/modules/properties/properties.service.ts
@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property) private propertyRepo: Repository<Property>,
    @InjectRepository(PropertyStatusHistory) private statusHistoryRepo: Repository<PropertyStatusHistory>,
    private storageService: StorageService,
    @InjectRedis() private redis: Redis,
  ) {}

  async create(dto: CreatePropertyDto, companyId: string, createdBy: string): Promise<Property> {
    // 1. Validate company property limit (from settings.maxProperties)
    await this.validatePropertyLimit(companyId);
    // 2. Validate unique code within company
    if (dto.code) await this.validateUniqueCode(dto.code, companyId);
    // 3. Geocode address if lat/lng not provided (Google Maps Geocoding API)
    if (!dto.geoLat && dto.addressLine1) {
      const coords = await this.geocodeAddress(dto);
      dto.geoLat = coords.lat;
      dto.geoLng = coords.lng;
    }
    const property = await this.propertyRepo.save({ ...dto, companyId });
    await this.statusHistoryRepo.save({ propertyId: property.id, toStatus: 'active', changedBy: createdBy });
    await this.invalidatePropertyCache(companyId);
    return property;
  }

  async updateStatus(id: string, dto: UpdatePropertyStatusDto, changedBy: string): Promise<Property> {
    const property = await this.findOne(id);
    await this.validateStatusTransition(property.status, dto.status);
    await this.statusHistoryRepo.save({ propertyId: id, fromStatus: property.status, toStatus: dto.status, reason: dto.reason, changedBy });
    await this.propertyRepo.update(id, { status: dto.status });
    return this.findOne(id);
  }

  async getSummaryStats(id: string): Promise<PropertySummaryStats> {
    // Aggregates from multiple modules; cached 5 minutes
    const cacheKey = `pms:property:stats:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const stats = await this.propertyRepo
      .createQueryBuilder('p')
      .select([
        'p.id',
        'p.total_units AS "totalUnits"',
        'COUNT(u.id) FILTER (WHERE u.status = \'occupied\') AS "occupiedUnits"',
        'COUNT(u.id) FILTER (WHERE u.status = \'available\') AS "availableUnits"',
        'COUNT(u.id) FILTER (WHERE u.status = \'maintenance\') AS "maintenanceUnits"',
        'COUNT(l.id) FILTER (WHERE l.status = \'active\') AS "activeLeases"',
        'COUNT(l.id) FILTER (WHERE l.end_date BETWEEN NOW() AND NOW() + INTERVAL \'90 days\') AS "expiringLeases"',
      ])
      .leftJoin('units', 'u', 'u.property_id = p.id AND u.deleted_at IS NULL')
      .leftJoin('leases', 'l', 'l.property_id = p.id AND l.deleted_at IS NULL')
      .where('p.id = :id', { id })
      .getRawOne();

    const occupancyRate = stats.totalUnits > 0
      ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
      : 0;

    const result = { ...stats, occupancyRate };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }

  async findNearby(lat: number, lng: number, radiusKm: number, companyId: string): Promise<Property[]> {
    // PostGIS ST_DWithin query
    return this.propertyRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere(
        'ST_DWithin(p.geo_point::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)',
        { lat, lng, radius: radiusKm * 1000 },
      )
      .addSelect('ST_Distance(p.geo_point::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance')
      .orderBy('distance', 'ASC')
      .getMany();
  }

  private async validateStatusTransition(from: string, to: string): Promise<void> {
    const allowed: Record<string, string[]> = {
      active: ['under_renovation', 'decommissioned'],
      under_renovation: ['active', 'decommissioned'],
      decommissioned: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Cannot transition property from '${from}' to '${to}'`);
    }
  }

  private async validatePropertyLimit(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOneOrFail({ where: { id: companyId } });
    const maxProperties = company.settings?.maxProperties as number | undefined;
    if (!maxProperties) return;
    const count = await this.propertyRepo.count({ where: { companyId, deletedAt: IsNull() } });
    if (count >= maxProperties) {
      throw new HttpException({ code: 'PROPERTY_LIMIT_REACHED', message: `Your plan allows up to ${maxProperties} properties.` }, 402);
    }
  }
}
```

---

## API Contract

### Base URL: `/api/v1/properties`

---

### `GET /properties`
**Access:** `properties.read`  
**Query:** `?search=&status=active&propertyType=residential&regionId=&page=1&limit=20&sort=name&order=asc`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Acme Tower A",
      "code": "TOWER-A",
      "propertyType": "residential",
      "status": "active",
      "address": "123 Main St, Singapore 018956",
      "city": "Singapore",
      "country": "SG",
      "geoLat": 1.2842,
      "geoLng": 103.8512,
      "coverImageUrl": "https://cdn.pms.com/...",
      "manager": { "id": "uuid", "fullName": "Alice Johnson" },
      "totalUnits": 80,
      "occupancyRate": 87,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `POST /properties`
**Access:** `properties.create`

```json
{
  "name": "Acme Tower A",
  "code": "TOWER-A",
  "propertyType": "residential",
  "legalName": "Acme Tower A Pte Ltd",
  "registrationNo": "202400001A",
  "addressLine1": "123 Main Street",
  "addressLine2": "#01-01",
  "city": "Singapore",
  "state": null,
  "postalCode": "018956",
  "country": "SG",
  "geoLat": 1.2842,
  "geoLng": 103.8512,
  "yearBuilt": 2018,
  "totalFloors": 30,
  "totalAreaSqft": 250000,
  "managerId": "uuid",
  "billingCycle": "monthly",
  "billingDay": 1,
  "currency": "SGD",
  "timezone": "Asia/Singapore",
  "regionId": "uuid",
  "branchId": "uuid",
  "businessUnitId": "uuid"
}
```

**Response 201:**
```json
{ "success": true, "data": { "id": "uuid", "name": "Acme Tower A", "status": "active" } }
```

---

### `GET /properties/:id`
**Access:** `properties.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Tower A",
    "code": "TOWER-A",
    "propertyType": "residential",
    "legalName": "Acme Tower A Pte Ltd",
    "registrationNo": "202400001A",
    "status": "active",
    "addressLine1": "123 Main Street",
    "city": "Singapore",
    "postalCode": "018956",
    "country": "SG",
    "geoLat": 1.2842,
    "geoLng": 103.8512,
    "yearBuilt": 2018,
    "totalFloors": 30,
    "totalUnits": 80,
    "totalAreaSqft": 250000,
    "currency": "SGD",
    "timezone": "Asia/Singapore",
    "billingCycle": "monthly",
    "billingDay": 1,
    "manager": { "id": "uuid", "fullName": "Alice Johnson", "email": "alice@acme.com" },
    "region": { "id": "uuid", "name": "North Region" },
    "photos": [
      { "id": "uuid", "url": "https://cdn.pms.com/...", "isCover": true, "sortOrder": 0 }
    ],
    "facilities": [
      { "id": "uuid", "name": "Swimming Pool", "category": "recreation", "isBookable": true, "floor": "B1" }
    ],
    "contacts": [
      { "role": "building_manager", "name": "Bob Smith", "phone": "+65-6111-0000", "isPrimary": true }
    ],
    "stats": {
      "totalUnits": 80,
      "occupiedUnits": 70,
      "availableUnits": 8,
      "maintenanceUnits": 2,
      "occupancyRate": 87,
      "activeLeases": 70,
      "expiringLeases": 5
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T08:00:00Z"
  }
}
```

---

### `PUT /properties/:id`
**Access:** `properties.update`

Partial update — any subset of create fields.

---

### `DELETE /properties/:id`
**Access:** `properties.delete`

Soft delete. Returns `409` if property has active leases.

---

### `POST /properties/:id/status`
**Access:** `properties.update`

```json
{
  "status": "under_renovation",
  "reason": "Lobby and common area refurbishment Q1 2025"
}
```

---

### `GET /properties/:id/status-history`
**Access:** `properties.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "fromStatus": null, "toStatus": "active", "reason": null, "changedBy": { "fullName": "System" }, "changedAt": "2024-01-01T00:00:00Z" },
    { "fromStatus": "active", "toStatus": "under_renovation", "reason": "Lobby refurb", "changedBy": { "fullName": "Alice Johnson" }, "changedAt": "2025-01-10T09:00:00Z" }
  ]
}
```

---

### `GET /properties/:id/stats`
**Access:** `properties.read`

Returns `PropertySummaryStats` (see service above).

---

### `GET /properties/nearby`
**Access:** `properties.read`  
**Query:** `?lat=1.2842&lng=103.8512&radiusKm=5`

---

### Photos

### `POST /properties/:id/photos`
**Access:** `properties.update`  
**Content-Type:** `multipart/form-data`  
**Body:** `photos[]` (JPEG/PNG/WebP, max 5MB each, max 20 photos)

**Response 201:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "url": "https://cdn.pms.com/...", "isCover": false, "sortOrder": 1 }
  ]
}
```

### `PUT /properties/:id/photos/order`
**Access:** `properties.update`

```json
{ "order": ["uuid1", "uuid2", "uuid3"] }
```

### `PUT /properties/:id/photos/:photoId/cover`
**Access:** `properties.update`

### `DELETE /properties/:id/photos/:photoId`
**Access:** `properties.update`

---

### Facilities

### `GET /facility-types`
**Access:** Authenticated

### `GET /properties/:id/facilities`
**Access:** `properties.read`

### `POST /properties/:id/facilities`
**Access:** `properties.update`

```json
{
  "facilityTypeId": "uuid",
  "name": "Rooftop Pool",
  "floor": "30F",
  "capacity": 50,
  "isBookable": true,
  "bookingAdvanceDays": 7,
  "operatingHours": {
    "mon": "06:00-22:00",
    "tue": "06:00-22:00",
    "wed": "06:00-22:00",
    "thu": "06:00-22:00",
    "fri": "06:00-22:00",
    "sat": "07:00-21:00",
    "sun": "07:00-21:00"
  }
}
```

### `PUT /properties/:id/facilities/:facilityId`
### `DELETE /properties/:id/facilities/:facilityId`

---

### Contacts

### `GET /properties/:id/contacts`
### `POST /properties/:id/contacts`

```json
{
  "role": "building_manager",
  "name": "Bob Smith",
  "phone": "+65-6111-0000",
  "mobile": "+65-9111-0000",
  "email": "bob@acme.com",
  "isPrimary": true
}
```

### `PUT /properties/:id/contacts/:contactId`
### `DELETE /properties/:id/contacts/:contactId`

---

## Business Logic & Validation Rules

```
Property creation:
1. code must be unique within company (case-insensitive)
2. billingDay: 1–28 (avoid month-end edge cases)
3. geoLat: -90 to 90; geoLng: -180 to 180
4. If geoLat/geoLng not provided but addressLine1 + city + country present:
   → call Google Maps Geocoding API (async, non-blocking — update after save)
5. totalFloors: 1–200
6. yearBuilt: 1800 to current year + 5

Status transitions:
  active → under_renovation (requires reason)
  active → decommissioned (requires reason; blocked if activeLeases > 0)
  under_renovation → active
  under_renovation → decommissioned (requires reason; blocked if activeLeases > 0)
  decommissioned → (nothing — terminal state)

Photo upload:
  - Server resizes all photos: original (max 2000px wide) + thumbnail (400px wide)
  - Cover image auto-set to first uploaded photo if none exists
  - On reorder: update sort_order for all photos in the submitted array
  - On delete: if deleted photo was cover, promote next photo to cover
  - S3 path: {companyId}/properties/{propertyId}/photos/{uuid}.webp

Facility operating hours:
  - Stored as JSONB { mon, tue, wed, thu, fri, sat, sun }
  - Each value: "HH:MM-HH:MM" or null (closed)
  - Validated on save; used by Facility Booking module (Phase 5) to check availability
```

---

## UI Screens & Component Breakdown

```
admin/properties/
├── PropertyListPage/
│   ├── PropertyListPage.tsx
│   └── components/
│       ├── PropertyGrid.tsx               # card grid (default) or list toggle
│       ├── PropertyCard.tsx               # cover image + name + status badge + occupancy bar
│       │   ├── OccupancyBar.tsx           # green/yellow/red progress bar
│       │   └── PropertyStatusBadge.tsx    # Active | Under Renovation | Decommissioned
│       ├── PropertyListRow.tsx            # compact table row variant
│       ├── PropertyFilters.tsx            # status, type, region, search
│       └── CreatePropertyButton.tsx

├── PropertyDetailPage/
│   ├── PropertyDetailPage.tsx             # tabs: Overview | Units | Leases | Finance | Documents | Settings
│   └── components/
│       ├── PropertyHeader.tsx             # cover photo + name + status + quick stats bar
│       ├── tabs/
│       │   ├── OverviewTab/
│       │   │   ├── OverviewTab.tsx
│       │   │   ├── PropertyMap.tsx         # Google Maps iframe + geo-point marker
│       │   │   ├── StatsCards.tsx          # occupancy, active leases, expiring leases
│       │   │   ├── FacilitiesGrid.tsx      # facility icon cards
│       │   │   ├── ContactsList.tsx        # contact cards with role labels
│       │   │   └── PhotoGallery.tsx        # lightbox gallery
│       │   ├── UnitsTab/                   # injected from Module 2.2
│       │   ├── LeasesTab/                  # injected from Module 2.4
│       │   ├── FinanceTab/                 # injected from Phase 3
│       │   ├── DocumentsTab/              # Document Management integration
│       │   └── SettingsTab/
│       │       ├── SettingsTab.tsx
│       │       ├── BillingSettingsForm.tsx
│       │       └── StatusChangeModal.tsx   # status transition with reason

├── CreatePropertyPage/                    # multi-step wizard
│   └── steps/
│       ├── Step1BasicInfo.tsx             # name, type, code
│       ├── Step2Address.tsx               # address + map picker
│       │   └── MapPicker.tsx              # Google Maps with draggable marker
│       ├── Step3Details.tsx               # year built, floors, area, manager
│       ├── Step4Facilities.tsx            # checkbox list of facility types
│       └── Step5Photos.tsx                # drag-drop photo upload

└── PropertyPhotosManager/
    └── components/
        ├── PhotoGrid.tsx                  # drag-to-reorder grid
        ├── PhotoCard.tsx                  # thumbnail + cover star + delete
        └── PhotoDropZone.tsx
```

### Key UI Behaviors

```
PropertyCard occupancy bar:
- ≥ 90%: green
- 70–89%: yellow-orange
- < 70%: red
- Shows "N / M units" tooltip on hover

MapPicker (create/edit):
- Google Maps JavaScript API embedded in modal
- Draggable marker: drag to adjust coordinates
- Search box (Google Places Autocomplete) fills address fields automatically
- Reverse geocoding on marker drag updates address fields

PhotoGallery (overview tab):
- Thumbnail grid, click to open fullscreen lightbox
- Cover photo displayed first with "Cover" badge overlay
- Edit mode (admin only): drag to reorder, click star to set cover, × to delete

CreateProperty wizard:
- Progress bar showing steps 1–5
- Each step validates before allowing "Next"
- Step 2 address search auto-populates city/country/postal code
- Step 4: facility types shown as icon cards with checkboxes
- Step 5: drag-drop multiple photos with preview
- Final step: review summary + Submit
```

---

## State Management

```typescript
// src/store/api/propertiesApi.ts
export const propertiesApi = createApi({
  reducerPath: 'propertiesApi',
  tagTypes: ['Properties', 'PropertyFacilities', 'PropertyPhotos', 'FacilityTypes'],
  endpoints: (builder) => ({
    getProperties: builder.query<PaginatedResponse<PropertyListItem>, PropertyQueryParams>({
      query: (params) => ({ url: '/properties', params }),
      providesTags: ['Properties'],
    }),
    getProperty: builder.query<PropertyDetail, string>({
      query: (id) => `/properties/${id}`,
      providesTags: (_, __, id) => [{ type: 'Properties', id }],
    }),
    getPropertyStats: builder.query<PropertySummaryStats, string>({
      query: (id) => `/properties/${id}/stats`,
      providesTags: (_, __, id) => [{ type: 'Properties', id: `${id}-stats` }],
    }),
    createProperty: builder.mutation<Property, CreatePropertyDto>({
      query: (body) => ({ url: '/properties', method: 'POST', body }),
      invalidatesTags: ['Properties'],
    }),
    updateProperty: builder.mutation<Property, { id: string; data: UpdatePropertyDto }>({
      query: ({ id, data }) => ({ url: `/properties/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Properties', id }, 'Properties'],
    }),
    updatePropertyStatus: builder.mutation<Property, { id: string; data: UpdatePropertyStatusDto }>({
      query: ({ id, data }) => ({ url: `/properties/${id}/status`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Properties', id }, 'Properties'],
    }),
    deleteProperty: builder.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Properties'],
    }),
    uploadPhotos: builder.mutation<PropertyPhoto[], { propertyId: string; formData: FormData }>({
      query: ({ propertyId, formData }) => ({ url: `/properties/${propertyId}/photos`, method: 'POST', body: formData }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }],
    }),
    reorderPhotos: builder.mutation<void, { propertyId: string; order: string[] }>({
      query: ({ propertyId, order }) => ({ url: `/properties/${propertyId}/photos/order`, method: 'PUT', body: { order } }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }],
    }),
    getFacilityTypes: builder.query<FacilityType[], void>({
      query: () => '/facility-types',
      providesTags: ['FacilityTypes'],
    }),
    addFacility: builder.mutation<PropertyFacility, { propertyId: string; data: AddFacilityDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/facilities`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyFacilities', id: propertyId }],
    }),
    removeFacility: builder.mutation<void, { propertyId: string; facilityId: string }>({
      query: ({ propertyId, facilityId }) => ({ url: `/properties/${propertyId}/facilities/${facilityId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyFacilities', id: propertyId }],
    }),
  }),
});

// src/store/slices/propertiesSlice.ts
interface PropertiesState {
  selectedPropertyId: string | null;
  activeTab: 'overview' | 'units' | 'leases' | 'finance' | 'documents' | 'settings';
  listFilters: { search: string; status: string | null; propertyType: string | null; regionId: string | null };
}

export const propertiesSlice = createSlice({
  name: 'properties',
  initialState: {
    selectedPropertyId: null,
    activeTab: 'overview',
    listFilters: { search: '', status: 'active', propertyType: null, regionId: null },
  } as PropertiesState,
  reducers: {
    setSelectedProperty: (state, action: PayloadAction<string | null>) => { state.selectedPropertyId = action.payload; },
    setActiveTab: (state, action: PayloadAction<PropertiesState['activeTab']>) => { state.activeTab = action.payload; },
    setListFilter: (state, action: PayloadAction<Partial<PropertiesState['listFilters']>>) => {
      state.listFilters = { ...state.listFilters, ...action.payload };
    },
  },
});
```
