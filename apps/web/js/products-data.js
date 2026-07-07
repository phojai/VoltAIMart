/* ============================================================
   VoltAIMart — Product catalogue (static demo data)
   Prices are in INR (₹1 USD ≈ ₹83 was used to convert the original
   USD demo prices — see git history for the pre-conversion values).
   ============================================================ */

const DEPARTMENTS = [
  { id: "electronics", label: "Electronics", icon: "⚡", tagline: "Phones, laptops, audio & more" },
  { id: "fashion",     label: "Fashion",     icon: "🛍️", tagline: "Clothing, shoes & accessories" },
];

const CATEGORIES = [
  { id: "smartphones", label: "Smartphones",       icon: "📱", department: "electronics" },
  { id: "laptops",     label: "Laptops",           icon: "💻", department: "electronics" },
  { id: "headphones",  label: "Audio",             icon: "🎧", department: "electronics" },
  { id: "wearables",   label: "Wearables",         icon: "⌚", department: "electronics" },
  { id: "cameras",     label: "Cameras",           icon: "📷", department: "electronics" },
  { id: "gaming",      label: "Gaming",            icon: "🎮", department: "electronics" },
  { id: "tv",          label: "TV & Home",         icon: "📺", department: "electronics" },
  { id: "accessories", label: "Accessories",       icon: "🔌", department: "electronics" },
  { id: "mens",        label: "Men's Fashion",     icon: "👔", department: "fashion" },
  { id: "womens",      label: "Women's Fashion",   icon: "👗", department: "fashion" },
  { id: "shoes",       label: "Shoes",             icon: "👟", department: "fashion" },
  { id: "bags",        label: "Bags & Accessories",icon: "👜", department: "fashion" },
];

