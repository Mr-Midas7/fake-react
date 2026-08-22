export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointment_services: {
        Row: {
          appointment_id: string;
          id: string;
          price: number;
          service_id: string | null;
          service_name: string;
        };
        Insert: {
          appointment_id: string;
          id?: string;
          price?: number;
          service_id?: string | null;
          service_name: string;
        };
        Update: {
          appointment_id?: string;
          id?: string;
          price?: number;
          service_id?: string | null;
          service_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          admin_notes: string | null;
          appointment_date: string;
          assigned_crew_id: string | null;
          cancelled_at: string | null;
          created_at: string;
          customer_name: string;
          email: string | null;
          id: string;
          is_archived: boolean;
          moto_brand: string;
          moto_model: string;
          moto_variant: string | null;
          moto_year: number | null;
          notes: string | null;
          phone: string;
          plate_number: string;
          reference_code: string;
          start_time: string;
          status: string;
          terms_accepted: boolean;
          total_estimate: number;
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          appointment_date: string;
          assigned_crew_id?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          customer_name: string;
          email?: string | null;
          id?: string;
          is_archived?: boolean;
          moto_brand: string;
          moto_model: string;
          moto_variant?: string | null;
          moto_year?: number | null;
          notes?: string | null;
          phone: string;
          plate_number: string;
          reference_code: string;
          start_time: string;
          status?: string;
          terms_accepted?: boolean;
          total_estimate?: number;
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          appointment_date?: string;
          assigned_crew_id?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          customer_name?: string;
          email?: string | null;
          id?: string;
          is_archived?: boolean;
          moto_brand?: string;
          moto_model?: string;
          moto_variant?: string | null;
          moto_year?: number | null;
          notes?: string | null;
          phone?: string;
          plate_number?: string;
          reference_code?: string;
          start_time?: string;
          status?: string;
          terms_accepted?: boolean;
          total_estimate?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_crew_id_fkey";
            columns: ["assigned_crew_id"];
            isOneToOne: false;
            referencedRelation: "crew_members";
            referencedColumns: ["id"];
          },
        ];
      };
      blocked_numbers: {
        Row: {
          id: string;
          phone: string;
          reason: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          phone: string;
          reason?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          phone?: string;
          reason?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      crew_availability_exceptions: {
        Row: {
          created_at: string;
          crew_id: string;
          end_date: string;
          end_time: string | null;
          id: string;
          is_all_day: boolean;
          note: string | null;
          reason: string;
          start_date: string;
          start_time: string | null;
        };
        Insert: {
          created_at?: string;
          crew_id: string;
          end_date: string;
          end_time?: string | null;
          id?: string;
          is_all_day?: boolean;
          note?: string | null;
          reason: string;
          start_date: string;
          start_time?: string | null;
        };
        Update: {
          created_at?: string;
          crew_id?: string;
          end_date?: string;
          end_time?: string | null;
          id?: string;
          is_all_day?: boolean;
          note?: string | null;
          reason?: string;
          start_date?: string;
          start_time?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crew_availability_exceptions_crew_id_fkey";
            columns: ["crew_id"];
            isOneToOne: false;
            referencedRelation: "crew_members";
            referencedColumns: ["id"];
          },
        ];
      };
      crew_members: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          phone: string | null;
          role: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          phone?: string | null;
          role?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          phone?: string | null;
          role?: string;
        };
        Relationships: [];
      };
      crew_schedules: {
        Row: {
          created_at: string;
          crew_id: string;
          day_of_week: number;
          effective_from: string | null;
          effective_to: string | null;
          end_time: string | null;
          id: string;
          is_working: boolean;
          note: string | null;
          schedule_date: string | null;
          start_time: string | null;
        };
        Insert: {
          created_at?: string;
          crew_id: string;
          day_of_week: number;
          effective_from?: string | null;
          effective_to?: string | null;
          end_time?: string | null;
          id?: string;
          is_working?: boolean;
          note?: string | null;
          schedule_date?: string | null;
          start_time?: string | null;
        };
        Update: {
          created_at?: string;
          crew_id?: string;
          day_of_week?: number;
          effective_from?: string | null;
          effective_to?: string | null;
          end_time?: string | null;
          id?: string;
          is_working?: boolean;
          note?: string | null;
          schedule_date?: string | null;
          start_time?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crew_schedules_crew_id_fkey";
            columns: ["crew_id"];
            isOneToOne: false;
            referencedRelation: "crew_members";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          appointment_id: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          message: string | null;
          title: string;
          type: string;
        };
        Insert: {
          appointment_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          title: string;
          type?: string;
        };
        Update: {
          appointment_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      price_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          id: string;
          item_id: string;
          item_name: string;
          new_price: number;
          old_price: number;
          reason: string | null;
          table_name: string;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          item_id: string;
          item_name: string;
          new_price: number;
          old_price: number;
          reason?: string | null;
          table_name: string;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string;
          item_name?: string;
          new_price?: number;
          old_price?: number;
          reason?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          brand: string | null;
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          in_stock: boolean;
          is_active: boolean;
          is_featured: boolean;
          name: string;
          price: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          brand?: string | null;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          in_stock?: boolean;
          is_active?: boolean;
          is_featured?: boolean;
          name: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          brand?: string | null;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          in_stock?: boolean;
          is_active?: boolean;
          is_featured?: boolean;
          name?: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedule_blocks: {
        Row: {
          block_date: string;
          created_at: string;
          id: string;
          is_active: boolean;
          reason: string | null;
          start_time: string | null;
        };
        Insert: {
          block_date: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          reason?: string | null;
          start_time?: string | null;
        };
        Update: {
          block_date?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          reason?: string | null;
          start_time?: string | null;
        };
        Relationships: [];
      };
      services: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          price: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      time_slots: {
        Row: {
          capacity: number;
          created_at: string;
          end_time: string;
          id: string;
          is_active: boolean;
          start_time: string;
        };
        Insert: {
          capacity?: number;
          created_at?: string;
          end_time: string;
          id?: string;
          is_active?: boolean;
          start_time: string;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          end_time?: string;
          id?: string;
          is_active?: boolean;
          start_time?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "staff";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const;
