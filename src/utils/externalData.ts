import type { FormField } from '../types';

export interface ExternalDataFetchResult {
  payload: unknown;
  isFallback: boolean;
}

export interface ProcessedExternalData {
  selectOptions: Record<string, string[]>;
  initialValues: Record<string, unknown>;
}

const demoDatasets: Record<string, unknown> = {
  'https://api.example.com/customers': {
    'field-company': 'Aurora Industries',
    'field-quantity': 25,
    options: ['Aurora Industries', 'Nordic Solutions', 'Helio Labs', 'Svea Partners'],
  },
};

const labelKeys = ['label', 'name', 'title', 'value', 'id', 'code'];
const identifierKeys = [
  'fieldId',
  'field_id',
  'field',
  'fieldName',
  'field_name',
  'targetField',
  'target_field',
  'target',
  'id',
  'name',
  'key',
  'code',
  'column',
  'property',
];

const sanitizeKey = (key: string) => key.replace(/[\s_-]+/g, '').toLowerCase();

const createKeyVariants = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return [] as string[];
  }

  const camel = trimmed
    .toLowerCase()
    .replace(/[-_\s]+([a-z0-9])/gi, (_, char: string) => char.toUpperCase());

  const variants = new Set<string>([
    trimmed,
    trimmed.toLowerCase(),
    trimmed.replace(/[-_\s]+/g, ''),
    trimmed.replace(/[-_\s]+/g, '_'),
    camel,
    camel.toLowerCase(),
    sanitizeKey(trimmed),
  ]);

  return Array.from(variants).filter(Boolean);
};

const toOptionValue = (input: unknown): string | null => {
  if (input == null) {
    return null;
  }

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return String(input);
  }

  if (Array.isArray(input)) {
    return null;
  }

  if (typeof input === 'object') {
    for (const key of labelKeys) {
      const value = (input as Record<string, unknown>)[key];
      if (value == null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }

    const firstKey = Object.keys(input as Record<string, unknown>)[0];
    if (firstKey) {
      const value = (input as Record<string, unknown>)[firstKey];
      if (value == null) return null;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }
  }

  return null;
};

const buildLookup = (record: Record<string, unknown>) => {
  const lower = new Map<string, unknown>();
  const sanitized = new Map<string, unknown>();

  Object.entries(record).forEach(([key, value]) => {
    lower.set(key.toLowerCase(), value);
    sanitized.set(sanitizeKey(key), value);
  });

  return { lower, sanitized } as const;
};

const getValueFromRecord = (
  record: Record<string, unknown>,
  lookup: ReturnType<typeof buildLookup>,
  keys: string[],
  predicate?: (value: unknown) => boolean
): unknown => {
  for (const key of keys) {
    if (key in record) {
      const value = record[key];
      if (!predicate || predicate(value)) {
        return value;
      }
    }
  }

  for (const key of keys) {
    const value = lookup.lower.get(key.toLowerCase());
    if (value === undefined) continue;
    if (!predicate || predicate(value)) {
      return value;
    }
  }

  for (const key of keys) {
    const value = lookup.sanitized.get(sanitizeKey(key));
    if (value === undefined) continue;
    if (!predicate || predicate(value)) {
      return value;
    }
  }

  return undefined;
};

const normalizeOptions = (input: unknown[]): string[] => {
  const seen = new Set<string>();
  const options: string[] = [];
  input.forEach((item) => {
    const candidate = toOptionValue(item);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    options.push(candidate);
  });
  return options;
};

