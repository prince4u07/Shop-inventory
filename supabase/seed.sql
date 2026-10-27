-- Demo seed (optional, for local dev only — never in production).
-- Passwords below are bcrypt hashes of 'password123'. Replace before use.
-- Run AFTER 0001_initial_schema.sql.

-- Owner + staff (bcrypt hash of 'password123', cost 10 — dev only)
insert into public.users (name, email, phone, password_hash, role) values
  ('Shop Owner', 'owner@shop.local', '+911234567890', '$2b$10$iDQCyaucvZHz0YaVswrb3ej7Ib9CfOQ7d5dRuB29c7J34e0OUIcrO', 'owner'),
  ('Counter Staff', 'staff@shop.local', '+911234567891', '$2b$10$iDQCyaucvZHz0YaVswrb3ej7Ib9CfOQ7d5dRuB29c7J34e0OUIcrO', 'staff')
on conflict do nothing;

-- Sample variants: same shirt, different size/color = different barcode rows
insert into public.products (name, category, gender, size, color, price, quantity, barcode, low_stock_threshold) values
  ('Classic Cotton Shirt', 'clothing', 'men', 'M', 'White', 799.00, 25, '890000000001', 5),
  ('Classic Cotton Shirt', 'clothing', 'men', 'L', 'White', 799.00, 20, '890000000002', 5),
  ('Classic Cotton Shirt', 'clothing', 'men', 'M', 'Navy', 799.00, 3, '890000000003', 5),
  ('Summer Kurti', 'clothing', 'women', 'M', 'Red', 999.00, 15, '890000000004', 5),
  ('Running Shoes', 'footwear', 'unisex', 'UK 9', 'Black', 1999.00, 10, '890000000005', 3),
  ('Leather Belt', 'accessories', 'unisex', 'M', 'Brown', 349.00, 30, '890000000006', 10),
  ('Cotton Socks (3-pack)', 'accessories', 'unisex', 'Free', 'Grey', 199.00, 2, '890000000007', 10)
on conflict (barcode) do nothing;
