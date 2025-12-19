export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      exchange_rates: {
        Row: {
          created_at: string | null
          from_currency: string
          id: number
          rate_date: string
          rate_value: number
          source: string | null
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          from_currency: string
          id?: number
          rate_date: string
          rate_value: number
          source?: string | null
          to_currency: string
        }
        Update: {
          created_at?: string | null
          from_currency?: string
          id?: number
          rate_date?: string
          rate_value?: number
          source?: string | null
          to_currency?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          id: number
          movement_date: string
          product_id: number | null
          shipment_id: number | null
          shipment_item_id: number | null
          total_cost_egp: number
          total_pieces_in: number | null
          unit_cost_egp: number
          unit_cost_rmb: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          movement_date: string
          product_id?: number | null
          shipment_id?: number | null
          shipment_item_id?: number | null
          total_cost_egp: number
          total_pieces_in?: number | null
          unit_cost_egp: number
          unit_cost_rmb?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          movement_date?: string
          product_id?: number | null
          shipment_id?: number | null
          shipment_item_id?: number | null
          total_cost_egp?: number
          total_pieces_in?: number | null
          unit_cost_egp?: number
          unit_cost_rmb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_shipment_item_id_fkey"
            columns: ["shipment_item_id"]
            isOneToOne: false
            referencedRelation: "shipment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          default_image_url: string | null
          default_supplier_id: number | null
          id: number
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_image_url?: string | null
          default_supplier_id?: number | null
          id?: number
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_image_url?: string | null
          default_supplier_id?: number | null
          id?: number
          name?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          role: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      shipment_customs_details: {
        Row: {
          created_at: string | null
          customs_invoice_date: string | null
          id: number
          shipment_id: number
          total_customs_cost_egp: number | null
          total_takhreeg_cost_egp: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customs_invoice_date?: string | null
          id?: number
          shipment_id: number
          total_customs_cost_egp?: number | null
          total_takhreeg_cost_egp?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customs_invoice_date?: string | null
          id?: number
          shipment_id?: number
          total_customs_cost_egp?: number | null
          total_takhreeg_cost_egp?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_customs_details_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_items: {
        Row: {
          cartons_ctn: number
          country_of_origin: string | null
          created_at: string | null
          customs_cost_per_carton_egp: number | null
          description: string | null
          id: number
          image_url: string | null
          pieces_per_carton_pcs: number
          product_id: number | null
          product_name: string
          product_type_id: number | null
          purchase_price_per_piece_pri_rmb: number | null
          shipment_id: number
          supplier_id: number | null
          takhreeg_cost_per_carton_egp: number | null
          total_customs_cost_egp: number | null
          total_pieces_cou: number
          total_purchase_cost_rmb: number | null
          total_takhreeg_cost_egp: number | null
          updated_at: string | null
        }
        Insert: {
          cartons_ctn?: number
          country_of_origin?: string | null
          created_at?: string | null
          customs_cost_per_carton_egp?: number | null
          description?: string | null
          id?: number
          image_url?: string | null
          pieces_per_carton_pcs?: number
          product_id?: number | null
          product_name: string
          product_type_id?: number | null
          purchase_price_per_piece_pri_rmb?: number | null
          shipment_id: number
          supplier_id?: number | null
          takhreeg_cost_per_carton_egp?: number | null
          total_customs_cost_egp?: number | null
          total_pieces_cou?: number
          total_purchase_cost_rmb?: number | null
          total_takhreeg_cost_egp?: number | null
          updated_at?: string | null
        }
        Update: {
          cartons_ctn?: number
          country_of_origin?: string | null
          created_at?: string | null
          customs_cost_per_carton_egp?: number | null
          description?: string | null
          id?: number
          image_url?: string | null
          pieces_per_carton_pcs?: number
          product_id?: number | null
          product_name?: string
          product_type_id?: number | null
          purchase_price_per_piece_pri_rmb?: number | null
          shipment_id?: number
          supplier_id?: number | null
          takhreeg_cost_per_carton_egp?: number | null
          total_customs_cost_egp?: number | null
          total_pieces_cou?: number
          total_purchase_cost_rmb?: number | null
          total_takhreeg_cost_egp?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_payments: {
        Row: {
          amount_egp: number
          amount_original: number
          attachment_url: string | null
          cash_receiver_name: string | null
          cost_component: string
          created_at: string | null
          created_by_user_id: string | null
          exchange_rate_to_egp: number | null
          id: number
          note: string | null
          payment_currency: string
          payment_date: string
          payment_method: string
          reference_number: string | null
          shipment_id: number
          updated_at: string | null
        }
        Insert: {
          amount_egp: number
          amount_original: number
          attachment_url?: string | null
          cash_receiver_name?: string | null
          cost_component: string
          created_at?: string | null
          created_by_user_id?: string | null
          exchange_rate_to_egp?: number | null
          id?: number
          note?: string | null
          payment_currency: string
          payment_date: string
          payment_method: string
          reference_number?: string | null
          shipment_id: number
          updated_at?: string | null
        }
        Update: {
          amount_egp?: number
          amount_original?: number
          attachment_url?: string | null
          cash_receiver_name?: string | null
          cost_component?: string
          created_at?: string | null
          created_by_user_id?: string | null
          exchange_rate_to_egp?: number | null
          id?: number
          note?: string | null
          payment_currency?: string
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          shipment_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_payments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_payments_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_shipping_details: {
        Row: {
          commission_rate_percent: number | null
          commission_value_egp: number | null
          commission_value_rmb: number | null
          created_at: string | null
          id: number
          rates_updated_at: string | null
          rmb_to_egp_rate_at_shipping: number | null
          shipment_id: number
          shipping_area_sqm: number | null
          shipping_cost_per_sqm_usd_original: number | null
          shipping_date: string | null
          source_of_rates: string | null
          total_purchase_cost_rmb: number | null
          total_shipping_cost_egp: number | null
          total_shipping_cost_rmb: number | null
          total_shipping_cost_usd_original: number | null
          updated_at: string | null
          usd_to_rmb_rate_at_shipping: number | null
        }
        Insert: {
          commission_rate_percent?: number | null
          commission_value_egp?: number | null
          commission_value_rmb?: number | null
          created_at?: string | null
          id?: number
          rates_updated_at?: string | null
          rmb_to_egp_rate_at_shipping?: number | null
          shipment_id: number
          shipping_area_sqm?: number | null
          shipping_cost_per_sqm_usd_original?: number | null
          shipping_date?: string | null
          source_of_rates?: string | null
          total_purchase_cost_rmb?: number | null
          total_shipping_cost_egp?: number | null
          total_shipping_cost_rmb?: number | null
          total_shipping_cost_usd_original?: number | null
          updated_at?: string | null
          usd_to_rmb_rate_at_shipping?: number | null
        }
        Update: {
          commission_rate_percent?: number | null
          commission_value_egp?: number | null
          commission_value_rmb?: number | null
          created_at?: string | null
          id?: number
          rates_updated_at?: string | null
          rmb_to_egp_rate_at_shipping?: number | null
          shipment_id?: number
          shipping_area_sqm?: number | null
          shipping_cost_per_sqm_usd_original?: number | null
          shipping_date?: string | null
          source_of_rates?: string | null
          total_purchase_cost_rmb?: number | null
          total_shipping_cost_egp?: number | null
          total_shipping_cost_rmb?: number | null
          total_shipping_cost_usd_original?: number | null
          updated_at?: string | null
          usd_to_rmb_rate_at_shipping?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_shipping_details_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          balance_egp: number | null
          commission_cost_egp: number | null
          commission_cost_rmb: number | null
          created_at: string | null
          created_by_user_id: string | null
          customs_cost_egp: number | null
          discount_notes: string | null
          final_total_cost_egp: number | null
          id: number
          invoice_customs_date: string | null
          last_payment_date: string | null
          partial_discount_rmb: number | null
          purchase_cost_egp: number | null
          purchase_cost_rmb: number | null
          purchase_date: string
          purchase_rmb_to_egp_rate: number | null
          shipment_code: string
          shipment_name: string
          shipping_cost_egp: number | null
          shipping_cost_rmb: number | null
          status: string
          takhreeg_cost_egp: number | null
          total_paid_egp: number | null
          updated_at: string | null
        }
        Insert: {
          balance_egp?: number | null
          commission_cost_egp?: number | null
          commission_cost_rmb?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
          customs_cost_egp?: number | null
          discount_notes?: string | null
          final_total_cost_egp?: number | null
          id?: number
          invoice_customs_date?: string | null
          last_payment_date?: string | null
          partial_discount_rmb?: number | null
          purchase_cost_egp?: number | null
          purchase_cost_rmb?: number | null
          purchase_date: string
          purchase_rmb_to_egp_rate?: number | null
          shipment_code: string
          shipment_name: string
          shipping_cost_egp?: number | null
          shipping_cost_rmb?: number | null
          status?: string
          takhreeg_cost_egp?: number | null
          total_paid_egp?: number | null
          updated_at?: string | null
        }
        Update: {
          balance_egp?: number | null
          commission_cost_egp?: number | null
          commission_cost_rmb?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
          customs_cost_egp?: number | null
          discount_notes?: string | null
          final_total_cost_egp?: number | null
          id?: number
          invoice_customs_date?: string | null
          last_payment_date?: string | null
          partial_discount_rmb?: number | null
          purchase_cost_egp?: number | null
          purchase_cost_rmb?: number | null
          purchase_date?: string
          purchase_rmb_to_egp_rate?: number | null
          shipment_code?: string
          shipment_name?: string
          shipping_cost_egp?: number | null
          shipping_cost_rmb?: number | null
          status?: string
          takhreeg_cost_egp?: number | null
          total_paid_egp?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          country: string | null
          created_at: string | null
          description: string | null
          email: string | null
          id: number
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