const convertInitialValue = (field: FormField, value: unknown): unknown | undefined => {
  if (value == null) return undefined;

  if (field.type === 'number') {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    return undefined;
  }

  if (field.type === 'select') {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
};

const getArrayValue = (
  record: Record<string, unknown>,
  lookup: ReturnType<typeof buildLookup>,
  keys: string[]
): unknown[] | undefined => {
  const value = getValueFromRecord(record, lookup, keys, Array.isArray);
  return Array.isArray(value) ? value : undefined;
};

export async function loadExternalData(url: string, signal?: AbortSignal): Promise<ExternalDataFetchResult> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Servern svarade med status ${response.status}`);
    }

    const payload = await response.json();
    return { payload, isFallback: false };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (url in demoDatasets) {
      return { payload: demoDatasets[url], isFallback: true };
    }

    throw error;
  }
}

export function processExternalData(payload: unknown, fields: FormField[]): ProcessedExternalData {
  const selectOptions: Record<string, string[]> = {};
  const initialValues: Record<string, unknown> = {};

  if (Array.isArray(payload)) {
    type AggregatedFieldData = { initialValue?: unknown; options?: unknown[] };
    const aggregated = new Map<string, AggregatedFieldData>();
    let matchedByStructure = false;

    const identifierKeyVariants = Array.from(
      new Set(identifierKeys.flatMap((key) => createKeyVariants(key)))
    );

    const fieldMeta = new Map<
      string,
      { keyVariants: string[]; normalizedKeys: Set<string> }
    >();
    fields.forEach((field) => {
      const keyVariants = [
        ...createKeyVariants(field.id),
        ...createKeyVariants(field.label ?? ''),
      ];
      const normalizedKeys = new Set(keyVariants.map((key) => sanitizeKey(key)));
      if (field.id) {
        normalizedKeys.add(sanitizeKey(field.id));
      }
      if (field.label) {
        normalizedKeys.add(sanitizeKey(field.label));
      }
      fieldMeta.set(field.id, { keyVariants, normalizedKeys });
    });

    payload.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const record = entry as Record<string, unknown>;
      const lookup = buildLookup(record);

      fields.forEach((field) => {
        const meta = fieldMeta.get(field.id);
        if (!meta) return;

        const { keyVariants, normalizedKeys } = meta;

        let matchesField = Object.keys(record).some((key) =>
          normalizedKeys.has(sanitizeKey(key))
        );

        if (!matchesField) {
          const identifierValue = getValueFromRecord(record, lookup, identifierKeyVariants);
          if (
            typeof identifierValue === 'string' &&
            normalizedKeys.has(sanitizeKey(identifierValue))
          ) {
            matchesField = true;
          }
        }

        if (!matchesField) {
          return;
        }

        matchedByStructure = true;

        const aggregate = aggregated.get(field.id) ?? {};
        aggregated.set(field.id, aggregate);

        const valueKeys = [
          ...keyVariants,
          ...keyVariants.flatMap((variant) => [
            `${variant}Value`,
            `${variant}_value`,
            `${variant}Default`,
            `${variant}_default`,
            `${variant}DefaultValue`,
            `${variant}_default_value`,
            `${variant}Initial`,
            `${variant}_initial`,
            `${variant}InitialValue`,
            `${variant}_initial_value`,
          ]),
          'value',
          'default',
          'defaultValue',
          'initial',
          'initialValue',
          'current',
        ];

        const rawValue = getValueFromRecord(record, lookup, valueKeys);

        if (rawValue !== undefined && aggregate.initialValue === undefined) {
          const converted = convertInitialValue(field, rawValue);
          if (converted !== undefined) {
            aggregate.initialValue = converted;
          }
        }

        const optionKeys = [
          ...keyVariants.flatMap((variant) => [
            `${variant}Options`,
            `${variant}_options`,
            `${variant}Choices`,
            `${variant}_choices`,
            `${variant}List`,
            `${variant}_list`,
          ]),
          'options',
          'values',
          'items',
          'list',
          'choices',
        ];

        let optionArray = getArrayValue(record, lookup, optionKeys);
        if (!optionArray && Array.isArray(rawValue)) {
          optionArray = rawValue;
        }

        if (optionArray && optionArray.length > 0) {
          aggregate.options = [...(aggregate.options ?? []), ...optionArray];
        }
      });
    });

    aggregated.forEach((aggregate, fieldId) => {
      if (aggregate.initialValue !== undefined) {
        initialValues[fieldId] = aggregate.initialValue;
      }
      if (aggregate.options && aggregate.options.length > 0) {
        const options = normalizeOptions(aggregate.options);
        if (options.length > 0) {
          selectOptions[fieldId] = options;
        }
      }
    });

    if (!matchedByStructure) {
      const options = normalizeOptions(payload);
      if (options.length > 0) {
        fields
          .filter((field) => field.type === 'select')
          .forEach((field) => {
            selectOptions[field.id] = options;
          });
      }
    }

    return { selectOptions, initialValues };
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const lookup = buildLookup(record);

    const genericArray = getArrayValue(record, lookup, ['options', 'values', 'items', 'data', 'list']);

    fields.forEach((field) => {
      const keyVariants = [...createKeyVariants(field.id), ...createKeyVariants(field.label ?? '')];

      const rawValue = getValueFromRecord(record, lookup, keyVariants);
      const initialValue = convertInitialValue(field, rawValue);
      if (initialValue !== undefined) {
        initialValues[field.id] = initialValue;
      }

      if (field.type === 'select') {
        const optionKeys = keyVariants.flatMap((variant) => [
          `${variant}Options`,
          `${variant}_options`,
          `${variant}List`,
          `${variant}_list`,
        ]);

        let optionArray = getArrayValue(record, lookup, optionKeys) ?? genericArray;

        if (!optionArray && Array.isArray(rawValue)) {
          optionArray = rawValue;
        }

        if (optionArray) {
          const options = normalizeOptions(optionArray);
          if (options.length > 0) {
            selectOptions[field.id] = options;
          }
        }
      }
    });
  }

  return { selectOptions, initialValues };
}
