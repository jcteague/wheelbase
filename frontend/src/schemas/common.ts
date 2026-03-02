import { z } from 'zod';

export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}$/, 'Ticker must be 1-5 uppercase letters');

export const positiveMoneySchema = z
  .coerce
  .number({ invalid_type_error: 'Value must be a number' })
  .positive('Value must be greater than 0');

export const positiveIntegerSchema = z
  .coerce
  .number({ invalid_type_error: 'Value must be a number' })
  .int('Value must be an integer')
  .positive('Value must be greater than 0');

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
