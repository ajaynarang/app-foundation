import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import type { CustomFieldDefinition as PrismaDefinition } from '@prisma/client';

export type ValidationContext = 'dispatcher' | 'driver';

interface ValidateResult {
  /** Cleaned, validated values ready for DB storage */
  values: Record<string, string | number | null>;
  /** Warnings (e.g., unknown keys stripped) */
  warnings: string[];
}

@Injectable()
export class CustomFieldValidatorService {
  private readonly logger = new Logger(CustomFieldValidatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  /**
   * Fetch active definitions for a tenant + entity type (cached).
   */
  async getDefinitions(tenantId: number, entityType: string): Promise<PrismaDefinition[]> {
    const cacheKey = buildKey('sally:custom-fields', tenantId, entityType);
    return this.cache.getOrSet(
      cacheKey,
      () =>
        this.prisma.customFieldDefinition.findMany({
          where: {
            tenantId,
            entityType: entityType as any,
            isActive: true,
          },
          orderBy: { sortOrder: 'asc' },
        }),
      CACHE_TTL_WARM_5M,
    );
  }

  /**
   * Invalidate cached definitions after a definition change.
   */
  async invalidateCache(tenantId: number, entityType: string): Promise<void> {
    const cacheKey = buildKey('sally:custom-fields', tenantId, entityType);
    await this.cache.del(cacheKey);
  }

  /**
   * Validate custom field values against active definitions.
   *
   * - Strips unknown keys (no matching definition)
   * - Type-checks each value
   * - Enforces required fields (if isCreate=true)
   * - Filters by driverEditable when context='driver'
   * - Merges with existing values (partial update)
   */
  async validate(
    tenantId: number,
    entityType: string,
    incomingValues: Record<string, unknown> | undefined | null,
    options: {
      context?: ValidationContext;
      existingValues?: Record<string, unknown> | null;
      isCreate?: boolean;
    } = {},
  ): Promise<ValidateResult> {
    const { context = 'dispatcher', existingValues, isCreate = false } = options;

    if (!incomingValues && !isCreate) {
      return { values: (existingValues as any) ?? {}, warnings: [] };
    }

    const definitions = await this.getDefinitions(tenantId, entityType);
    if (definitions.length === 0) {
      return { values: {}, warnings: [] };
    }

    const defMap = new Map(definitions.map((d) => [d.fieldKey, d]));
    const merged: Record<string, string | number | null> = {
      ...((existingValues as any) ?? {}),
    };
    const warnings: string[] = [];
    const incoming = incomingValues ?? {};

    // Apply incoming values
    for (const [key, value] of Object.entries(incoming)) {
      const def = defMap.get(key);
      if (!def) {
        warnings.push(`Unknown custom field "${key}" stripped`);
        continue;
      }

      // Driver context: skip non-editable fields
      if (context === 'driver' && !def.driverEditable) {
        continue;
      }

      // Null means clear the value
      if (value === null || value === undefined || value === '') {
        merged[key] = null;
        continue;
      }

      // Type validation
      const validated = this.validateValue(def, value);
      if (validated.error) {
        throw new BadRequestException(`Custom field "${def.name}" (${key}): ${validated.error}`);
      }
      merged[key] = validated.value!;
    }

    // Required field check on create
    if (isCreate) {
      for (const def of definitions) {
        if (context === 'driver' && !def.driverEditable) continue;
        if (def.isRequired && (merged[def.fieldKey] === null || merged[def.fieldKey] === undefined)) {
          throw new BadRequestException(`Custom field "${def.name}" is required`);
        }
      }
    }

    // Strip keys that have no definition (cleanup of legacy/deactivated fields on write)
    for (const key of Object.keys(merged)) {
      if (!defMap.has(key)) {
        delete merged[key];
      }
    }

    return { values: merged, warnings };
  }

  private validateValue(def: PrismaDefinition, value: unknown): { value?: string | number | null; error?: string } {
    switch (def.fieldType) {
      case 'TEXT': {
        if (typeof value !== 'string') {
          return { error: 'Expected a text value' };
        }
        if (value.length > 500) {
          return { error: 'Text value must be 500 characters or less' };
        }
        return { value };
      }
      case 'NUMBER': {
        const num = typeof value === 'string' ? Number(value) : value;
        if (typeof num !== 'number' || !isFinite(num)) {
          return { error: 'Expected a numeric value' };
        }
        return { value: num };
      }
      case 'DATE': {
        if (typeof value !== 'string') {
          return { error: 'Expected a date string (YYYY-MM-DD)' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return { error: 'Date must be in YYYY-MM-DD format' };
        }
        // Validate the date is semantically valid
        const d = new Date(value + 'T00:00:00');
        if (isNaN(d.getTime())) {
          return { error: 'Date must be a valid calendar date' };
        }
        return { value };
      }
      case 'SELECT': {
        if (typeof value !== 'string') {
          return { error: 'Expected a string value' };
        }
        if (!def.options.includes(value)) {
          return {
            error: `Value "${value}" is not in the allowed options: ${def.options.join(', ')}`,
          };
        }
        return { value };
      }
      default:
        return { error: `Unknown field type: ${String(def.fieldType)}` };
    }
  }
}
