-- ============================================================
-- Migration: Menu data — ingredient descriptions, menu_number,
-- toppings table, highlight_tag assignments
-- ============================================================

-- ─── 1. INGREDIENT DESCRIPTIONS FOR ALL BASE PIZZAS ───

UPDATE products SET description = 'Pizza Sauce, Cheese' WHERE name = 'Cheese Lover Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Tomatoes' WHERE name = 'Margarita Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Mix Veggi, Tomatoes, Olives, Mushrooms' WHERE name = 'Veggi Lover Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Chicken Tikka, Onion' WHERE name = 'Chicken Tikka Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Chicken Fajita, Green Pepper, Onion' WHERE name = 'Chicken Fajita Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Chicken Fajita, Green Pepper, Onion, Green Chilli' WHERE name = 'Fajita Sicilian Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Chicken Bar.B.Q, Green Pepper, Onion, Green Chilli' WHERE name = 'Bar.B.Q Chicken Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Spicy Chicken, Onion, Green Chilli, Tomato' WHERE name = 'Chicken Hot & Spicy';
UPDATE products SET description = 'Pizza Sauce, Cheese, Spicy Chicken, Mushrooms, Onion' WHERE name = 'Mushroom Lover Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Peproni, Onion, Green Pepper' WHERE name = 'Peproni & Veggi Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Peproni' WHERE name = 'Peproni & Cheese Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Peproni, Mushroom' WHERE name = 'Peproni & Mushroom Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Peproni, Black Olive' WHERE name = 'Peproni & Olive Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Milano Chicken, Onion, Olives, Mushroom' WHERE name = 'Milano Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Mix Chicken, Mix Veggi, Mushroom, Olives' WHERE name = 'Chicken Supreme Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Peproni, Mix Chicken, Chicken Sausages, Mix Veggie, Mushroom, Olives' WHERE name = 'Super Supreme Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Smoke Chicken, Chicken Sausages, Green Pepper, Mushrooms, Olives' WHERE name = 'Euro Pizza';
UPDATE products SET description = 'Achari Sauce, Cheese, Achari Chicken, Green Pepper, Onion, Tomatoes, Jalapeno, Olives' WHERE name = 'New Punjabi Pizza';
UPDATE products SET description = 'Creamy Sauce, Cheese, Spice Chicken, Green Pepper, Jalapeno, Black Olives' WHERE name = 'New Creamy Supreme Pizza';
UPDATE products SET description = 'Pizza Sauce, Cheese, Spicy Beef, Jalapeno, Tomatoes, Onion' WHERE name = 'Beef Hot & Spicy Pizza';
UPDATE products SET description = 'Creamy Sauce, Cheese, Malai Boti Chicken, Onion' WHERE name = 'Chicken Malai Boti pizza';

-- ─── 2. CROWN CRUST & SEEKH KABAB DESCRIPTIONS ───
-- Set each variant's description to match its base pizza

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT name FROM products WHERE name LIKE '% - Crown Crust' OR name LIKE '% - Seekh Kabab' LOOP
        UPDATE products p1
        SET description = COALESCE(
            (SELECT description FROM products p2 WHERE p2.name = REPLACE(rec.name, ' - Crown Crust', '')),
            (SELECT description FROM products p2 WHERE p2.name = REPLACE(rec.name, ' - Seekh Kabab', '')),
            ''
        )
        WHERE p1.name = rec.name;
    END LOOP;
END $$;

-- ─── 3. MENU NUMBERING ───

UPDATE products SET menu_number = 1 WHERE name = 'Cheese Lover Pizza';
UPDATE products SET menu_number = 2 WHERE name = 'Margarita Pizza';
UPDATE products SET menu_number = 3 WHERE name = 'Veggi Lover Pizza';
UPDATE products SET menu_number = 4 WHERE name = 'Chicken Tikka Pizza';
UPDATE products SET menu_number = 5 WHERE name = 'Chicken Fajita Pizza';
UPDATE products SET menu_number = 6 WHERE name = 'Fajita Sicilian Pizza';
UPDATE products SET menu_number = 7 WHERE name = 'Bar.B.Q Chicken Pizza';
UPDATE products SET menu_number = 8 WHERE name = 'Chicken Hot & Spicy';
UPDATE products SET menu_number = 9 WHERE name = 'Mushroom Lover Pizza';
UPDATE products SET menu_number = 10 WHERE name = 'Peproni & Veggi Pizza';
UPDATE products SET menu_number = 11 WHERE name = 'Peproni & Cheese Pizza';
UPDATE products SET menu_number = 12 WHERE name = 'Peproni & Mushroom Pizza';
UPDATE products SET menu_number = 13 WHERE name = 'Peproni & Olive Pizza';
UPDATE products SET menu_number = 14 WHERE name = 'Milano Pizza';
UPDATE products SET menu_number = 15 WHERE name = 'Chicken Supreme Pizza';
UPDATE products SET menu_number = 16 WHERE name = 'Super Supreme Pizza';
UPDATE products SET menu_number = 17 WHERE name = 'Euro Pizza';
UPDATE products SET menu_number = 18 WHERE name = 'New Punjabi Pizza';
UPDATE products SET menu_number = 19 WHERE name = 'New Creamy Supreme Pizza';
UPDATE products SET menu_number = 20 WHERE name = 'Beef Hot & Spicy Pizza';
UPDATE products SET menu_number = 21 WHERE name = 'Chicken Malai Boti pizza';

-- ─── 4. HIGHLIGHT TAGS ───

UPDATE products SET highlight_tag = 'crown' WHERE name LIKE '% - Crown Crust';
UPDATE products SET highlight_tag = 'crown' WHERE name LIKE '% - Seekh Kabab';

-- ─── 5. TOPPINGS TABLE ───

CREATE TABLE IF NOT EXISTS toppings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    price_small     NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_medium    NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_large     NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO toppings (name, price_small, price_medium, price_large) VALUES
    ('Cheese', 70, 100, 150),
    ('Chicken', 50, 80, 100),
    ('Veggie', 30, 50, 70)
ON CONFLICT (name) DO NOTHING;

GRANT SELECT ON TABLE toppings TO anon, authenticated, service_role;
GRANT ALL ON TABLE toppings TO service_role;
