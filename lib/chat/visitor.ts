export const VISITOR_COOKIE_NAME = 'gmctl_vid';

export interface BuildVisitorLookupInput {
  anonId: string | null;
  cookieId: string | null;
  ipHash: string | null;
}

export interface VisitorLookupKey {
  kind: 'server_cookie_id' | 'anon_id';
  value: string;
}

export interface VisitorLookup {
  primary: VisitorLookupKey;
  secondary: VisitorLookupKey[];
  ipHash: string | null;
}

export function getVisitorLookupSequence(lookup: VisitorLookup): VisitorLookupKey[] {
  return [lookup.primary, ...lookup.secondary];
}

export function buildVisitorLookup(input: BuildVisitorLookupInput): VisitorLookup {
  if (input.cookieId) {
    return {
      primary: { kind: 'server_cookie_id', value: input.cookieId },
      secondary: input.anonId ? [{ kind: 'anon_id', value: input.anonId }] : [],
      ipHash: input.ipHash,
    };
  }

  if (!input.anonId) {
    throw new Error('anonId or cookieId is required');
  }

  return {
    primary: { kind: 'anon_id', value: input.anonId },
    secondary: [],
    ipHash: input.ipHash,
  };
}
