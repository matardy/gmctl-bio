CREATE TABLE visitor_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id text,
  server_cookie_id text,
  current_ip_hash text,
  risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_visitor_identities_server_cookie_id
  ON visitor_identities(server_cookie_id)
  WHERE server_cookie_id IS NOT NULL;

CREATE INDEX idx_visitor_identities_anon_id
  ON visitor_identities(anon_id)
  WHERE anon_id IS NOT NULL;

ALTER TABLE chat_messages
  ADD COLUMN visitor_id uuid REFERENCES visitor_identities(id);

CREATE INDEX idx_chat_messages_visitor_id_created_at
  ON chat_messages(visitor_id, created_at DESC);

CREATE TABLE chat_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES visitor_identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('user_input', 'assistant_output', 'moderator_check', 'blocked_response')),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_usage_events_visitor_id_created_at
  ON chat_usage_events(visitor_id, created_at DESC);

CREATE INDEX idx_chat_usage_events_session_id_created_at
  ON chat_usage_events(session_id, created_at DESC);

CREATE TABLE topic_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES visitor_identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  checked_after_user_message_count integer NOT NULL CHECK (checked_after_user_message_count > 0),
  verdict text NOT NULL CHECK (verdict IN ('allow', 'warn', 'block', 'error')),
  reason_code text NOT NULL,
  raw_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_topic_moderation_events_visitor_id_created_at
  ON topic_moderation_events(visitor_id, created_at DESC);

ALTER TABLE visitor_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_moderation_events ENABLE ROW LEVEL SECURITY;
