import { ZodError } from 'zod';
import { validationError } from './http-errors.js';

export function zodToValidationDetails(err) {
  const details = {};
  for (const issue of err.issues || []) {
    const key = issue.path && issue.path.length ? issue.path.join('.') : '_';
    if (!details[key]) details[key] = [];
    details[key].push(issue.message);
  }
  return details;
}

export function ensureZodHandled(err) {
  if (err instanceof ZodError) {
    throw validationError(zodToValidationDetails(err));
  }
  throw err;
}
