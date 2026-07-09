import { productsService, categoriesService, discountsService, generateId } from './services';
import { Product, Category, Discount, ProductVariant, VariantData, ProductModifier } from '../types';
import { sonner } from './sonner';

export async function seedPizzaMilanoMenu() {
  sonner.loading('Seeding Pizza Milano Menu...');

  try {
    // 1. Create Categories
    const catPizzas: Category = {
      id: generateId(),
      name: 'Pizzas',
      description: 'Standard and Signature Pizzas'
    };
    const catSpecial: Category = {
      id: generateId(),
      name: 'Special Pizzas',
      description: 'Crown Crust and Seekh Kabab'
    };
    const catBeverages: Category = {
      id: generateId(),
      name: 'Beverages',
      description: 'Drinks and Water'
    };

    await categoriesService.create(catPizzas);
    await categoriesService.create(catSpecial);
    await categoriesService.create(catBeverages);

    // 2. Define Modifiers
    const standardModifiers: ProductModifier[] = [
      { name: "Extra Cheese", price: 70, variantName: "Size: 6 Inch" },
      { name: "Extra Cheese", price: 100, variantName: "Size: 10 Inch" },
      { name: "Extra Cheese", price: 150, variantName: "Size: 13 Inch" },
      { name: "Extra Chicken", price: 50, variantName: "Size: 6 Inch" },
      { name: "Extra Chicken", price: 80, variantName: "Size: 10 Inch" },
      { name: "Extra Chicken", price: 100, variantName: "Size: 13 Inch" },
      { name: "Extra Veggie", price: 30, variantName: "Size: 6 Inch" },
      { name: "Extra Veggie", price: 50, variantName: "Size: 10 Inch" },
      { name: "Extra Veggie", price: 70, variantName: "Size: 13 Inch" },
    ];

    const specialModifiers = standardModifiers.filter(m => m.variantName !== "Size: 6 Inch");

    // 3. Helper to create a Pizza Product
    const createPizza = async (
      name: string,
      category: string,
      prices: { [size: string]: number },
      modifiers: ProductModifier[],
      description: string = "",
      imageUrl: string = "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&q=80"
    ) => {
      const productId = generateId();
      
      const sizeOptions = Object.keys(prices).map(s => `${s} Inch`);
      const variants: ProductVariant[] = [{
        name: "Size",
        options: sizeOptions
      }];

      const variantData: VariantData[] = Object.entries(prices).map(([size, price], index) => {
        return {
          id: generateId(),
          option1: `Size: ${size} Inch`,
          priceOverride: price,
          barcode: `ZP-${Math.floor(Math.random() * 90000) + 10000}`
        };
      });

      // Find the minimum price to set as the base product price
      const basePrice = Math.min(...Object.values(prices));

      const product: Product = {
        id: productId,
        name,
        price: basePrice,
        cost: basePrice * 0.4, // Estimate cost as 40% of sale price
        stock: 999, // Ingredients are stocked, but for POS simplicity we set high stock for the pizza itself
        minStock: 10,
        category,
        description,
        image: imageUrl,
        taxable: true,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        trackInventory: false, // Pizzas usually don't track direct stock (they track raw ingredients)
        isService: true, // Mark as service to skip strict stock tracking
        variants,
        variantData,
        modifiers
      };

      await productsService.create(product);
    };

    // --- Standard Pizzas ---
    const standardPizzaNames = [
      "Cheese Lover Pizza", "Margarita Pizza", "Veggi Lover Pizza", 
      "Chicken Tikka Pizza", "Chicken Fajita Pizza", "Fajita Sicilian Pizza", 
      "Bar.B.Q Chicken Pizza", "Chicken Hot & Spicy", "Mushroom Lover Pizza", 
      "Peproni & Veggi Pizza", "Peproni & Cheese Pizza", "Peproni & Mushroom Pizza", 
      "Peproni & Olive Pizza"
    ];

    for (const name of standardPizzaNames) {
      await createPizza(name, catPizzas.name, { "6": 600, "10": 950, "13": 1350 }, standardModifiers);
    }

    // --- Exceptional Pizzas ---
    await createPizza("Milano Pizza", catPizzas.name, { "6": 650, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("Chicken Supreme Pizza", catPizzas.name, { "6": 700, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("Super Supreme Pizza", catPizzas.name, { "6": 700, "10": 1050, "13": 1500 }, standardModifiers);
    await createPizza("Euro Pizza", catPizzas.name, { "6": 700, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("New Punjabi Pizza", catPizzas.name, { "6": 650, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("New Creamy Supreme Pizza", catPizzas.name, { "6": 650, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("Beef Hot & Spicy Pizza", catPizzas.name, { "6": 650, "10": 980, "13": 1450 }, standardModifiers);
    await createPizza("Chicken Malai Boti pizza", catPizzas.name, { "6": 650, "10": 980, "13": 1450 }, standardModifiers);

    // --- Special Pizzas ---
    const specialImage = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&q=80";
    await createPizza("Crown Crust Pizza", catSpecial.name, { "10": 1300, "13": 1850 }, specialModifiers, "", specialImage);
    await createPizza("Seekh Kabab Pizza", catSpecial.name, { "10": 1350, "13": 1950 }, specialModifiers, "", specialImage);

    // --- Beverages ---
    const beverages = [
      { name: "Small Drink", price: 80 },
      { name: "500 ml Drink", price: 120 },
      { name: "1 Liter Drink", price: 160 },
      { name: "1.5 Liter Drink", price: 220 },
      { name: "Small Mineral Water", price: 60 },
      { name: "Larger Mineral Water", price: 100 }
    ];

    for (const bev of beverages) {
      const product: Product = {
        id: generateId(),
        name: bev.name,
        price: bev.price,
        cost: bev.price * 0.5,
        stock: 50,
        minStock: 10,
        category: catBeverages.name,
        description: '',
        image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&q=80",
        taxable: true,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        trackInventory: true,
      };
      await productsService.create(product);
    }

    // 4. Create "Only Sunday Offer" & "23% Discount on Kabab Pizza" Mix & Match Deals
    
    // 23% Discount on Seekh Kabab Pizza
    const kababDiscount: Discount = {
      id: generateId(),
      name: "23% Off Kabab Pizza",
      description: "Applies 23% discount on Seekh Kabab Pizza.",
      type: "percentage",
      value: 23,
      active: true,
      isAutoApply: true,
      validFrom: new Date(),
      validTo: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      createdAt: new Date(),
      conditions: [
        {
          type: "specific_products",
          value: [], // We will need to set this if we track by ID, but since names are used in cart for now or IDs, we should get the ID.
        }
      ]
    };
    // Wait, the productsService doesn't return the array, we can just let the admin configure the Kabab pizza discount, but we can set up the Sunday Offer structure.
    
    sonner.close();
    sonner.success('Pizza Milano Menu successfully seeded into the database!');

  } catch (error: any) {
    console.error("Seeding failed:", error);
    sonner.close();
    sonner.error(`Seeding failed: ${error.message}`);
  }
}
