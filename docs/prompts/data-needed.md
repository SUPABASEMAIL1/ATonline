Yahan sirf tabs/pages ke names hain:

1. POS Cart Tab
2. POS Quick Checkout Modal
3. Full Checkout Page
4. Transactions / Sales History Tab
5. Online Orders Management Tab
6. Print Receipts (Thermal & A4)
7. KOT Print (Kitchen Ticket)
8. E-Store Customer Cart
9. E-Store Checkout Page
10. Customer Order Tracker Page
11. Inventory Product Sales History Tab
12. Reports & Analytics Manager


1. POS & Staff Screens (Store Dashboard)

POS Cart Panel: Jab aap item scan ya click kar ke cart mein add karte hain. (Cart.tsx)
POS Checkout Modal: Quick checkout popup ke andar. (CheckoutModal.tsx)
POS Full Checkout Page: Jab aap detailed checkout page par jatay hain. (CheckoutPage.tsx)
Transactions / Sales History Tab: Jab aap kisi purani sale par click kar ke uski detailed bill/receipt dekhte hain. (TransactionDetailModal.tsx)
Online Orders Management Tab: Jab e-store se naya order aata hai aur aap admin panel mein usay view ya accept karte hain. (OnlineOrdersPage.tsx)
2. Print & physical Outputs

Customer Receipts: Thermal 80mm printer slip aur A4 size Invoice print dono mein. (ReceiptPrint.tsx)
KOT (Kitchen Order Ticket): Jo print kitchen mein preparation ke liye jata hai (without prices, only names and quantities). (KOTPrint.tsx)
3. E-Store & Customer Facing Screens (Online Store)

E-Store Mini Cart / Cart Drawer: Customer jab online store par cart open karta hai. (StoreFront.tsx)
E-Store Checkout Page: Customer jab apna address waghera daal kar order place karne lagta hai. (StoreCheckout.tsx)
Order Tracking Page: Customer jab order place karne ke baad apna live order status (Preparation Time) track karta hai. (OrderTracker.tsx)
4. Analytics & Reports Tabs

Inventory -> Product Sales History: Inventory tab mein kisi item par click kar ke uski past sales history dekhte waqt. (InventoryReportManager.tsx)
Reports Manager: Backend par modifiers, add-ons, aur toppings ke revenue ko total sales mein shamil karne ke liye takay aage chal kar audit/reports mein koi masla na aaye. (ReportsManager.tsx)

