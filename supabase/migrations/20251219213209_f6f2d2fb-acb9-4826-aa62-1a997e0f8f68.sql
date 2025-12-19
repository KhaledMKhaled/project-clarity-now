-- Suppliers table (الموردون)
CREATE TABLE public.suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  country VARCHAR(100) DEFAULT 'الصين',
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product Types table (أنواع الأصناف)
CREATE TABLE public.product_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table (الأصناف)
CREATE TABLE public.products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  default_image_url VARCHAR(500),
  default_supplier_id INTEGER REFERENCES public.suppliers(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipments table (الشحنات)
CREATE TABLE public.shipments (
  id SERIAL PRIMARY KEY,
  shipment_code VARCHAR(50) UNIQUE NOT NULL,
  shipment_name VARCHAR(255) NOT NULL,
  purchase_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'جديدة' NOT NULL,
  invoice_customs_date DATE,
  created_by_user_id UUID REFERENCES public.profiles(id),
  purchase_cost_rmb DECIMAL(15,2) DEFAULT 0,
  purchase_cost_egp DECIMAL(15,2) DEFAULT 0,
  purchase_rmb_to_egp_rate DECIMAL(10,4) DEFAULT 0,
  commission_cost_rmb DECIMAL(15,2) DEFAULT 0,
  commission_cost_egp DECIMAL(15,2) DEFAULT 0,
  shipping_cost_rmb DECIMAL(15,2) DEFAULT 0,
  shipping_cost_egp DECIMAL(15,2) DEFAULT 0,
  customs_cost_egp DECIMAL(15,2) DEFAULT 0,
  takhreeg_cost_egp DECIMAL(15,2) DEFAULT 0,
  final_total_cost_egp DECIMAL(15,2) DEFAULT 0,
  total_paid_egp DECIMAL(15,2) DEFAULT 0,
  balance_egp DECIMAL(15,2) DEFAULT 0,
  partial_discount_rmb DECIMAL(15,2) DEFAULT 0,
  discount_notes TEXT,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipment Items table (بنود الشحنة)
CREATE TABLE public.shipment_items (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES public.shipments(id) ON DELETE CASCADE NOT NULL,
  supplier_id INTEGER REFERENCES public.suppliers(id),
  product_id INTEGER REFERENCES public.products(id),
  product_type_id INTEGER REFERENCES public.product_types(id),
  product_name VARCHAR(255) NOT NULL,
  description TEXT,
  country_of_origin VARCHAR(100) DEFAULT 'الصين',
  image_url VARCHAR(500),
  cartons_ctn INTEGER DEFAULT 0 NOT NULL,
  pieces_per_carton_pcs INTEGER DEFAULT 0 NOT NULL,
  total_pieces_cou INTEGER DEFAULT 0 NOT NULL,
  purchase_price_per_piece_pri_rmb DECIMAL(10,4) DEFAULT 0,
  total_purchase_cost_rmb DECIMAL(15,2) DEFAULT 0,
  customs_cost_per_carton_egp DECIMAL(10,2),
  total_customs_cost_egp DECIMAL(15,2),
  takhreeg_cost_per_carton_egp DECIMAL(10,2),
  total_takhreeg_cost_egp DECIMAL(15,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipping Details table (بيانات الشحن)
CREATE TABLE public.shipment_shipping_details (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES public.shipments(id) ON DELETE CASCADE UNIQUE NOT NULL,
  total_purchase_cost_rmb DECIMAL(15,2) DEFAULT 0,
  commission_rate_percent DECIMAL(5,2) DEFAULT 0,
  commission_value_rmb DECIMAL(15,2) DEFAULT 0,
  commission_value_egp DECIMAL(15,2) DEFAULT 0,
  shipping_area_sqm DECIMAL(10,2) DEFAULT 0,
  shipping_cost_per_sqm_usd_original DECIMAL(10,2),
  total_shipping_cost_usd_original DECIMAL(15,2),
  total_shipping_cost_rmb DECIMAL(15,2) DEFAULT 0,
  total_shipping_cost_egp DECIMAL(15,2) DEFAULT 0,
  shipping_date DATE,
  rmb_to_egp_rate_at_shipping DECIMAL(10,4),
  usd_to_rmb_rate_at_shipping DECIMAL(10,4),
  source_of_rates VARCHAR(100),
  rates_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customs Details table (الجمارك والتخريج)
CREATE TABLE public.shipment_customs_details (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES public.shipments(id) ON DELETE CASCADE UNIQUE NOT NULL,
  total_customs_cost_egp DECIMAL(15,2) DEFAULT 0,
  total_takhreeg_cost_egp DECIMAL(15,2) DEFAULT 0,
  customs_invoice_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exchange Rates table (أسعار الصرف)
CREATE TABLE public.exchange_rates (
  id SERIAL PRIMARY KEY,
  rate_date DATE NOT NULL,
  from_currency VARCHAR(10) NOT NULL,
  to_currency VARCHAR(10) NOT NULL,
  rate_value DECIMAL(15,6) NOT NULL,
  source VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipment Payments table (سداد الشحنات)
CREATE TABLE public.shipment_payments (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES public.shipments(id) ON DELETE CASCADE NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_currency VARCHAR(10) NOT NULL,
  amount_original DECIMAL(15,2) NOT NULL,
  exchange_rate_to_egp DECIMAL(10,4),
  amount_egp DECIMAL(15,2) NOT NULL,
  cost_component VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  cash_receiver_name VARCHAR(255),
  reference_number VARCHAR(100),
  note TEXT,
  attachment_url VARCHAR(500),
  created_by_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventory Movements table (حركات المخزون)
CREATE TABLE public.inventory_movements (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES public.shipments(id),
  shipment_item_id INTEGER REFERENCES public.shipment_items(id),
  product_id INTEGER REFERENCES public.products(id),
  total_pieces_in INTEGER DEFAULT 0,
  unit_cost_rmb DECIMAL(10,4),
  unit_cost_egp DECIMAL(10,4) NOT NULL,
  total_cost_egp DECIMAL(15,2) NOT NULL,
  movement_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_shipping_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_customs_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view product_types" ON public.product_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert product_types" ON public.product_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_types" ON public.product_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete product_types" ON public.product_types FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view shipments" ON public.shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert shipments" ON public.shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update shipments" ON public.shipments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete shipments" ON public.shipments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view shipment_items" ON public.shipment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert shipment_items" ON public.shipment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update shipment_items" ON public.shipment_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete shipment_items" ON public.shipment_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view shipping_details" ON public.shipment_shipping_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert shipping_details" ON public.shipment_shipping_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update shipping_details" ON public.shipment_shipping_details FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete shipping_details" ON public.shipment_shipping_details FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view customs_details" ON public.shipment_customs_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customs_details" ON public.shipment_customs_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customs_details" ON public.shipment_customs_details FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customs_details" ON public.shipment_customs_details FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view exchange_rates" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert exchange_rates" ON public.exchange_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update exchange_rates" ON public.exchange_rates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete exchange_rates" ON public.exchange_rates FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view payments" ON public.shipment_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert payments" ON public.shipment_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update payments" ON public.shipment_payments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete payments" ON public.shipment_payments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert inventory_movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update inventory_movements" ON public.inventory_movements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete inventory_movements" ON public.inventory_movements FOR DELETE TO authenticated USING (true);

-- Create updated_at triggers for all tables
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_product_types_updated_at BEFORE UPDATE ON public.product_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shipment_items_updated_at BEFORE UPDATE ON public.shipment_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shipping_details_updated_at BEFORE UPDATE ON public.shipment_shipping_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customs_details_updated_at BEFORE UPDATE ON public.shipment_customs_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.shipment_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();