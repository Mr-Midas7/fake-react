import { supabase } from "@/integrations/supabase/client";

type AdminActivityEvent = {
  action: string;
  resourceType: string;
  targetLabel: string;
  summary: string;
  changedFields?: string[];
};

/**
 * Records non-mutating, security-relevant admin actions. Database triggers
 * record create/update/archive/delete actions separately.
 */
export async function recordAdminActivityEvent(event: AdminActivityEvent) {
  const { error } = await supabase.rpc("record_admin_activity_event", {
    p_action: event.action,
    p_resource_type: event.resourceType,
    p_target_label: event.targetLabel,
    p_summary: event.summary,
    p_changed_fields: event.changedFields ?? [],
  });

  if (error) throw error;
}
