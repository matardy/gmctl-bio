-- Generative UI: tool calls made during an assistant turn (e.g. navigate ->
-- section card), stored as [{ "id", "name", "args" }] so the chat can
-- re-render those cards after a reload or history resume.
-- NULL when the turn made no tool calls.
ALTER TABLE chat_messages ADD COLUMN tool_calls jsonb;
