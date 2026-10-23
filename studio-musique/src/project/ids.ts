import type { Id } from './types';

export const newId = (): Id => crypto.randomUUID();
