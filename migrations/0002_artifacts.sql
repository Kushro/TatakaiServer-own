CREATE TABLE IF NOT EXISTS server_artifacts (
  key TEXT PRIMARY KEY,
  chunks INTEGER NOT NULL CHECK(chunks > 0),
  bytes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS server_artifact_chunks (
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, ordinal),
  FOREIGN KEY (key) REFERENCES server_artifacts(key) ON DELETE CASCADE
);
