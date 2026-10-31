import { cookies, headers } from 'next/headers';
import { query, withTransaction } from '@/lib/db';

export const VISITOR_COOKIE_NAME = 'gmctl_vid';

const VISITOR_COLUMNS = 'id, anon_id, server_cookie_id, current_ip_hash, last_seen_at';

// Whitelist of lookup columns: key.kind is interpolated into SQL.
const LOOKUP_COLUMN: Record<VisitorLookupKey['kind'], string> = {
  server_cookie_id: 'server_cookie_id',
  anon_id: 'anon_id',
};

const UPDATABLE_COLUMNS = ['anon_id', 'server_cookie_id', 'current_ip_hash', 'last_seen_at'] as const;

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
  last_seen_at?: Date;
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
  const rows = await query<VisitorIdentity>(
    `SELECT ${VISITOR_COLUMNS} FROM visitor_identities WHERE ${LOOKUP_COLUMN[key.kind]} = $1 LIMIT 2`,
    [key.value],
  );

  if (rows.length > 1) {
    throw new Error(`Multiple visitor rows found for ${key.kind}`);
  }

  return rows;
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

function buildCanonicalVisitorUpdates(input: {
  canonical: VisitorIdentity;
  relatedVisitors: VisitorIdentity[];
  lookup: VisitorLookup;
  now: Date;
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
  // All-or-nothing: never leave rows pointing at a half-merged visitor.
  await withTransaction(async (client) => {
    for (const table of ['chat_messages', 'chat_usage_events', 'topic_moderation_events']) {
      await client.query(`UPDATE ${table} SET visitor_id = $1 WHERE visitor_id = $2`, [
        input.targetVisitorId,
        input.sourceVisitorId,
      ]);
    }
    await client.query('DELETE FROM visitor_identities WHERE id = $1', [input.sourceVisitorId]);
  });
}

async function insertVisitor(input: BuildVisitorLookupInput, now: Date) {
  const [row] = await query<VisitorIdentity>(
    `INSERT INTO visitor_identities (anon_id, server_cookie_id, current_ip_hash, last_seen_at)
     VALUES ($1, $2, $3, $4)
     RETURNING ${VISITOR_COLUMNS}`,
    [input.anonId ?? null, input.cookieId ?? null, input.ipHash, now],
  );
  return row;
}

async function updateVisitor(id: string, updates: Partial<VisitorIdentity>) {
  const columns = UPDATABLE_COLUMNS.filter((column) => updates[column] !== undefined);
  const assignments = columns.map((column, i) => `${column} = $${i + 2}`).join(', ');
  const [row] = await query<VisitorIdentity>(
    `UPDATE visitor_identities SET ${assignments} WHERE id = $1 RETURNING ${VISITOR_COLUMNS}`,
    [id, ...columns.map((column) => updates[column])],
  );
  if (!row) {
    throw new Error(`Visitor ${id} disappeared during update`);
  }
  return row;
}

export async function findVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);
  const visitors = await collectVisitorCandidates(lookup);
  return visitors[0] ?? null;
}

export async function resolveVisitorIdentity(input: BuildVisitorLookupInput) {
  const lookup = buildVisitorLookup(input);
  const now = new Date();
  let visitors = await collectVisitorCandidates(lookup);

  if (visitors.length === 0) {
    try {
      visitors = [await insertVisitor(input, now)];
    } catch (error) {
      // A concurrent request may have created it first (unique index hit).
      visitors = await collectVisitorCandidates(lookup);
      if (visitors.length === 0) {
        throw error;
      }
    }
  }

  const canonicalVisitor = visitors[0];
  for (const duplicateVisitor of visitors.slice(1)) {
    if (duplicateVisitor.id === canonicalVisitor.id) {
      continue;
    }

    await moveVisitorReferences({
      sourceVisitorId: duplicateVisitor.id,
      targetVisitorId: canonicalVisitor.id,
    });
  }

  // Diff against the row as stored, so identifiers inherited from merged
  // duplicates (via relatedVisitors) are actually written.
  const updates = buildCanonicalVisitorUpdates({
    canonical: canonicalVisitor,
    relatedVisitors: visitors,
    lookup,
    now,
  });

  return updateVisitor(canonicalVisitor.id, updates);
}
