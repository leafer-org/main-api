-- Seed static roles (ADMIN and USER)
INSERT INTO roles (name, permissions, is_static) VALUES
  ('ADMIN', '{"ROLE.MANAGE": true, "SESSION.MANAGE": "all"}', true),
  ('USER', '{}', true)
ON CONFLICT (name) DO NOTHING;
