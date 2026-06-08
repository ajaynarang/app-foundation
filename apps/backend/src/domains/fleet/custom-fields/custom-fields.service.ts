import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CustomFieldValidatorService } from './custom-field-validator.service';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';
import { UpdateCustomFieldDefinitionDto } from './dto/update-custom-field-definition.dto';
import { ReorderCustomFieldDefinitionsDto } from './dto/reorder-custom-field-definitions.dto';

const MAX_DEFINITIONS_PER_ENTITY = 20;

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: CustomFieldValidatorService,
  ) {}

  /**
   * List active definitions for an entity type.
   */
  async findAll(tenantId: number, entityType: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { tenantId, entityType: entityType as any, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Create a new custom field definition.
   */
  async create(tenantId: number, dto: CreateCustomFieldDefinitionDto) {
    // Enforce limit
    const count = await this.prisma.customFieldDefinition.count({
      where: { tenantId, entityType: dto.entityType as any, isActive: true },
    });
    if (count >= MAX_DEFINITIONS_PER_ENTITY) {
      throw new BadRequestException(`Maximum of ${MAX_DEFINITIONS_PER_ENTITY} custom fields per entity type`);
    }

    // Validate SELECT options
    if (dto.fieldType === 'SELECT' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('SELECT fields must have at least one option');
    }

    // Generate fieldKey from name (slug)
    const fieldKey = this.slugify(dto.name);

    // Check uniqueness
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: {
        uq_tenant_entity_fieldkey: {
          tenantId,
          entityType: dto.entityType as any,
          fieldKey,
        },
      },
    });
    if (existing) {
      if (existing.isActive) {
        throw new ConflictException(`A custom field with key "${fieldKey}" already exists for ${dto.entityType}`);
      }
      // Reactivate deactivated field with same key — preserve immutable fieldType
      if (existing.fieldType !== dto.fieldType) {
        throw new ConflictException(
          `A deactivated field with key "${fieldKey}" exists as ${existing.fieldType}. Cannot reactivate as ${dto.fieldType}.`,
        );
      }
      const reactivated = await this.prisma.customFieldDefinition.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          options: dto.options ?? [],
          isRequired: dto.isRequired ?? false,
          driverEditable: dto.driverEditable ?? false,
          showOnInvoice: dto.showOnInvoice ?? false,
          showOnBol: dto.showOnBol ?? false,
          isActive: true,
          sortOrder: count,
        },
      });
      await this.validator.invalidateCache(tenantId, dto.entityType);
      return reactivated;
    }

    const definition = await this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        entityType: dto.entityType as any,
        name: dto.name,
        fieldKey,
        fieldType: dto.fieldType as any,
        options: dto.options ?? [],
        isRequired: dto.isRequired ?? false,
        driverEditable: dto.driverEditable ?? false,
        showOnInvoice: dto.showOnInvoice ?? false,
        showOnBol: dto.showOnBol ?? false,
        sortOrder: count,
      },
    });

    await this.validator.invalidateCache(tenantId, dto.entityType);
    return definition;
  }

  /**
   * Update a custom field definition (name, options, flags — NOT fieldKey or fieldType).
   */
  async update(tenantId: number, id: number, dto: UpdateCustomFieldDefinitionDto) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found');
    }

    const updated = await this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.driverEditable !== undefined && {
          driverEditable: dto.driverEditable,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.showOnInvoice !== undefined && {
          showOnInvoice: dto.showOnInvoice,
        }),
        ...(dto.showOnBol !== undefined && { showOnBol: dto.showOnBol }),
      },
    });

    await this.validator.invalidateCache(tenantId, definition.entityType);
    return updated;
  }

  /**
   * Soft-delete a custom field definition.
   */
  async deactivate(tenantId: number, id: number) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found');
    }

    const updated = await this.prisma.customFieldDefinition.update({
      where: { id },
      data: { isActive: false },
    });

    await this.validator.invalidateCache(tenantId, definition.entityType);
    return updated;
  }

  /**
   * Bulk reorder definitions.
   */
  async reorder(tenantId: number, dto: ReorderCustomFieldDefinitionsDto) {
    const updates = dto.orderedIds.map((id, index) =>
      this.prisma.customFieldDefinition.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      }),
    );
    await this.prisma.$transaction(updates);

    // Flush all custom-field keys for this tenant (rare operation, broader invalidation acceptable)
    for (const entityType of ['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER']) {
      await this.validator.invalidateCache(tenantId, entityType);
    }

    return { success: true };
  }

  /**
   * Get usage count for a definition (how many entities have a non-null value for this field).
   */
  async getUsageCount(tenantId: number, id: number): Promise<number> {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!definition) return 0;

    const table = this.entityTypeToTable(definition.entityType);
    const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = $1 AND custom_field_values ? $2`,
      tenantId,
      definition.fieldKey,
    );
    return Number(result[0]?.count ?? 0);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private entityTypeToTable(entityType: string): string {
    const map: Record<string, string> = {
      LOAD: 'loads',
      DRIVER: 'drivers',
      VEHICLE: 'vehicles',
      CUSTOMER: 'customers',
    };
    const table = map[entityType];
    if (!table) {
      throw new BadRequestException(`Unknown entity type: ${entityType}`);
    }
    return table;
  }
}
