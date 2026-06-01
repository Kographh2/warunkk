export type Role = 'owner' | 'admin' | 'kasir' | 'customer';
export type OrderStatus = 'cart_created' | 'waiting_payment' | 'paid' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'void';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

export type TableRow = {
  id: string;
  table_number: string;
  table_name: string | null;
  qr_slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  categories?: Category | null;
};

export type CartItem = {
  menu_item: MenuItem;
  qty: number;
  note?: string;
};

export type Order = {
  id: string;
  table_id: string | null;
  table_number: string;
  customer_id: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: 'cashier_counter';
  payment_code: string;
  subtotal: number;
  service_amount: number;
  tax_amount: number;
  total_amount: number;
  customer_note: string | null;
  cashier_id: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  qty: number;
  unit_price: number;
  note: string | null;
  subtotal: number;
  created_at: string;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  actor_id: string | null;
  actor_role: string | null;
  event: string;
  description: string | null;
  created_at: string;
};

export type StoreSettings = {
  name: string;
  tagline: string;
  taxPercent: number;
  servicePercent: number;
};
