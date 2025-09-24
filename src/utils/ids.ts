import { nanoid } from 'nanoid';

export const createId = (prefix: string) => `${prefix}-${nanoid(8)}`;
