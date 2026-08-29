-- Travexa schema. Apply with:  psql "$DATABASE_URL" -f server/db/schema.sql
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- guides
CREATE TABLE IF NOT EXISTS guides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT        NOT NULL,
  email             TEXT        NOT NULL UNIQUE,
  phone             TEXT,
  password_hash     TEXT        NOT NULL,
  city              TEXT,
  -- Last known position, used for tourist/guide distance matching.
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  languages         TEXT[]      NOT NULL DEFAULT '{}',
  specialties       TEXT[]      NOT NULL DEFAULT '{}',
  areas             TEXT[]      NOT NULL DEFAULT '{}',
  years_experience  INTEGER     NOT NULL DEFAULT 0,
  bio               TEXT,
  hourly_rate_paise BIGINT      NOT NULL DEFAULT 0,   -- integer minor units
  currency          TEXT        NOT NULL DEFAULT 'INR',
  photo_path        TEXT,
  -- Never set to 'verified' by the guide or by any client request.
  verification      TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (verification IN ('pending','verified','rejected')),
  verified_at       TIMESTAMPTZ,
  availability      TEXT        NOT NULL DEFAULT 'offline'
                    CHECK (availability IN ('available','busy','offline')),
  -- Razorpay Route sub-account, required before any payout can be sent.
  razorpay_account_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guides_availability_idx ON guides (availability);
CREATE INDEX IF NOT EXISTS guides_city_idx ON guides (lower(city));

-- Identity documents. Only the path is stored; files live outside the web root
-- and are never served statically.
CREATE TABLE IF NOT EXISTS guide_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('government_id','certification','experience_proof','photo')),
  stored_path TEXT NOT NULL,
  mime_type   TEXT,
  byte_size   BIGINT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','accepted','rejected')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_documents_guide_idx ON guide_documents (guide_id);

-- ------------------------------------------------------------- bookings
-- The booking state machine. Server-side transitions only; a client can
-- request a transition but never assert one.
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id        UUID NOT NULL REFERENCES guides(id) ON DELETE RESTRICT,
  -- Tourists are not accounts yet; a browser-scoped id keeps bookings apart.
  tourist_ref     TEXT NOT NULL,
  tourist_name    TEXT,
  tourist_lat     DOUBLE PRECISION,
  tourist_lng     DOUBLE PRECISION,
  meeting_note    TEXT,
  hours           NUMERIC(4,1) NOT NULL DEFAULT 1,
  amount_paise    BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  status          TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                    'REQUESTED','ACCEPTED','PAYMENT_AUTHORIZED','IN_PROGRESS',
                    'COMPLETED','PAYOUT_RELEASED','CANCELLED','DECLINED',
                    'REFUNDED','DISPUTED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_guide_idx   ON bookings (guide_id, status);
CREATE INDEX IF NOT EXISTS bookings_tourist_idx ON bookings (tourist_ref);

-- Append-only audit of every state change, so payout disputes are traceable.
CREATE TABLE IF NOT EXISTS booking_events (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,            -- 'tourist' | 'guide' | 'system' | 'webhook'
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events (booking_id, id);

-- -------------------------------------------------------------- payments
-- Mirrors Razorpay state. Nothing here is trusted unless it came from a
-- signature-verified callback or webhook.
CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  razorpay_order_id    TEXT UNIQUE,
  razorpay_payment_id  TEXT,
  razorpay_signature   TEXT,
  transfer_id          TEXT,            -- Razorpay Route transfer to the guide
  amount_paise         BIGINT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'INR',
  status               TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
                         'created','authorized','captured','on_hold',
                         'released','refunded','failed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);

-- --------------------------------------------------------------- ratings
-- One rating per booking, and only for a booking that actually completed.
CREATE TABLE IF NOT EXISTS ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  guide_id   UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ratings_guide_idx ON ratings (guide_id);

-- Aggregate rating per guide, computed from real completed bookings only.
CREATE OR REPLACE VIEW guide_ratings AS
  SELECT g.id AS guide_id,
         ROUND(AVG(r.stars)::numeric, 1) AS avg_stars,
         COUNT(r.id)                     AS review_count,
         COUNT(DISTINCT b.id) FILTER (
           WHERE b.status IN ('COMPLETED','PAYOUT_RELEASED')
         )                               AS completed_trips
    FROM guides g
    LEFT JOIN ratings  r ON r.guide_id = g.id
    LEFT JOIN bookings b ON b.guide_id = g.id
   GROUP BY g.id;
