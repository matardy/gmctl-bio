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
  lookupOrder: VisitorLookupKey[];
  ipHash: string | null;
}

export function buildVisitorLookup(input: BuildVisitorLookupInput): VisitorLookup {
  if (input.cookieId) {
    return {
      primary: { kind: 'server_cookie_id', value: input.cookieId },
      lookupOrder: input.anonId
        ? [
            { kind: 'server_cookie_id', value: input.cookieId },
            { kind: 'anon_id', value: input.anonId },
          ]
        : [{ kind: 'server_cookie_id', value: input.cookieId }],
      ipHash: input.ipHash,
    };
  }

  if (!input.anonId) {
    throw new Error('anonId or cookieId is required');
  }

  return {
    primary: { kind: 'anon_id', value: input.anonId },
    lookupOrder: [{ kind: 'anon_id', value: input.anonId }],
    ipHash: input.ipHash,
  };
}
