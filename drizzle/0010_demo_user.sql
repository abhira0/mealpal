-- Demo login: demo@demo.com / demo
INSERT OR IGNORE INTO households (name, created_at) VALUES ('Demo Household', 0);--> statement-breakpoint
INSERT OR IGNORE INTO users (household_id, email, password_hash, name, created_at)
SELECT id, 'demo@demo.com', '$2b$10$0h3tN.V/NToZSyeT5LjU.eKcWa/E/64Xzi45Jy36n0TfxYrfb3BAq', 'Demo', 0
FROM households WHERE name = 'Demo Household';
