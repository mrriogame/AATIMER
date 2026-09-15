-- AATIMER prep (no sync): tasks columns + signup defaults
-- Apply in Supabase Dashboard → SQL Editor (service role).
-- Safe to re-run: checks columns / constraints before ALTER.

-- ---------------------------------------------------------------------------
-- 1) public.tasks — fields required by LocalStorage tracker
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.tasks
      ADD COLUMN kind text NOT NULL DEFAULT 'plain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'quest_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN quest_id text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'event_name'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN event_name text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN completed_at timestamptz NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_kind_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_kind_check
      CHECK (kind IN ('event', 'daily', 'weekly', 'plain'));
  END IF;
END $$;

COMMENT ON COLUMN public.tasks.kind IS 'event | daily | weekly | plain';
COMMENT ON COLUMN public.tasks.quest_id IS 'Catalog id from dailies.json / weeklies.json';
COMMENT ON COLUMN public.tasks.event_name IS 'Snapshot of event title at create time';
COMMENT ON COLUMN public.tasks.completed_at IS 'Used for daily 24h / weekly MSK reset logic';

-- ---------------------------------------------------------------------------
-- 2) public.task_lists.is_default — single canonical default list per user
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'task_lists' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE public.task_lists
      ADD COLUMN is_default boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS task_lists_one_default_per_user
  ON public.task_lists (user_id)
  WHERE is_default = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) public.profiles.guest_merged_at — future guest→auth merge flag
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'guest_merged_at'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN guest_merged_at timestamptz NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) handle_new_user — profiles + user_settings + default task_list
--    Single source of truth for cloud default list («Мои задачи»).
--    Client ensureDefaultList remains guest/local-namespace UX until sync.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Exactly one active default list for this user
  IF NOT EXISTS (
    SELECT 1
    FROM public.task_lists tl
    WHERE tl.user_id = NEW.id
      AND tl.is_default = true
      AND tl.deleted_at IS NULL
  ) THEN
    INSERT INTO public.task_lists (id, user_id, name, sort_order, is_default)
    VALUES (gen_random_uuid(), NEW.id, 'Мои задачи', 0, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5) Backfill: existing users without an active default list
-- ---------------------------------------------------------------------------

INSERT INTO public.task_lists (id, user_id, name, sort_order, is_default)
SELECT gen_random_uuid(), p.id, 'Мои задачи', 0, true
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.task_lists tl
  WHERE tl.user_id = p.id
    AND tl.is_default = true
    AND tl.deleted_at IS NULL
);
