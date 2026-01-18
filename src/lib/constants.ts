// Application Constants - Matching Python config.py

// Categories for inventory items
export const CATEGORIES = [
    "Electrical",
    "Chemical",
    "Hand Tools",
    "Consumables",
    "Safety",
    "Others",
] as const;

// Warehouse locations
export const LOCATIONS = ["NSTC", "SNC"] as const;

// External projects for loans
export const EXTERNAL_PROJECTS = ["KASCH", "KAMC", "KSSH Altaif"] as const;

// Work areas/regions
export const AREAS = [
    "OPD",
    "Imeging",
    "Neurodiangnostic",
    "E.R",
    "1s floor",
    "Service Area",
    "ICU 28",
    "ICU 29",
    "O.R",
    "Recovery",
    "RT and Waiting area",
    "Ward 30-31",
    "Ward 40-41",
    "Ward50-51",
] as const;

// Attendance status options
export const ATTENDANCE_STATUSES = [
    "Present",
    "Absent",
    "Vacation",
    "Day Off",
    "Eid Holiday",
    "Sick Leave",
] as const;

// Unit options for inventory
export const UNITS = ["Piece", "Carton", "Set"] as const;

// User roles
export const USER_ROLES = [
    "manager",
    "supervisor",
    "storekeeper",
    "night_supervisor",
] as const;

// Text labels (for internationalization)
export const TEXT = {
    app_title: "NSTC Project Management App",
    login_page: "Login",
    register_page: "Register",
    username: "Username",
    password: "Password",
    fullname: "Full Name",
    region: "Region",
    login_btn: "Login",
    register_btn: "Sign Up",
    logout: "Logout",
    manager_role: "Manager",
    supervisor_role: "Supervisor",
    storekeeper_role: "Store Keeper",
    create_item_title: "➕ Create New Item",
    create_btn: "Create Item",
    ext_tab: "🔄 External & Loans",
    project_loans: "🤝 Project Loans",
    cww_supply: "🏭 Central Supply (CWW)",
    exec_trans: "Execute Transfer",
    refresh_data: "🔄 Refresh Data",
    notes: "Notes / Remarks",
    save_mod: "💾 Save Changes",
    insufficient_stock_sk: "❌ STOP: Issue Qty > NTCC Stock!",
    error_login: "Invalid Username or Password",
    success_reg: "Registered successfully",
    local_inv: "Branch Inventory Reports",
    req_form: "Bulk Order Form",
    role_night_sup: "Night Shift Supervisor (B)",
    select_item: "Select Item",
    qty_req: "Request Qty",
    send_req: "🚀 Send Bulk Order",
    approved_reqs: "📦 Pending Issue (Bulk)",
    issue: "Confirm Issue 📦",
    transfer_btn: "Transfer Stock",
    edit_profile: "Edit Profile",
    new_name: "New Name",
    new_pass: "New Password",
    save_changes: "Save Changes",
    update_btn: "Update",
    cancel_req: "Cancel Request 🗑️",
} as const;

// Type exports
export type Category = (typeof CATEGORIES)[number];
export type Location = (typeof LOCATIONS)[number];
export type ExternalProject = (typeof EXTERNAL_PROJECTS)[number];
export type Area = (typeof AREAS)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type Unit = (typeof UNITS)[number];
export type UserRole = (typeof USER_ROLES)[number];
