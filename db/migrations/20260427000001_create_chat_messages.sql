CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id text NOT NULL,
  session_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fetch history for a returning visitor, most-recent-first
CREATE INDEX idx_chat_messages_anon_id ON chat_messages(anon_id, created_at DESC);

-- Reconstruct a single session in chronological order
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id, created_at ASC);

-- All writes go through the server using the service role key; no client access needed
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
