import { z } from 'zod';
import { isoDateSchema, positiveIntegerSchema, positiveMoneySchema, tickerSchema } from './common';

export const newWheelSchema = z.object({
  ticker: tickerSchema,
  strike: positiveMoneySchema,
  expiration: isoDateSchema,
  contracts: positiveIntegerSchema,
  premiumPerContract: positiveMoneySchema,
  fillDate: isoDateSchema.optional(),
  thesis: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5_000).optional(),
});

export type NewWheelFormValues = z.infer<typeof newWheelSchema>;
