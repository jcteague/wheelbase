CREATE TABLE credential_settings (
  vendor                 TEXT NOT NULL,
  environment            TEXT NOT NULL,
  key_id_encrypted       BLOB NOT NULL,
  secret_encrypted       BLOB NOT NULL,
  last_verified_at       TEXT,
  account_number_masked  TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  PRIMARY KEY (vendor, environment)
);

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