const PRODUCTS = [
  {
    id: "p1", name: "Volt Aria X1 Smartphone", category: "smartphones",
    price: 74617, oldPrice: 82917, rating: 4.8, icon: "📱", badge: "SALE",
    tagline: "6.7\" OLED · Triple camera · 5G",
    description: "Flagship smartphone with a 6.7-inch adaptive OLED display, triple 50MP camera system, and all-day battery life. Runs on the Volt A5 chip for fast, fluid performance.",
    specs: { Display: "6.7\" OLED, 120Hz", Chip: "Volt A5", Storage: "256GB", Camera: "50MP Triple", Battery: "5000mAh", "5G": "Yes" },
    keywords: ["phone", "smartphone", "mobile", "aria"]
  },
  {
    id: "p2", name: "Volt Pulse Mini", category: "smartphones",
    price: 37267, rating: 4.4, icon: "📱",
    tagline: "Compact 5G phone, all-day battery",
    description: "A compact, affordable 5G smartphone built for everyday use — sharp display, dependable battery, and a clean interface.",
    specs: { Display: "6.1\" LCD, 90Hz", Chip: "Volt A2", Storage: "128GB", Camera: "48MP Dual", Battery: "4500mAh", "5G": "Yes" },
    keywords: ["phone", "smartphone", "budget phone", "pulse"]
  },
  {
    id: "p3", name: "Volt Book Pro 14", category: "laptops",
    price: 124417, rating: 4.9, icon: "💻", badge: "NEW",
    tagline: "14\" Retina · M-class chip · 18h battery",
    description: "Ultra-thin pro laptop with a stunning 14-inch Retina display, our fastest silicon yet, and 18 hours of real-world battery life.",
    specs: { Display: "14\" Retina, 120Hz", Chip: "Volt M3 Pro", RAM: "16GB", Storage: "512GB SSD", Battery: "18 hrs", Weight: "1.4kg" },
    keywords: ["laptop", "notebook", "macbook", "book pro"]
  },
  {
    id: "p4", name: "Volt Book Air 13", category: "laptops",
    price: 82917, rating: 4.7, icon: "💻",
    tagline: "Ultralight everyday laptop",
    description: "The everyday laptop — impossibly light at just 1.1kg, with a full day of battery and a fanless silent design.",
    specs: { Display: "13.3\" IPS", Chip: "Volt M3", RAM: "8GB", Storage: "256GB SSD", Battery: "15 hrs", Weight: "1.1kg" },
    keywords: ["laptop", "notebook", "air", "lightweight laptop"]
  },
  {
    id: "p5", name: "Volt Gamer 16 RTX", category: "laptops",
    price: 182517, oldPrice: 199117, rating: 4.6, icon: "💻", badge: "SALE",
    tagline: "16\" 240Hz · RTX graphics · RGB",
    description: "A no-compromise gaming laptop with a 240Hz QHD display, top-tier discrete graphics, and a per-key RGB keyboard.",
    specs: { Display: "16\" QHD, 240Hz", GPU: "RTX-class 16GB", RAM: "32GB", Storage: "1TB SSD", Cooling: "Vapor chamber" },
    keywords: ["gaming laptop", "laptop", "gamer"]
  },
  {
    id: "p6", name: "Volt Buds Pro", category: "headphones",
    price: 16517, rating: 4.6, icon: "🎧", badge: "NEW",
    tagline: "Active noise cancelling earbuds",
    description: "True wireless earbuds with adaptive active noise cancellation, spatial audio, and a compact charging case.",
    specs: { Type: "In-ear, ANC", Battery: "8h + 24h case", Water: "IPX4", Connectivity: "Bluetooth 5.3" },
    keywords: ["earbuds", "headphones", "earphones", "buds", "wireless earbuds"]
  },
  {
    id: "p7", name: "Volt Sound Max Headphones", category: "headphones",
    price: 28967, rating: 4.8, icon: "🎧",
    tagline: "Over-ear · Studio-grade ANC",
    description: "Over-ear headphones tuned for studio-grade clarity, industry-leading noise cancellation, and 40-hour battery life.",
    specs: { Type: "Over-ear, ANC", Battery: "40 hrs", Drivers: "45mm", Connectivity: "Bluetooth 5.3, wired" },
    keywords: ["headphones", "over ear headphones", "sound max"]
  },
  {
    id: "p8", name: "Volt Beam Speaker", category: "headphones",
    price: 10707, rating: 4.3, icon: "🔊",
    tagline: "Portable Bluetooth speaker, 360° sound",
    description: "A rugged, portable speaker delivering 360-degree sound with deep bass — waterproof and built for 20 hours of playback.",
    specs: { Output: "30W", Battery: "20 hrs", Water: "IP67", Connectivity: "Bluetooth 5.2" },
    keywords: ["speaker", "bluetooth speaker", "portable speaker"]
  },
  {
    id: "p9", name: "Volt Watch Fit 3", category: "wearables",
    price: 20667, rating: 4.5, icon: "⌚",
    tagline: "GPS · Heart rate · 7-day battery",
    description: "A fitness-first smartwatch with built-in GPS, continuous heart-rate and sleep tracking, and up to 7 days of battery.",
    specs: { Display: "AMOLED, always-on", Battery: "7 days", Water: "5 ATM", Sensors: "HR, SpO2, GPS" },
    keywords: ["watch", "smartwatch", "fitness watch", "wearable"]
  },
  {
    id: "p10", name: "Volt Watch Ultra", category: "wearables",
    price: 45567, oldPrice: 49717, rating: 4.7, icon: "⌚", badge: "SALE",
    tagline: "Titanium · Cellular · Dive-rated",
    description: "The rugged flagship watch — titanium case, cellular connectivity, and dive-rated water resistance for serious athletes.",
    specs: { Case: "Titanium", Battery: "36 hrs", Water: "100m", Cellular: "Yes" },
    keywords: ["watch", "smartwatch", "ultra watch"]
  },
  {
    id: "p11", name: "Volt Lens Z9 Camera", category: "cameras",
    price: 157617, rating: 4.9, icon: "📷", badge: "NEW",
    tagline: "Mirrorless · 45MP · 8K video",
    description: "A professional mirrorless camera with a 45MP full-frame sensor, 8K video recording, and best-in-class autofocus.",
    specs: { Sensor: "45MP Full-frame", Video: "8K/30fps", ISO: "100–51200", Stabilization: "5-axis IBIS" },
    keywords: ["camera", "mirrorless camera", "z9"]
  },
  {
    id: "p12", name: "Volt Action Cam 4K", category: "cameras",
    price: 27307, rating: 4.4, icon: "🎥",
    tagline: "Waterproof action camera, 4K/120",
    description: "Compact, waterproof action camera capturing ultra-smooth 4K/120fps footage — built for every adventure.",
    specs: { Video: "4K/120fps", Water: "10m (no case)", Stabilization: "HyperSteady", Battery: "2 hrs continuous" },
    keywords: ["action camera", "camera", "gopro style camera"]
  },
  {
    id: "p13", name: "Volt Pad Pro 12", category: "gaming",
    price: 66317, rating: 4.6, icon: "🕹️",
    tagline: "12.9\" tablet · Console-grade gaming",
    description: "A 12.9-inch tablet with a 120Hz display and console-grade graphics performance — great for gaming, drawing, and streaming.",
    specs: { Display: "12.9\" Liquid Retina, 120Hz", Chip: "Volt M3", Storage: "256GB", Battery: "10 hrs" },
    keywords: ["tablet", "ipad", "gaming tablet"]
  },
  {
    id: "p14", name: "Volt Controller Elite", category: "gaming",
    price: 7387, rating: 4.5, icon: "🎮",
    tagline: "Wireless controller, swappable sticks",
    description: "A premium wireless controller with swappable analog sticks, customizable back paddles, and 30-hour battery life.",
    specs: { Connectivity: "Bluetooth + 2.4GHz", Battery: "30 hrs", Feature: "Swappable sticks" },
    keywords: ["controller", "gamepad", "gaming controller"]
  },
  {
    id: "p15", name: "Volt Vision 65 OLED TV", category: "tv",
    price: 149317, oldPrice: 165917, rating: 4.8, icon: "📺", badge: "SALE",
    tagline: "65\" 4K OLED · 144Hz · Dolby Vision",
    description: "A 65-inch 4K OLED TV with perfect blacks, a 144Hz refresh rate for gaming, and Dolby Vision / Atmos support.",
    specs: { Size: "65\"", Panel: "OLED, 4K", Refresh: "144Hz", HDR: "Dolby Vision", Audio: "Dolby Atmos" },
    keywords: ["tv", "television", "oled tv", "smart tv"]
  },
  {
    id: "p16", name: "Volt Hub Smart Speaker", category: "accessories",
    price: 6557, rating: 4.2, icon: "🔈",
    tagline: "Voice assistant + smart home hub",
    description: "A compact smart speaker with built-in voice assistant and smart-home hub, so you can control your devices hands-free.",
    specs: { Assistant: "Volt AI built-in", Connectivity: "Wi‑Fi, Bluetooth, Thread", Audio: "Full-range driver" },
    keywords: ["smart speaker", "voice assistant", "smart home", "hub"]
  },

  /* ---------------- Fashion ---------------- */
  {
    id: "f1", name: "Volt Essential Tee", category: "mens",
    price: 2407, rating: 4.5, icon: "👕", badge: "NEW",
    tagline: "100% organic cotton, everyday fit",
    description: "A soft, breathable everyday tee made from 100% organic cotton, cut for a relaxed modern fit.",
    specs: { Material: "100% organic cotton", Fit: "Relaxed", Care: "Machine wash cold", Sizes: "XS–XXL" },
    keywords: ["tee", "t-shirt", "shirt", "mens shirt", "top"]
  },
  {
    id: "f2", name: "Volt Denim Jacket", category: "mens",
    price: 7387, oldPrice: 9047, rating: 4.6, icon: "🧥", badge: "SALE",
    tagline: "Classic fit, stonewashed denim",
    description: "A timeless stonewashed denim jacket with a classic fit — layers over everything from tees to hoodies.",
    specs: { Material: "100% cotton denim", Fit: "Classic", Care: "Machine wash cold", Sizes: "S–XXL" },
    keywords: ["jacket", "denim jacket", "mens jacket", "outerwear"]
  },
  {
    id: "f3", name: "Volt Flow Midi Dress", category: "womens",
    price: 5727, rating: 4.7, icon: "👗", badge: "NEW",
    tagline: "Lightweight, flowy, breathable",
    description: "A lightweight midi dress with a flowy silhouette, breathable fabric, and an adjustable waist tie.",
    specs: { Material: "Viscose blend", Fit: "Relaxed midi", Care: "Hand wash cold", Sizes: "XS–XL" },
    keywords: ["dress", "midi dress", "womens dress"]
  },
  {
    id: "f4", name: "Volt Wide-Leg Trousers", category: "womens",
    price: 4897, rating: 4.4, icon: "👖",
    tagline: "High-rise, tailored wide-leg",
    description: "High-rise wide-leg trousers with a tailored waistband — dresses up or down effortlessly.",
    specs: { Material: "Cotton twill blend", Fit: "Wide-leg, high-rise", Care: "Machine wash cold", Sizes: "XS–XL" },
    keywords: ["trousers", "pants", "womens pants", "wide leg pants"]
  },
  {
    id: "f5", name: "Volt Runner Sneakers", category: "shoes",
    price: 8217, rating: 4.6, icon: "👟", badge: "NEW",
    tagline: "Lightweight everyday runners",
    description: "Lightweight everyday sneakers with responsive cushioning and a breathable knit upper.",
    specs: { Upper: "Breathable knit", Sole: "Responsive foam", Weight: "245g", Sizes: "US 5–13" },
    keywords: ["sneakers", "shoes", "running shoes", "trainers"]
  },
  {
    id: "f6", name: "Volt Leather Chelsea Boots", category: "shoes",
    price: 12367, oldPrice: 14857, rating: 4.7, icon: "👢", badge: "SALE",
    tagline: "Full-grain leather, elastic side panels",
    description: "Full-grain leather Chelsea boots with elastic side panels and a durable rubber sole — built to last.",
    specs: { Material: "Full-grain leather", Sole: "Rubber", Fit: "True to size", Sizes: "US 6–13" },
    keywords: ["boots", "shoes", "chelsea boots", "leather boots"]
  },
  {
    id: "f7", name: "Volt Canvas Tote", category: "bags",
    price: 3735, rating: 4.3, icon: "👜",
    tagline: "Heavy-duty canvas, everyday carry",
    description: "A heavy-duty canvas tote built for everyday carry — spacious main compartment plus an interior zip pocket.",
    specs: { Material: "Heavyweight canvas", Capacity: "18L", Straps: "Reinforced cotton" },
    keywords: ["tote", "bag", "tote bag", "canvas bag"]
  },
  {
    id: "f8", name: "Volt Weekender Duffel", category: "bags",
    price: 10707, rating: 4.5, icon: "🎒", badge: "NEW",
    tagline: "Water-resistant, carry-on friendly",
    description: "A water-resistant weekender duffel sized to fit as a carry-on, with a dedicated shoe compartment.",
    specs: { Material: "Water-resistant nylon", Capacity: "45L", Feature: "Shoe compartment" },
    keywords: ["duffel", "bag", "weekender", "travel bag", "backpack"]
  },
];

function getCategoriesByDepartment(deptId){
  return CATEGORIES.filter(c => c.department === deptId);
}
function getDepartmentById(id){
  return DEPARTMENTS.find(d => d.id === id);
}

function getProductById(id){
  return PRODUCTS.find(p => p.id === id);
}
function getProductsByCategory(cat){
  return PRODUCTS.filter(p => p.category === cat);
}
function searchProducts(query){
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return PRODUCTS.filter(p => {
    return p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.tagline.toLowerCase().includes(q) ||
      (p.keywords || []).some(k => q.includes(k) || k.includes(q));
  });
}
