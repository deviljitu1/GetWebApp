
-- 1) Prevent privilege escalation via profile self-update
CREATE OR REPLACE FUNCTION public.profiles_prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.employee_type IS DISTINCT FROM OLD.employee_type
       OR NEW.is_active   IS DISTINCT FROM OLD.is_active
       OR NEW.user_id     IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'You cannot modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_prevent_self_privilege_escalation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_self_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_self_privilege_escalation();

-- 2) Remove redundant/duplicate SELECT policies on messages
DROP POLICY IF EXISTS "View 1:1 Messages" ON public.messages;

-- 3) Switch admin-check helper functions to SECURITY INVOKER so signed-in users
--    cannot invoke elevated definer-owned code paths.
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_admin() SECURITY INVOKER;

-- Ensure authenticated role can still read user_roles for the check
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Lock down trigger-only definer functions (not user-callable)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_restrict_sender_update() FROM PUBLIC, anon, authenticated;
