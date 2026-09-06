-- Durable inbound queue for WhatsApp webhooks.
--
-- WhatsApp does not keep messages for you: Meta retries a failed delivery and
-- then drops it after 36 hours, with no replay API. This table is the queue we
-- control, so the Mac can be off for days without losing anything.

CREATE TABLE IF NOT EXISTS inbound_events (
  -- Meta's message id. Primary key, so a redelivery is a no-op insert rather
  -- than a duplicate that would register the same payment twice.
  id          TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  payload     TEXT NOT NULL,
  -- Null until the API has processed it. Rows are kept briefly after ack so a
  -- redelivery arriving late still collides with the primary key.
  acked_at    INTEGER
);

-- Drives the pending query: unacked rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_pending ON inbound_events (acked_at, received_at);
