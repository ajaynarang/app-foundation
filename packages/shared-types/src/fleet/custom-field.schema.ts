import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const CustomFieldEntityTypeEnum = z.enum(['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER']);

export const CustomFieldTypeEnum = z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT']);

// ─── Definition Schema ───────────────────────────────────────────────────────

export const CustomFieldDefinitionSchema = z.object({
  id: z.number().int(),
  tenantId: z.number(),
  entityType: CustomFieldEntityTypeEnum,
  name: z.string().min(1).max(100),
  fieldKey: z.string().min(1).max(50),
  fieldType: CustomFieldTypeEnum,
  options: z.array(z.string()).optional().default([]),
  isRequired: z.boolean().default(false),
  driverEditable: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  showOnInvoice: z.boolean().default(false),
  showOnBol: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Value Schema ────────────────────────────────────────────────────────────

export const CustomFieldValuesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null()]))
  .optional()
  .default({});

// ─── Request Schemas ─────────────────────────────────────────────────────────

export const CreateCustomFieldDefinitionSchema = z.object({
  entityType: CustomFieldEntityTypeEnum,
  name: z.string().min(1).max(100),
  fieldType: CustomFieldTypeEnum,
  options: z.array(z.string().min(1)).optional().default([]),
  isRequired: z.boolean().optional().default(false),
  driverEditable: z.boolean().optional().default(false),
  showOnInvoice: z.boolean().optional().default(false),
  showOnBol: z.boolean().optional().default(false),
});

export const UpdateCustomFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.string().min(1)).optional(),
  isRequired: z.boolean().optional(),
  driverEditable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  showOnInvoice: z.boolean().optional(),
  showOnBol: z.boolean().optional(),
});

export const ReorderCustomFieldDefinitionsSchema = z.object({
  orderedIds: z.array(z.number().int()).min(1).max(20),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type CustomFieldEntityType = z.infer<typeof CustomFieldEntityTypeEnum>;
export type CustomFieldType = z.infer<typeof CustomFieldTypeEnum>;
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinitionSchema>;
export type CustomFieldValues = z.infer<typeof CustomFieldValuesSchema>;
export type CreateCustomFieldDefinitionInput = z.infer<typeof CreateCustomFieldDefinitionSchema>;
export type UpdateCustomFieldDefinitionInput = z.infer<typeof UpdateCustomFieldDefinitionSchema>;
export type ReorderCustomFieldDefinitionsInput = z.infer<typeof ReorderCustomFieldDefinitionsSchema>;
