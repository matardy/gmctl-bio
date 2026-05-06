import { createHash, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { supabase } from '@/lib/supabase';

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

export interface VisitorIdentity {
  id: string;
  anon_id: string | null;
  server_cookie_id: string | null;
  current_ip_hash: string | null;
  last_seen_at?: string;
}

export interface VisitorCookieResult {
  value: string;
  isNew: boolean;
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

export async function getRequestIpHash() {
  const headerStore = await headers();
  const rawIp =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip')?.trim() ??
    headerStore.get('cf-connecting-ip')?.trim() ??
    null;

  if (!rawIp) {
    return null;
  }

  return createHash('sha256').update(rawIp).digest('hex');
}

export async function getOrCreateVisitorCookieId(): Promise<VisitorCookieResult> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE_NAME)?.value ?? null;

  if (existing) {
    return { value: existing, isNew: false };
  }

  const value = randomUUID();
  cookieStore.set(VISITOR_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });

  return { value, isNew: true };
}

async function findVisitorByKey(key: VisitorLookupKey) {
  const { data, error } = await supabase
    .from('visitor_identities')
    .select('id, anon_id, server_cookie_id, current_ip_hash, last_seen_at')
    .eq(key.kind, key.value)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] as VisitorIdentity | undefined) ?? null;
}

function mergeVisitorIdentity(
  visitor: VisitorIdentity,
  updates: Partial<VisitorIdentity>,
): VisitorIdentity {
  return {
    ...visitor,
    ...updates,
  };
}

export async function findVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);

  for (const key of getVisitorLookupSequence(lookup)) {
    const visitor = await findVisitorByKey(key);
    if (visitor) {
      return visitor;
    }
  }

  return null;
}

export async function resolveVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);
  const now = new Date().toISOString();
  let visitor: VisitorIdentity | null = null;

  for (const key of getVisitorLookupSequence(lookup)) {
    visitor = await findVisitorByKey(key);
    if (visitor) {
      break;
    }
  }

  if (!visitor) {
    const { data, error } = await supabase
      .from('visitor_identities')
      .insert({
        anon_id: input.anonId ?? null,
        server_cookie_id: input.cookieId ?? null,
        current_ip_hash: input.ipHash,
        last_seen_at: now,
      })
      .select('id, anon_id, server_cookie_id, current_ip_hash, last_seen_at')
      .single();

    if (error) {
      const existingVisitor = await findVisitorIdentity(input);
      if (existingVisitor) {
        return existingVisitor;
      }

      throw error;
    }

    return data as VisitorIdentity;
  }

  const updates: Partial<VisitorIdentity> = {
    last_seen_at: now,
  };

  if (lookup.ipHash && visitor.current_ip_hash !== lookup.ipHash) {
    updates.current_ip_hash = lookup.ipHash;
  }

  for (const key of getVisitorLookupSequence(lookup)) {
    if (visitor[key.kind] === key.value || visitor[key.kind] != null) {
      continue;
    }

    const conflictingVisitor = await findVisitorByKey(key);
    if (conflictingVisitor && conflictingVisitor.id !== visitor.id) {
      continue;
    }

    updates[key.kind] = key.value;
  }

  if (Object.keys(updates).length === 1 && updates.last_seen_at) {
    const { error } = await supabase
      .from('visitor_identities')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', visitor.id);

    if (error) {
      throw error;
    }

    return mergeVisitorIdentity(visitor, updates);
  }

  const { data, error } = await supabase
    .from('visitor_identities')
    .update(updates)
    .eq('id', visitor.id)
    .select('id, anon_id, server_cookie_id, current_ip_hash, last_seen_at')
    .single();

  if (error) {
    throw error;
  }

  return data as VisitorIdentity;
}
