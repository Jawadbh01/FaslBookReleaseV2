export type Lang = "en" | "ur" | "sd";

export const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    home: "Home", khata: "Khata", godown: "Godown", dealer: "Dealer", team: "Team",
    // Dashboard header
    dashboard: "Dashboard", good_morning: "Good Morning", good_afternoon: "Good Afternoon", good_evening: "Good Evening",
    // Summary cards
    income: "Income", expense: "Expense", profit: "Profit", inventory: "Inventory",
    pending_loans: "Pending Loans", dealer_dues: "Dealer Dues",
    vs_last_month: "vs last month",
    // Season
    current_season: "Current Season", rabi: "Rabi", kharif: "Kharif",
    no_crops: "No crops added yet",
    // Quick actions
    quick_actions: "Quick Actions", view_all: "View All",
    add_expense: "Expense", add_income: "Income", stock_transfer: "Stock", attendance: "Attendance",
    reports: "Reports",
    // Activity
    recent_activity: "Recent Activity", no_activity: "No activity yet",
    no_activity_sub: "Start by adding expenses or income",
    // Farm ID
    farm_id_label: "Your Farm ID", share_with_team: "Share with team", copy: "Copy", copied: "Copied!",
    // Parcels
    my_land: "My Land", total_acres: "total acres", parcel: "parcel", parcels: "parcels",
    search_parcels: "Search parcels...", no_parcels: "No parcels yet", no_parcels_sub: "Add your first land parcel to get started",
    no_parcels_found: "No parcels found", try_different: "Try a different search term",
    add_first_parcel: "Add First Parcel", add_parcel: "Add New Parcel", edit_parcel: "Edit Parcel",
    update_parcel: "Update Parcel", save_parcel: "Save Parcel",
    parcel_name: "Parcel Name", acres: "Acres", location: "Location",
    assign_farmer: "Assign Farmer (Optional)", no_farmer: "No farmer assigned",
    no_farmers_yet: "No farmers in your team yet. Add farmers first.",
    status: "Status", active: "Active", fallow: "Fallow", leased: "Leased", inactive: "Inactive",
    details: "Details", no_active_crop: "No active crop", growing: "Growing",
    parcel_name_placeholder: "e.g. Green Field, North Plot",
    location_placeholder: "Village, Area or GPS location",
    fill_required: "Please fill Farm Name, Acres and Location",
    acres_invalid: "Acres must be a valid number",
    save_failed: "Failed to save. Please try again.",
    update_details: "Update parcel details", add_land: "Add a new land parcel",
    // Approvals
    approvals: "Approvals",
    // Language
    lang_en: "EN", lang_ur: "UR", lang_sd: "SD",
    // Common
    logout: "Logout and use different account",
    notifications: "Notifications",
    farmer: "Farmer", crop: "Crop",
  },
  ur: {
    // Nav
    home: "گھر", khata: "کھاتہ", godown: "گودام", dealer: "ڈیلر", team: "ٹیم",
    // Dashboard header
    dashboard: "ڈیش بورڈ", good_morning: "صبح بخیر", good_afternoon: "خوش دوپہر", good_evening: "شام بخیر",
    // Summary cards
    income: "آمدن", expense: "خرچ", profit: "منافع", inventory: "گودام",
    pending_loans: "قرضے", dealer_dues: "ڈیلر واجبات",
    vs_last_month: "گزشتہ مہینے سے",
    // Season
    current_season: "موسمی فصل", rabi: "ربیع", kharif: "خریف",
    no_crops: "ابھی کوئی فصل نہیں",
    // Quick actions
    quick_actions: "فوری اقدام", view_all: "سب دیکھیں",
    add_expense: "خرچ", add_income: "آمدن", stock_transfer: "اسٹاک", attendance: "حاضری",
    reports: "رپورٹ",
    // Activity
    recent_activity: "حالیہ سرگرمی", no_activity: "ابھی کوئی سرگرمی نہیں",
    no_activity_sub: "خرچ یا آمدن شامل کریں",
    // Farm ID
    farm_id_label: "فارم آئی ڈی", share_with_team: "ٹیم کے ساتھ شیئر کریں", copy: "کاپی", copied: "کاپی ہو گیا!",
    // Parcels
    my_land: "میری زمین", total_acres: "کل ایکڑ", parcel: "پلاٹ", parcels: "پلاٹ",
    search_parcels: "پلاٹ تلاش کریں...", no_parcels: "ابھی کوئی پلاٹ نہیں", no_parcels_sub: "اپنا پہلا پلاٹ شامل کریں",
    no_parcels_found: "کوئی پلاٹ نہیں ملا", try_different: "دوسرے الفاظ سے تلاش کریں",
    add_first_parcel: "پہلا پلاٹ شامل کریں", add_parcel: "نیا پلاٹ", edit_parcel: "پلاٹ میں ترمیم",
    update_parcel: "پلاٹ اپ ڈیٹ کریں", save_parcel: "پلاٹ محفوظ کریں",
    parcel_name: "پلاٹ کا نام", acres: "ایکڑ", location: "مقام",
    assign_farmer: "کسان مقرر کریں (اختیاری)", no_farmer: "کوئی کسان مقرر نہیں",
    no_farmers_yet: "ابھی کوئی کسان نہیں۔ پہلے کسان شامل کریں۔",
    status: "حالت", active: "فعال", fallow: "بنجر", leased: "لیز", inactive: "غیر فعال",
    details: "تفصیل", no_active_crop: "کوئی فعال فصل نہیں", growing: "اگ رہا ہے",
    parcel_name_placeholder: "مثلاً سبز کھیت، شمالی پلاٹ",
    location_placeholder: "گاؤں، علاقہ یا GPS مقام",
    fill_required: "نام، ایکڑ اور مقام بھریں",
    acres_invalid: "ایکڑ درست نمبر ہونا چاہیے",
    save_failed: "محفوظ کرنے میں ناکامی۔ دوبارہ کوشش کریں۔",
    update_details: "پلاٹ کی تفصیل اپ ڈیٹ کریں", add_land: "نیا زمینی پلاٹ شامل کریں",
    approvals: "منظوریاں",
    lang_en: "EN", lang_ur: "UR", lang_sd: "SD",
    logout: "لاگ آؤٹ کریں",
    notifications: "اطلاعات",
    farmer: "کسان", crop: "فصل",
  },
  sd: {
    // Nav
    home: "گھر", khata: "کھاتو", godown: "گودام", dealer: "ڊيلر", team: "ٽيم",
    // Dashboard header
    dashboard: "ڊيش بورڊ", good_morning: "صبح جو خير", good_afternoon: "منجهند جو خير", good_evening: "شام جو خير",
    // Summary cards
    income: "آمدني", expense: "خرچ", profit: "فائدو", inventory: "گودام",
    pending_loans: "قرض", dealer_dues: "ڊيلر واجبات",
    vs_last_month: "پوئين مهيني کان",
    // Season
    current_season: "موسمي فصل", rabi: "ربيع", kharif: "خريف",
    no_crops: "اڃا ڪا فصل ناهي",
    // Quick actions
    quick_actions: "تڪڙا قدم", view_all: "سڀ ڏسو",
    add_expense: "خرچ", add_income: "آمدني", stock_transfer: "اسٽاڪ", attendance: "حاضري",
    reports: "رپورٽ",
    // Activity
    recent_activity: "تازي سرگرمي", no_activity: "اڃا ڪا سرگرمي ناهي",
    no_activity_sub: "خرچ يا آمدني شامل ڪريو",
    // Farm ID
    farm_id_label: "فارم آئي ڊي", share_with_team: "ٽيم سان شيئر ڪريو", copy: "ڪاپي", copied: "ڪاپي ٿيو!",
    // Parcels
    my_land: "منهنجي زمين", total_acres: "ڪل ايڪڙ", parcel: "پلاٽ", parcels: "پلاٽ",
    search_parcels: "پلاٽ ڳوليو...", no_parcels: "اڃا ڪو پلاٽ ناهي", no_parcels_sub: "پهريون پلاٽ شامل ڪريو",
    no_parcels_found: "ڪو پلاٽ نه مليو", try_different: "ٻين لفظن سان ڳوليو",
    add_first_parcel: "پهريون پلاٽ شامل ڪريو", add_parcel: "نئون پلاٽ", edit_parcel: "پلاٽ ۾ تبديلي",
    update_parcel: "پلاٽ اپڊيٽ ڪريو", save_parcel: "پلاٽ محفوظ ڪريو",
    parcel_name: "پلاٽ جو نالو", acres: "ايڪڙ", location: "جڳهه",
    assign_farmer: "هاري مقرر ڪريو (اختياري)", no_farmer: "ڪو هاري مقرر ناهي",
    no_farmers_yet: "اڃا ڪو هاري ناهي. پهريون هاري شامل ڪريو.",
    status: "حالت", active: "فعال", fallow: "پرتي", leased: "ليز", inactive: "غير فعال",
    details: "تفصيل", no_active_crop: "ڪا فعال فصل ناهي", growing: "اڳائيندو",
    parcel_name_placeholder: "مثال: سائو کيت، اتر پلاٽ",
    location_placeholder: "ڳوٺ، علائقو يا GPS جڳهه",
    fill_required: "نالو، ايڪڙ ۽ جڳهه ڀريو",
    acres_invalid: "ايڪڙ درست نمبر هجڻ گهرجي",
    save_failed: "محفوظ ڪرڻ ۾ ناڪامي. ٻيهر ڪوشش ڪريو.",
    update_details: "پلاٽ جي تفصيل اپڊيٽ ڪريو", add_land: "نئون زميني پلاٽ شامل ڪريو",
    approvals: "منظوريون",
    lang_en: "EN", lang_ur: "UR", lang_sd: "SD",
    logout: "لاگ آئوٽ ڪريو",
    notifications: "اطلاع",
    farmer: "هاري", crop: "فصل",
  },
};
