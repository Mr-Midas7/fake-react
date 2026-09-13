-- Service pricing is now represented by services.price and optional
-- service_model_overrides. Remove the obsolete CC/fuel/transmission table.
DROP TABLE IF EXISTS public.service_configurations CASCADE;
