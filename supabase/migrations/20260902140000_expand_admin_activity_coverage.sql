-- Cover supporting records that can also be changed from administrator tools.
DROP TRIGGER IF EXISTS admin_activity_appointment_services ON public.appointment_services;
CREATE TRIGGER admin_activity_appointment_services
  AFTER INSERT OR UPDATE OR DELETE ON public.appointment_services
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_user_roles ON public.user_roles;
CREATE TRIGGER admin_activity_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();
