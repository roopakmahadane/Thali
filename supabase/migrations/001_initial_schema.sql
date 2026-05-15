-- ============================================================
-- 001_initial_schema.sql
-- ============================================================

-- updated_at auto-update function (shared by profiles + user_patterns)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT,
  age              INT,
  height_cm        INT,
  weight_kg        DECIMAL,
  gender           TEXT,
  activity_level   TEXT,
  goal             TEXT,
  target_weight_kg DECIMAL,
  timeline_weeks   INT,
  diet_type        TEXT,
  allergies        TEXT,
  daily_calories   INT,
  daily_protein_g  INT,
  daily_carbs_g    INT,
  daily_fat_g      INT,
  daily_fiber_g    INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own rows only" ON profiles
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- meals
-- ============================================================
CREATE TABLE meals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url        TEXT,
  meal_type        TEXT NOT NULL CHECK (meal_type IN ('breakfast','morning_snack','lunch','evening_snack','dinner')),
  eaten_at         TIMESTAMPTZ,
  total_calories   INT,
  total_protein_g  DECIMAL,
  total_carbs_g    DECIMAL,
  total_fat_g      DECIMAL,
  total_fiber_g    DECIMAL,
  total_sodium_mg  DECIMAL,
  total_iron_mg    DECIMAL,
  total_calcium_mg DECIMAL,
  ai_notes         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meals_user_id_eaten_at ON meals (user_id, eaten_at DESC);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meals: own rows only" ON meals
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- meal_items
-- ============================================================
CREATE TABLE meal_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id     UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  item_name   TEXT NOT NULL,
  quantity    DECIMAL,
  unit        TEXT,
  calories    INT,
  protein_g   DECIMAL,
  carbs_g     DECIMAL,
  fat_g       DECIMAL,
  fiber_g     DECIMAL,
  sodium_mg   DECIMAL,
  source      TEXT CHECK (source IN ('ai','manual','library')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;

-- meal_items has no direct user_id; guard via parent meal
CREATE POLICY "meal_items: own rows only" ON meal_items
  USING (
    EXISTS (
      SELECT 1 FROM meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  );

-- ============================================================
-- frequent_foods
-- ============================================================
CREATE TABLE frequent_foods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  typical_quantity    DECIMAL,
  typical_unit        TEXT,
  macros_per_unit_json JSONB,
  times_logged        INT NOT NULL DEFAULT 0,
  last_logged_at      TIMESTAMPTZ,
  confirmed           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE frequent_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frequent_foods: own rows only" ON frequent_foods
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- user_patterns
-- ============================================================
CREATE TABLE user_patterns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_text TEXT NOT NULL,
  category     TEXT CHECK (category IN ('preference','portion','time','restriction')),
  confidence   TEXT CHECK (confidence IN ('low','medium','high')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_patterns_updated_at
  BEFORE UPDATE ON user_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_patterns: own rows only" ON user_patterns
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- weight_logs
-- ============================================================
CREATE TABLE weight_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg  DECIMAL NOT NULL,
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weight_logs: own rows only" ON weight_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- daily_summaries
-- ============================================================
CREATE TABLE daily_summaries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date               DATE NOT NULL,
  calories_consumed  INT NOT NULL DEFAULT 0,
  protein_g          DECIMAL NOT NULL DEFAULT 0,
  carbs_g            DECIMAL NOT NULL DEFAULT 0,
  fat_g              DECIMAL NOT NULL DEFAULT 0,
  calories_target    INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX idx_daily_summaries_user_id_date ON daily_summaries (user_id, date);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_summaries: own rows only" ON daily_summaries
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
