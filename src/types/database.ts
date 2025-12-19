// Database types for the application

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  description: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductType {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  name: string;
  type: string | null;
  default_image_url: string | null;
  default_supplier_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Shipment {
  id: number;
  shipment_code: string;
  shipment_name: string;
  purchase_date: string;
  status: string;
  invoice_customs_date: string | null;
  created_by_user_id: string | null;
  purchase_cost_rmb: number;
  purchase_cost_egp: number;
  purchase_rmb_to_egp_rate: number;
  commission_cost_rmb: number;
  commission_cost_egp: number;
  shipping_cost_rmb: number;
  shipping_cost_egp: number;
  customs_cost_egp: number;
  takhreeg_cost_egp: number;
  final_total_cost_egp: number;
  total_paid_egp: number;
  balance_egp: number;
  partial_discount_rmb: number;
  discount_notes: string | null;
  last_payment_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentItem {
  id: number;
  shipment_id: number;
  supplier_id: number | null;
  product_id: number | null;
  product_type_id: number | null;
  product_name: string;
  description: string | null;
  country_of_origin: string | null;
  image_url: string | null;
  cartons_ctn: number;
  pieces_per_carton_pcs: number;
  total_pieces_cou: number;
  purchase_price_per_piece_pri_rmb: number;
  total_purchase_cost_rmb: number;
  customs_cost_per_carton_egp: number | null;
  total_customs_cost_egp: number | null;
  takhreeg_cost_per_carton_egp: number | null;
  total_takhreeg_cost_egp: number | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentShippingDetails {
  id: number;
  shipment_id: number;
  total_purchase_cost_rmb: number;
  commission_rate_percent: number;
  commission_value_rmb: number;
  commission_value_egp: number;
  shipping_area_sqm: number;
  shipping_cost_per_sqm_usd_original: number | null;
  total_shipping_cost_usd_original: number | null;
  total_shipping_cost_rmb: number;
  total_shipping_cost_egp: number;
  shipping_date: string | null;
  rmb_to_egp_rate_at_shipping: number | null;
  usd_to_rmb_rate_at_shipping: number | null;
  source_of_rates: string | null;
  rates_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentCustomsDetails {
  id: number;
  shipment_id: number;
  total_customs_cost_egp: number;
  total_takhreeg_cost_egp: number;
  customs_invoice_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRate {
  id: number;
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate_value: number;
  source: string | null;
  created_at: string;
}

export interface ShipmentPayment {
  id: number;
  shipment_id: number;
  payment_date: string;
  payment_currency: string;
  amount_original: number;
  exchange_rate_to_egp: number | null;
  amount_egp: number;
  cost_component: string;
  payment_method: string;
  cash_receiver_name: string | null;
  reference_number: string | null;
  note: string | null;
  attachment_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: number;
  shipment_id: number | null;
  shipment_item_id: number | null;
  product_id: number | null;
  total_pieces_in: number;
  unit_cost_rmb: number | null;
  unit_cost_egp: number;
  total_cost_egp: number;
  movement_date: string;
  created_at: string;
}

// Insert types
export type InsertSupplier = Omit<Supplier, 'id' | 'created_at' | 'updated_at'>;
export type InsertProductType = Omit<ProductType, 'id' | 'created_at' | 'updated_at'>;
export type InsertProduct = Omit<Product, 'id' | 'created_at' | 'updated_at'>;
export type InsertShipment = Omit<Shipment, 'id' | 'created_at' | 'updated_at'>;
export type InsertShipmentItem = Omit<ShipmentItem, 'id' | 'created_at' | 'updated_at'>;
export type InsertExchangeRate = Omit<ExchangeRate, 'id' | 'created_at'>;
export type InsertShipmentPayment = Omit<ShipmentPayment, 'id' | 'created_at' | 'updated_at'>;
