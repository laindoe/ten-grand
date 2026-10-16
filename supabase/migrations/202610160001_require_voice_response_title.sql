-- Require titles on new submissions and title changes without affecting
-- moderation updates to older entries that were submitted without a title.
BEGIN;
CREATE OR REPLACE FUNCTION public.require_voice_response_title()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.response_title IS NULL OR NEW.response_title !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'A response title is required.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS voices_require_response_title ON public.voices_heard;
CREATE TRIGGER voices_require_response_title
BEFORE INSERT OR UPDATE OF response_title ON public.voices_heard
FOR EACH ROW EXECUTE FUNCTION public.require_voice_response_title();
COMMIT;
