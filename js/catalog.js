/* ==========================================================================
   catalog.js — appraisal knowledge base
   Category rules, grade taxonomy, marketplace registry, reference catalog.
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});

  /* ---------- Category rules ---------- */
  // maxLtv  : ceiling ratio against weighted market value
  // floorDays: expected liquidation window (liquidity proxy)
  const CATEGORIES = {
    elektronik: {
      id: 'elektronik',
      label: 'Elektronik / Gadget',
      short: 'Elektronik',
      icon: 'phone',
      maxLtv: 0.8,
      liquidity: 'Tinggi',
      liquidation: '< 7 hari kerja',
      note: 'Elektronik gadget populer — likuiditas tinggi dalam lelang cabang < 7 hari kerja.',
      attributes: ['kapasitas', 'kelengkapan', 'garansi']
    },
    emas: {
      id: 'emas',
      label: 'Emas / Logam Mulia',
      short: 'Emas',
      icon: 'gem',
      maxLtv: 0.9,
      liquidity: 'Sangat tinggi',
      liquidation: '< 24 jam',
      note: 'Logam mulia bersertifikat — likuiditas instan mengikuti indeks buyback harian.',
      attributes: ['berat', 'kadar', 'sertifikat']
    },
    kendaraan: {
      id: 'kendaraan',
      label: 'Kendaraan Bermotor',
      short: 'Kendaraan',
      icon: 'car',
      maxLtv: 0.72,
      liquidity: 'Sedang',
      liquidation: '14–30 hari kerja',
      note: 'Depresiasi kendaraan dipengaruhi pajak, STNK, dan tren harga pasar regional.',
      attributes: ['tahun', 'kilometer', 'pajak']
    }
  };

  /* ---------- Physical grade taxonomy ---------- */
  const GRADES = {
    A: {
      key: 'A',
      label: 'Grade A',
      short: 'Mulus',
      desc: 'Mulus / like new, tanpa bekas pakai berarti',
      ltvAdj: 0.0,
      priceFactor: 1.0,
      tone: 'a'
    },
    B: {
      key: 'B',
      label: 'Grade B',
      short: 'Baret halus',
      desc: 'Baret halus wajar pemakaian, fungsi 100%',
      ltvAdj: -0.02,
      priceFactor: 0.95,
      tone: 'b'
    },
    C: {
      key: 'C',
      label: 'Grade C',
      short: 'Cacat fisik',
      desc: 'Cacat fisik terlihat, fungsi masih normal',
      ltvAdj: -0.05,
      priceFactor: 0.86,
      tone: 'c'
    },
    D: {
      key: 'D',
      label: 'Grade D',
      short: 'Rusak fungsi',
      desc: 'Ada komponen/fungsi tidak berjalan normal',
      ltvAdj: -0.14,
      priceFactor: 0.62,
      tone: 'd'
    }
  };

  const COMPLETENESS = {
    fullset: { key: 'fullset', label: 'Fullset', long: 'Fullset (dus & aksesori)', factor: 1.0 },
    minus_box: { key: 'minus_box', label: 'Tanpa dus', long: 'Unit + aksesori (tanpa dus)', factor: 0.97 },
    unit_only: { key: 'unit_only', label: 'Unit saja', long: 'Unit saja tanpa aksesori', factor: 0.93 }
  };

  /* ---------- Marketplace registry ---------- */
  const PLATFORMS = {
    tokopedia: {
      name: 'Tokopedia',
      badge: 'Official / Power',
      color: '#0D8A48',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: 'bag',
      host: 'tokopedia.com'
    },
    shopee: {
      name: 'Shopee',
      badge: 'Star Seller',
      color: '#EA580C',
      bg: '#FFF7ED',
      border: '#FED7AA',
      icon: 'storefront',
      host: 'shopee.co.id'
    },
    olx: {
      name: 'OLX Indonesia',
      badge: 'Verified User',
      color: '#2563EB',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      icon: 'swap',
      host: 'olx.co.id'
    },
    bukalapak: {
      name: 'Bukalapak',
      badge: 'Power Merchant',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      icon: 'bag',
      host: 'bukalapak.com'
    },
    blibli: {
      name: 'Blibli',
      badge: 'Official Store',
      color: '#0284C7',
      bg: '#F0F9FF',
      border: '#BAE6FD',
      icon: 'storefront',
      host: 'blibli.com'
    },
    carousell: {
      name: 'Carousell',
      badge: 'Trusted Seller',
      color: '#7C3AED',
      bg: '#F5F3FF',
      border: '#DDD6FE',
      icon: 'swap',
      host: 'carousell.id'
    },
    fbm: {
      name: 'Facebook Marketplace',
      badge: 'Local Seller',
      color: '#1D4ED8',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      icon: 'users',
      host: 'facebook.com'
    },
    antam: {
      name: 'Antam Logam Mulia',
      badge: 'Official Index',
      color: '#B45309',
      bg: '#FFFBEB',
      border: '#FDE68A',
      icon: 'gem',
      host: 'logammulia.com'
    },
    pegadaian: {
      name: 'Pegadaian Gold Index',
      badge: 'Institutional',
      color: '#0D8A48',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: 'shield',
      host: 'pegadaian.co.id'
    },
    galeri24: {
      name: 'Galeri 24',
      badge: 'Official',
      color: '#B45309',
      bg: '#FEF3C7',
      border: '#FDE68A',
      icon: 'gem',
      host: 'galeri24.co.id'
    }
  };

  /* ---------- Reference product catalog ---------- */
  // base = national secondary-market anchor price (IDR)
  // gold items use unit 'gram' and are priced from the daily Antam index
  const PRODUCTS = [
    {
      id: 'ip13pm256',
      cat: 'elektronik',
      name: 'iPhone 13 Pro Max 256GB',
      brand: 'Apple Inc.',
      model: 'A2643',
      spec: 'Sierra Blue · 6.7" ProMotion · Baterai 89%',
      base: 11200000,
      liquidity: 'Tinggi',
      volatility: 'sedang',
      volatilityAdj: -0.01,
      platforms: ['tokopedia', 'shopee', 'olx', 'carousell', 'fbm', 'bukalapak'],
      sample: 'phone',
      conditionRef: 'Grade B Fullset',
      city: 'Jakarta'
    },
    {
      id: 'redmi12',
      cat: 'elektronik',
      name: 'Xiaomi Redmi Note 12 128GB',
      brand: 'Xiaomi Communications',
      model: '22111317G',
      spec: 'Onyx Grey · 6.67" AMOLED · Baterai 94%',
      base: 1250000,
      liquidity: 'Tinggi',
      volatility: 'sedang',
      volatilityAdj: -0.01,
      platforms: ['tokopedia', 'shopee', 'olx', 'fbm', 'bukalapak'],
      sample: 'phone',
      conditionRef: 'Grade B Fullset',
      city: 'Jakarta'
    },
    {
      id: 's23u256',
      cat: 'elektronik',
      name: 'Samsung Galaxy S23 Ultra 256GB',
      brand: 'Samsung Electronics',
      model: 'SM-S918B',
      spec: 'Phantom Black · 6.8" QHD+ · S-Pen',
      base: 9800000,
      liquidity: 'Tinggi',
      volatility: 'sedang',
      volatilityAdj: -0.01,
      platforms: ['tokopedia', 'shopee', 'olx', 'blibli', 'fbm'],
      sample: 'phone',
      conditionRef: 'Grade B Fullset',
      city: 'Jakarta'
    },
    {
      id: 'mba-m2',
      cat: 'elektronik',
      name: 'MacBook Air M2 8/256',
      brand: 'Apple Inc.',
      model: 'A2681',
      spec: 'Midnight · M2 8-core · Cycle count 142',
      base: 10500000,
      liquidity: 'Tinggi',
      volatility: 'sedang',
      volatilityAdj: -0.005,
      platforms: ['tokopedia', 'shopee', 'olx', 'carousell', 'bukalapak'],
      sample: 'laptop',
      conditionRef: 'Grade B Fullset',
      city: 'Jakarta'
    },
    {
      id: 'ipadpro11',
      cat: 'elektronik',
      name: 'iPad Pro 11" M2 128GB',
      brand: 'Apple Inc.',
      model: 'A2759',
      spec: 'Space Grey · Wi-Fi · AppleCare s/d 2027',
      base: 9700000,
      liquidity: 'Tinggi',
      volatility: 'sedang',
      volatilityAdj: -0.01,
      platforms: ['tokopedia', 'shopee', 'olx', 'blibli'],
      sample: 'tablet',
      conditionRef: 'Grade B Fullset',
      city: 'Jakarta'
    },
    {
      id: 'sony-a7iii',
      cat: 'elektronik',
      name: 'Sony Alpha A7 III Body',
      brand: 'Sony Corporation',
      model: 'ILCE-7M3',
      spec: 'Full-frame 24MP · SC 38.420 · Body only',
      base: 15500000,
      liquidity: 'Sedang',
      volatility: 'rendah',
      volatilityAdj: 0.0,
      platforms: ['tokopedia', 'olx', 'carousell', 'fbm', 'bukalapak'],
      sample: 'camera',
      conditionRef: 'Grade B Body',
      city: 'Jakarta'
    },
    {
      id: 'antam5',
      cat: 'emas',
      name: 'Emas Antam 5 gram',
      brand: 'PT Aneka Tambang Tbk',
      model: 'LM Antam',
      spec: 'Certicard · Seri LM · 99,99%',
      base: 1920000,
      unit: 'gram',
      weight: 5,
      karat: 24,
      liquidity: 'Sangat tinggi',
      volatility: 'rendah',
      volatilityAdj: 0.0,
      platforms: ['antam', 'pegadaian', 'galeri24', 'tokopedia', 'shopee'],
      sample: 'gold',
      conditionRef: 'Certicard utuh',
      city: 'Nasional'
    },
    {
      id: 'antam10',
      cat: 'emas',
      name: 'Emas Antam 10 gram',
      brand: 'PT Aneka Tambang Tbk',
      model: 'LM Antam',
      spec: 'Certicard · Seri LM · 99,99%',
      base: 1920000,
      unit: 'gram',
      weight: 10,
      karat: 24,
      liquidity: 'Sangat tinggi',
      volatility: 'rendah',
      volatilityAdj: 0.0,
      platforms: ['antam', 'pegadaian', 'galeri24', 'tokopedia', 'shopee'],
      sample: 'gold',
      conditionRef: 'Certicard utuh',
      city: 'Nasional'
    },
    {
      id: 'perhiasan22',
      cat: 'emas',
      name: 'Perhiasan Emas 22K',
      brand: 'Koleksi Perhiasan',
      model: '22K',
      spec: 'Gelang rantai · 91,6% · Tanpa sertifikat',
      base: 1760000,
      unit: 'gram',
      weight: 8,
      karat: 22,
      liquidity: 'Tinggi',
      volatility: 'rendah',
      volatilityAdj: -0.01,
      platforms: ['pegadaian', 'antam', 'galeri24', 'tokopedia'],
      sample: 'gold',
      conditionRef: 'Perhiasan 22K',
      city: 'Nasional'
    },
    {
      id: 'vario160',
      cat: 'kendaraan',
      name: 'Honda Vario 160 CBS 2023',
      brand: 'PT Astra Honda Motor',
      model: 'Vario 160',
      spec: '2023 · 8.400 km · Pajak hidup',
      base: 21500000,
      liquidity: 'Sedang',
      volatility: 'tinggi',
      volatilityAdj: -0.02,
      platforms: ['olx', 'fbm', 'tokopedia', 'carousell'],
      sample: 'bike',
      conditionRef: 'Grade B Standar',
      city: 'Jakarta'
    },
    {
      id: 'nmax23',
      cat: 'kendaraan',
      name: 'Yamaha NMAX 155 ABS 2023',
      brand: 'PT Yamaha Indonesia',
      model: 'NMAX 155',
      spec: '2023 · 11.200 km · STNK lengkap',
      base: 27500000,
      liquidity: 'Sedang',
      volatility: 'tinggi',
      volatilityAdj: -0.02,
      platforms: ['olx', 'fbm', 'carousell', 'tokopedia'],
      sample: 'bike',
      conditionRef: 'Grade B Standar',
      city: 'Jakarta'
    }
  ];

  /* ---------- Vision phrase bank (agent narrative) ---------- */
  const VISION_SIGNALS = {
    phone: ['Bodi aluminium terdeteksi', 'Modul triple-camera cocok', 'Layar tanpa dead pixel', 'IMEI 15 digit terbaca'],
    tablet: ['Bezel simetris terdeteksi', 'Port USB-C utuh', 'Layar tanpa shadow'],
    laptop: ['Engsel presisi terdeteksi', 'Keyboard backlight aktif', 'Logo tutup tajam'],
    camera: ['Mount E-mount terdeteksi', 'Sensor bersih tanpa jamur', 'Dial mode utuh'],
    gold: ['Permukaan emas 99,99%', 'Certicard & seri LM terbaca', 'Berat terverifikasi timbangan'],
    bike: ['Rangka & bodi orisinal', 'Speedometer 8.400 km', 'STNK & BPKB terlihat']
  };

  TK.catalog = {
    CATEGORIES,
    GRADES,
    COMPLETENESS,
    PLATFORMS,
    PRODUCTS,
    VISION_SIGNALS,
    byId(id) {
      return PRODUCTS.find((p) => p.id === id) || null;
    },
    byCat(cat) {
      return PRODUCTS.filter((p) => p.cat === cat);
    },
    categoryOf(p) {
      return CATEGORIES[p && p.cat] || CATEGORIES.elektronik;
    }
  };
})(window);
