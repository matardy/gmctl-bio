import { cookies, headers } from 'next/headers';
import { supabase } from '@/lib/supabase';

export const VISITOR_COOKIE_NAME = 'gmctl_vid';

const VISITOR_SELECT = 'id, anon_id, server_cookie_id, current_ip_hash, last_seen_at';

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

  const encodedIp = new TextEncoder().encode(rawIp);
  const digest = await crypto.subtle.digest('SHA-256', encodedIp);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getOrCreateVisitorCookieId(): Promise<VisitorCookieResult> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE_NAME)?.value ?? null;

  if (existing) {
    return { value: existing, isNew: false };
  }

  const value = crypto.randomUUID();
  cookieStore.set(VISITOR_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });

  return { value, isNew: true };
}

async function queryVisitorsByKey(key: VisitorLookupKey) {
  const { data, error } = await supabase
    .from('visitor_identities')
    .select(VISITOR_SELECT)
    .eq(key.kind, key.value)
    .limit(2);

  if (error) {
    throw error;
  }

  if ((data?.length ?? 0) > 1) {
    throw new Error(`Multiple visitor rows found for ${key.kind}`);
  }

  return (data ?? []) as VisitorIdentity[];
}

async function collectVisitorCandidates(lookup: VisitorLookup) {
  const visitors: VisitorIdentity[] = [];
  const seenIds = new Set<string>();

  for (const key of getVisitorLookupSequence(lookup)) {
    const visitor = (await queryVisitorsByKey(key))[0];
    if (!visitor || seenIds.has(visitor.id)) {
      continue;
    }

    seenIds.add(visitor.id);
    visitors.push(visitor);
  }

  return visitors;
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

function buildCanonicalVisitorUpdates(input: {
  canonical: VisitorIdentity;
  relatedVisitors: VisitorIdentity[];
  lookup: VisitorLookup;
  now: string;
}) {
  const { canonical, relatedVisitors, lookup, now } = input;
  const updates: Partial<VisitorIdentity> = {
    last_seen_at: now,
  };

  const relatedAnonId =
    lookup.secondary.find((key) => key.kind === 'anon_id')?.value ??
    canonical.anon_id ??
    relatedVisitors.find((visitor) => visitor.anon_id)?.anon_id ??
    null;

  const relatedCookieId =
    lookup.primary.kind === 'server_cookie_id'
      ? lookup.primary.value
      : canonical.server_cookie_id ??
        relatedVisitors.find((visitor) => visitor.server_cookie_id)?.server_cookie_id ??
        null;

  const relatedIpHash =
    lookup.ipHash ??
    canonical.current_ip_hash ??
    relatedVisitors.find((visitor) => visitor.current_ip_hash)?.current_ip_hash ??
    null;

  if (relatedAnonId && canonical.anon_id !== relatedAnonId) {
    updates.anon_id = relatedAnonId;
  }

  if (relatedCookieId && canonical.server_cookie_id !== relatedCookieId) {
    updates.server_cookie_id = relatedCookieId;
  }

  if (relatedIpHash && canonical.current_ip_hash !== relatedIpHash) {
    updates.current_ip_hash = relatedIpHash;
  }

  return updates;
}

async function moveVisitorReferences(input: {
  sourceVisitorId: string;
  targetVisitorId: string;
}) {
  const tables = ['chat_messages', 'chat_usage_events', 'topic_moderation_events'] as const;

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .update({ visitor_id: input.targetVisitorId })
      .eq('visitor_id', input.sourceVisitorId);

    if (error) {
      throw error;
    }
  }

  const { error } = await supabase
    .from('visitor_identities')
    .delete()
    .eq('id', input.sourceVisitorId);

  if (error) {
    throw error;
  }
}

export async function findVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);
  const visitors = await collectVisitorCandidates(lookup);
  return visitors[0] ?? null;
}

export async function resolveVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);
  const now = new Date().toISOString();
  let visitors = await collectVisitorCandidates(lookup);

  if (visitors.length === 0) {
    const { data, error } = await supabase
      .from('visitor_identities')
      .insert({
        anon_id: input.anonId ?? null,
        server_cookie_id: input.cookieId ?? null,
        current_ip_hash: input.ipHash,
        last_seen_at: now,
      })
      .select(VISITOR_SELECT)
      .single();

    if (error) {
      visitors = await collectVisitorCandidates(lookup);
      if (visitors.length === 0) {
        throw error;
      }
    } else {
      visitors = [data as VisitorIdentity];
    }
  }

  let canonicalVisitor = visitors[0];
  for (const duplicateVisitor of visitors.slice(1)) {
    if (duplicateVisitor.id === canonicalVisitor.id) {
      continue;
    }

    await moveVisitorReferences({
      sourceVisitorId: duplicateVisitor.id,
      targetVisitorId: canonicalVisitor.id,
    });

    canonicalVisitor = mergeVisitorIdentity(canonicalVisitor, {
      anon_id: canonicalVisitor.anon_id ?? duplicateVisitor.anon_id,
      server_cookie_id: canonicalVisitor.server_cookie_id ?? duplicateVisitor.server_cookie_id,
      current_ip_hash: canonicalVisitor.current_ip_hash ?? duplicateVisitor.current_ip_hash,
    });
  }

  const updates = buildCanonicalVisitorUpdates({
    canonical: canonicalVisitor,
    relatedVisitors: visitors,
    lookup,
    now,
  });

  if (Object.keys(updates).length === 1 && updates.last_seen_at) {
    const { error } = await supabase
      .from('visitor_identities')
      .update({ last_seen_at: updates.last_seen_at })
      .eq('id', canonicalVisitor.id);

    if (error) {
      throw error;
    }

    return mergeVisitorIdentity(canonicalVisitor, updates);
  }

  const { data, error } = await supabase
    .from('visitor_identities')
    .update(updates)
    .eq('id', canonicalVisitor.id)
    .select(VISITOR_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as VisitorIdentity;
}
