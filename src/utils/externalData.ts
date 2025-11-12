import type { FormField, NodeAuthentication, SelectOption } from '../types';

export interface ExternalDataFetchResult {
  payload: unknown;
  isFallback: boolean;
}

export interface ProcessedExternalData {
  selectOptions: Record<string, SelectOption[]>;
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

const explicitValueKeys = [
  'value',
  'default',
  'defaultValue',
  'initial',
  'initialValue',
  'current',
  'selected',
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

const toPrimitiveString = (input: unknown): string | null => {
  if (input == null) {
    return null;
  }

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return String(input);
  }

  return null;
};

const toLabelString = (input: unknown): string | null => {
  const primitive = toPrimitiveString(input);
  if (primitive !== null) {
    return primitive;
  }

  if (Array.isArray(input)) {
    return null;
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;

    for (const key of labelKeys) {
      const candidate = toPrimitiveString(record[key]);
      if (candidate !== null) {
        return candidate;
      }
    }

    const firstKey = Object.keys(record)[0];
    if (firstKey) {
      const candidate = toPrimitiveString(record[firstKey]);
      if (candidate !== null) {
        return candidate;
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

const toValueString = (input: unknown): string | null => {
  const primitive = toPrimitiveString(input);
  if (primitive !== null) {
    return primitive;
  }

  if (Array.isArray(input)) {
    return null;
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const lookup = buildLookup(record);
    const explicit = getValueFromRecord(record, lookup, explicitValueKeys);
    const explicitString = toValueString(explicit);
    if (explicitString) {
      return explicitString;
    }

    return toLabelString(record);
  }

  return null;
};

const normalizeOptions = (input: unknown[]): SelectOption[] => {
  const seen = new Set<string>();
  const options: SelectOption[] = [];

  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    const rawValue = toValueString(item);
    const rawLabel = toLabelString(item);
    const value = rawValue ?? rawLabel;
    if (!value || seen.has(value)) {
      return;
    }

    seen.add(value);
    options.push({ value, label: rawLabel ?? value });
  };

  input.forEach(visit);
  return options;
};

const flattenToArray = (input: unknown): unknown[] => {
  if (input === undefined) {
    return [];
  }

  if (Array.isArray(input)) {
    const result: unknown[] = [];
    input.forEach((item) => {
      result.push(...flattenToArray(item));
    });
    return result;
  }

  return [input];
};

const buildSelectOptions = (labels: unknown, values?: unknown): SelectOption[] => {
  const labelCandidates = flattenToArray(labels);
  const valueCandidates = values === undefined ? [] : flattenToArray(values);
  const count = Math.max(labelCandidates.length, valueCandidates.length);

  if (count === 0) {
    return [];
  }

  const seen = new Set<string>();
  const options: SelectOption[] = [];

  for (let index = 0; index < count; index += 1) {
    const labelCandidate =
      labelCandidates[index] ?? labelCandidates[labelCandidates.length - 1] ?? valueCandidates[index];
    const valueCandidate =
      valueCandidates[index] ?? valueCandidates[valueCandidates.length - 1] ?? labelCandidate;

    let value = toValueString(valueCandidate);
    if (!value) {
      value = toLabelString(valueCandidate);
    }

    if (!value || seen.has(value)) {
      continue;
    }

    const label = toLabelString(labelCandidate ?? valueCandidate) ?? value;

    seen.add(value);
    options.push({ value, label });
  }

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

const pathTokenPattern = /[^.[\]]+|\[(?:-?\d+|(["'])(.*?)\1)\]/g;

const parsePathSegments = (path: string): string[] => {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/^\$+/, '');
  const matches = normalized.match(pathTokenPattern);
  if (!matches) {
    return [];
  }

  return matches
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const inner = segment.slice(1, -1).trim();
        if (inner.startsWith('"') && inner.endsWith('"')) {
          return inner.slice(1, -1);
        }
        if (inner.startsWith("'") && inner.endsWith("'")) {
          return inner.slice(1, -1);
        }
        if (inner === '') {
          return '[]';
        }
        return inner;
      }
      return segment;
    })
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
};

const resolvePathValue = (payload: unknown, path: string): unknown => {
  const segments = parsePathSegments(path);
  if (segments.length === 0) {
    return undefined;
  }

  const traverse = (value: unknown, index: number): unknown => {
    if (index >= segments.length) {
      return value;
    }

    const segment = segments[index];

    if (segment === '[]') {
      if (!Array.isArray(value)) {
        return undefined;
      }

      const results: unknown[] = [];
      value.forEach((item) => {
        const resolved = traverse(item, index + 1);
        if (resolved === undefined) {
          return;
        }
        if (Array.isArray(resolved)) {
          results.push(...resolved);
        } else {
          results.push(resolved);
        }
      });

      return results.length > 0 ? results : undefined;
    }

    if (Array.isArray(value)) {
      const numericIndex = Number(segment);
      if (!Number.isInteger(numericIndex) || numericIndex < 0) {
        return undefined;
      }
      return traverse(value[numericIndex], index + 1);
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const lookup = buildLookup(record);
      const nextValue = getValueFromRecord(record, lookup, [segment]);
      if (nextValue === undefined) {
        return undefined;
      }
      return traverse(nextValue, index + 1);
    }

    return undefined;
  };

  return traverse(payload, 0);
};

const applyExplicitFieldData = (
  field: FormField,
  value: unknown,
  valueOverride?: unknown
): { initialValue?: unknown; options?: SelectOption[] } => {
  if (field.type === 'select' && valueOverride !== undefined) {
    const options = buildSelectOptions(value, valueOverride);
    if (options.length > 0) {
      return { options };
    }
  }

  if (Array.isArray(value)) {
    if (field.type === 'select') {
      const options = normalizeOptions(value);
      if (options.length > 0) {
        return { options };
      }
    } else {
      for (const candidate of value) {
        const converted = convertInitialValue(field, candidate);
        if (converted !== undefined) {
          return { initialValue: converted };
        }
      }
    }
    return {};
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lookup = buildLookup(record);
    const explicitValue = getValueFromRecord(record, lookup, explicitValueKeys);
    const convertedExplicit = convertInitialValue(field, explicitValue);
    const result: { initialValue?: unknown; options?: SelectOption[] } = {};

    if (convertedExplicit !== undefined) {
      result.initialValue = convertedExplicit;
    } else {
      const fallback = convertInitialValue(field, record);
      if (fallback !== undefined) {
        result.initialValue = fallback;
      }
    }

    if (field.type === 'select') {
      const optionArray = getArrayValue(record, lookup, [
        'options',
        'values',
        'items',
        'list',
        'choices',
        'data',
      ]);
      if (optionArray && optionArray.length > 0) {
        const options = normalizeOptions(optionArray);
        if (options.length > 0) {
          result.options = options;
        }
      }
    }

    return result;
  }

  const converted = convertInitialValue(field, value);
  const result: { initialValue?: unknown; options?: SelectOption[] } = {};

  if (converted !== undefined) {
    result.initialValue = converted;
  }

  if (field.type === 'select' && typeof value === 'string') {
    const parts = value
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const options = normalizeOptions(parts);
      if (options.length > 0) {
        result.options = options;
      }
    }
  }

  return result;
};

const encodeBasicCredentials = (username: string, password: string) => {
  const value = `${username}:${password}`;

  const encodeBinary = (input: string) => {
    if (typeof btoa === 'function') {
      return btoa(input);
    }

    const bufferLike = (globalThis as unknown as {
      Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
    }).Buffer;

    if (bufferLike) {
      return bufferLike.from(input, 'binary').toString('base64');
    }

    throw new Error('Miljön saknar stöd för att koda uppgifter för grundläggande autentisering.');
  };

  if (typeof btoa === 'function') {
    try {
      return btoa(value);
    } catch (error) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(value);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return encodeBinary(binary);
    }
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return encodeBinary(binary);
};

export const buildAuthenticatedRequestInit = (
  authentication?: NodeAuthentication
): Pick<RequestInit, 'headers'> => {
  if (!authentication || authentication.type === 'none') {
    return {};
  }

  if (authentication.type === 'bearer') {
    const token = authentication.token.trim();
    if (!token) {
      return {};
    }
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  if (authentication.type === 'basic') {
    const username = authentication.username.trim();
    const password = authentication.password;
    if (!username && !password) {
      return {};
    }
    const encoded = encodeBasicCredentials(username, password);
    return { headers: { Authorization: `Basic ${encoded}` } };
  }

  if (authentication.type === 'api-key') {
    const header = authentication.header.trim();
    if (!header) {
      return {};
    }
    return { headers: { [header]: authentication.value } };
  }

  return {};
};

export async function loadExternalData(
  url: string,
  signal?: AbortSignal,
  authentication?: NodeAuthentication
): Promise<ExternalDataFetchResult> {
  try {
    const authInit = buildAuthenticatedRequestInit(authentication);
    const response = await fetch(url, { signal, ...authInit });
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
  const selectOptions: Record<string, SelectOption[]> = {};
  const initialValues: Record<string, unknown> = {};

  fields.forEach((field) => {
    const path = field.externalDataPath?.trim();
    if (!path) {
      return;
    }

    const valuePath = field.type === 'select' ? field.externalDataValuePath?.trim() : undefined;
    const valueOverride = valuePath ? resolvePathValue(payload, valuePath) : undefined;
    const scopedValue = resolvePathValue(payload, path);
    if (scopedValue === undefined && valueOverride === undefined) {
      return;
    }

    const { initialValue, options } = applyExplicitFieldData(
      field,
      scopedValue ?? valueOverride,
      valueOverride
    );

    if (initialValue !== undefined) {
      initialValues[field.id] = initialValue;
    }

    if (options && options.length > 0) {
      selectOptions[field.id] = options;
    }
  });

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
      if (aggregate.initialValue !== undefined && !(fieldId in initialValues)) {
        initialValues[fieldId] = aggregate.initialValue;
      }
      if (aggregate.options && aggregate.options.length > 0 && !(fieldId in selectOptions)) {
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
          .filter((field) => field.type === 'select' && !(field.id in selectOptions))
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
      if (initialValue !== undefined && !(field.id in initialValues)) {
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

        if (optionArray && !(field.id in selectOptions)) {
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
