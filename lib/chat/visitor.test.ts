import { describe, expect, it } from 'vitest';
import { buildVisitorLookup, getVisitorLookupSequence } from './visitor';

describe('buildVisitorLookup', () => {
  it('prefers a server cookie id when available', () => {
    const lookup = buildVisitorLookup({
      anonId: 'anon-1',
      cookieId: 'cookie-1',
      ipHash: 'ip-1',
    });

    expect(lookup.primary.kind).toBe('server_cookie_id');
    expect(lookup.primary.value).toBe('cookie-1');
    expect(lookup.secondary).toEqual([{ kind: 'anon_id', value: 'anon-1' }]);
    expect(getVisitorLookupSequence(lookup)).toEqual([
      { kind: 'server_cookie_id', value: 'cookie-1' },
      { kind: 'anon_id', value: 'anon-1' },
    ]);
  });

  it('falls back to anon id when there is no cookie', () => {
    const lookup = buildVisitorLookup({
      anonId: 'anon-1',
      cookieId: null,
      ipHash: 'ip-1',
    });

    expect(lookup.primary.kind).toBe('anon_id');
    expect(lookup.secondary).toEqual([]);
    expect(getVisitorLookupSequence(lookup)).toEqual([{ kind: 'anon_id', value: 'anon-1' }]);
  });
});
