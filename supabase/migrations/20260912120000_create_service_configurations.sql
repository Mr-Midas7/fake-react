-- Service rules allow the admin to price and time work by motorcycle attributes.
CREATE TABLE public.service_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  cc_category text NOT NULL,
  fuel_type text NOT NULL,
  transmission text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_configurations_service_id_idx ON public.service_configurations (service_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_configurations TO authenticated;
GRANT ALL ON public.service_configurations TO service_role;

ALTER TABLE public.service_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service configurations admin all" ON public.service_configurations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER service_configurations_updated
  BEFORE UPDATE ON public.service_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Model overrides are service-level adjustments that take precedence over the
-- applicable configuration for a particular brand and model.
CREATE TABLE public.service_model_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, brand, model)
);

CREATE INDEX service_model_overrides_service_id_idx ON public.service_model_overrides (service_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_model_overrides TO authenticated;
GRANT ALL ON public.service_model_overrides TO service_role;

ALTER TABLE public.service_model_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service model overrides admin all" ON public.service_model_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER service_model_overrides_updated
  BEFORE UPDATE ON public.service_model_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Include configuration edits in the existing admin activity trail.
CREATE TRIGGER admin_activity_service_configurations
  AFTER INSERT OR UPDATE OR DELETE ON public.service_configurations
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

CREATE TRIGGER admin_activity_service_model_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.service_model_overrides
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();
