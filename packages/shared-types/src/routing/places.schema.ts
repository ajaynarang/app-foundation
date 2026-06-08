import { z } from 'zod';

export const PlacesProviderSchema = z.enum(['here', 'google', 'smarty']);
export type PlacesProvider = z.infer<typeof PlacesProviderSchema>;

export const PlaceSuggestionSchema = z.object({
  externalId: z.string().min(1),
  text: z.string().min(1),
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  provider: PlacesProviderSchema,
});
export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;

export const AutocompleteQuerySchema = z.object({
  q: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(3).max(120)),
  country: z.literal('US').optional(),
  sessionToken: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});
export type AutocompleteQuery = z.infer<typeof AutocompleteQuerySchema>;

export const AutocompleteResponseSchema = z.object({
  results: z.array(PlaceSuggestionSchema),
});
export type AutocompleteResponse = z.infer<typeof AutocompleteResponseSchema>;
