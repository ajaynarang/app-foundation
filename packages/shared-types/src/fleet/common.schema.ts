import { z } from 'zod';
import { EquipmentType, EquipmentTypeSchema, OwnershipType, OwnershipTypeSchema } from '../generated/prisma-enums';

// `EquipmentType` and `OwnershipType` re-exported from the codegen mirror —
// Prisma enums are the single source of truth.
export { EquipmentType, EquipmentTypeSchema, OwnershipType, OwnershipTypeSchema };

// Equipment types valid for trailers (no POWER_ONLY) — narrowed subset, NOT a
// Prisma enum.
export const TrailerEquipmentTypeSchema = z.enum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'OTHER']);

// Backward-compat aliases
export const VehicleOwnershipTypeSchema = OwnershipTypeSchema;
export type VehicleOwnershipType = OwnershipType;
