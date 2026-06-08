import { EquipmentType } from '@prisma/client';

const EQUIPMENT_TYPE_VALUES = new Set(Object.values(EquipmentType));

/** Map freeform equipment string (from rate-con AI parsing) to EquipmentType enum */
export function parseEquipmentType(raw: string | undefined | null): EquipmentType | null {
  if (!raw) return null;

  // Already a valid enum value
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (EQUIPMENT_TYPE_VALUES.has(upper as EquipmentType)) return upper as EquipmentType;

  const lower = raw.toLowerCase();
  if (lower.includes('dry van') || lower.includes('dry_van')) return EquipmentType.DRY_VAN;
  if (lower.includes('reefer') || lower.includes('refrigerat')) return EquipmentType.REEFER;
  if (lower.includes('flatbed')) return EquipmentType.FLATBED;
  if (lower.includes('step deck') || lower.includes('step_deck')) return EquipmentType.STEP_DECK;
  if (lower.includes('power only') || lower.includes('power_only')) return EquipmentType.POWER_ONLY;

  return EquipmentType.OTHER;
}
