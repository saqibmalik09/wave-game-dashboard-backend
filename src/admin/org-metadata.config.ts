export type OrgBillingMeta = {
  appKey?: string | null;
  testingAppKey?: string | null;
  one_dollar_gold_coins?: number;
  organization_profit_percent?: number;
  company_profit_percent?: number;
  nick_name?: string;
};

/** Extend per organization — keyed by master Organization.id */
export const ORG_BILLING_BY_ID: Record<number, OrgBillingMeta> = {
  // Example: map org id → production/testing app keys and billing defaults
};

/** Fallback keyed by production appKey */
export const APP_KEY_BILLING_META: Record<string, OrgBillingMeta> = {
  Eeb1GshW3a: {
    appKey: 'Eeb1GshW3a',
    testingAppKey: 'Eeb1GshW3a',
    one_dollar_gold_coins: 10000,
    organization_profit_percent: 80,
    company_profit_percent: 20,
    nick_name: 'Ricolive',
  },
  b1K7dw2MZ3: {
    appKey: 'b1K7dw2MZ3',
    testingAppKey: 'b1K7dw2MZ3',
    one_dollar_gold_coins: 10000,
    organization_profit_percent: 80,
    company_profit_percent: 20,
    nick_name: 'Banolive',
  },
  '2FUSmZfG0A': {
    appKey: '2FUSmZfG0A',
    testingAppKey: '2FUSmZfG0A',
    one_dollar_gold_coins: 10000,
    organization_profit_percent: 80,
    company_profit_percent: 20,
    nick_name: 'Fruity',
  },
  '19IPz3JRgw': {
    appKey: '19IPz3JRgw',
    testingAppKey: '19IPz3JRgw',
    one_dollar_gold_coins: 10000,
    organization_profit_percent: 80,
    company_profit_percent: 20,
  },
};

const DEFAULT_META: OrgBillingMeta = {
  one_dollar_gold_coins: 10000,
  organization_profit_percent: 80,
  company_profit_percent: 20,
};

export function enrichOrganization<T extends { id: number; name: string; email: string }>(
  org: T,
): T & OrgBillingMeta {
  const byId = ORG_BILLING_BY_ID[org.id];
  if (byId) {
    return { ...DEFAULT_META, ...org, ...byId };
  }

  const emailKey = Object.entries(APP_KEY_BILLING_META).find(
    ([, meta]) => meta.nick_name && org.name.toLowerCase().includes(String(meta.nick_name).toLowerCase()),
  );
  if (emailKey) {
    return { ...DEFAULT_META, ...org, ...emailKey[1] };
  }

  return { ...DEFAULT_META, ...org, appKey: null, testingAppKey: null };
}

export function resolveAppKeysForOrg(
  org: { id: number; name: string; email: string } & OrgBillingMeta,
  mode: 'production' | 'testing' | 'both',
): string[] {
  const keys = new Set<string>();
  if (mode === 'production' || mode === 'both') {
    if (org.appKey) keys.add(org.appKey);
  }
  if (mode === 'testing' || mode === 'both') {
    if (org.testingAppKey) keys.add(org.testingAppKey);
  }
  return [...keys];
}
