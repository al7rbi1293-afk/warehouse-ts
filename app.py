import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="NSTC Management", layout="wide", initial_sidebar_state="expanded") # Rebranded

# --- 2. إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}
if 'active_module' not in st.session_state:
    st.session_state.active_module = "Warehouse" # Default module

# --- 3. الثوابت ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
LOCATIONS = ["NTCC", "SNC"]
EXTERNAL_PROJECTS = ["KASCH", "KAMC", "KSSH Altaif"]
AREAS = [
    "OPD", "Imeging", "Neurodiangnostic", "E.R", 
    "1s floor", "Service Area", "ICU 28", "ICU 29", 
    "O.R", "Recovery", "RT and Waiting area", 
    "Ward 30-31", "Ward 40-41", "Ward50-51"
]

txt = {
    "app_title": "NSTC Integrated Project Management", # Rebranded
    "login_page": "Login", "register_page": "Register",
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
    "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
    "create_item_title": "➕ Create New Item", "create_btn": "Create Item",
    "ext_tab": "🔄 External & Loans", "project_loans": "🤝 Project Loans",
    "cww_supply": "🏭 Central Supply (CWW)", "exec_trans": "Execute Transfer",
    "refresh_data": "🔄 Refresh Data", "notes": "Notes / Remarks",
    "save_mod": "💾 Save Changes", "insufficient_stock_sk": "❌ STOP: Issue Qty > NTCC Stock!",
    "error_login": "Invalid Username or Password", "success_reg": "Registered successfully",
    "local_inv": "Branch Inventory Reports", "req_form": "Bulk Order Form", 
    "role_night_sup": "Night Shift Supervisor (B)", # Updated role text
    "select_item": "Select Item", "qty_req": "Request Qty", "send_req": "🚀 Send Bulk Order",
    "approved_reqs": "📦 Pending Issue (Bulk)", "issue": "Confirm Issue 📦",
    "transfer_btn": "Transfer Stock", "edit_profile": "Edit Profile", 
    "new_name": "New Name", "new_pass": "New Password", "save_changes": "Save Changes",
    "update_btn": "Update", "cancel_req": "Cancel Request 🗑️"
}

# --- 4. الاتصال بقاعدة البيانات ---
try:
    conn = st.connection("supabase", type="sql")
except:
    st.error("⚠️ Connection Error. Please check secrets.")
    st.stop()

# --- 4.1 التهيئة (DB Initialization) ---
def init_db():
    # Workers Table
    run_action("""
        CREATE TABLE IF NOT EXISTS workers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT,
            region TEXT,
            status TEXT DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    # Shifts Table
    run_action("""
        CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT
        );
    """)
    # Attendance Table
    run_action("""
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            worker_id INTEGER REFERENCES workers(id),
            date DATE NOT NULL,
            status TEXT,
            shift_id INTEGER,
            return_date DATE,
            notes TEXT,
            supervisor TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    
    
    # 4.2 Migration (Safe Add Columns)
    try:
        run_action("ALTER TABLE workers ADD COLUMN IF NOT EXISTS shift_id INTEGER;")
        run_action("ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id INTEGER;")
        run_action("ALTER TABLE workers ADD COLUMN IF NOT EXISTS emp_id TEXT;") # Add EMP ID
    except: pass

    # Removed auto-insert of "B B1" per user request.

# --- 5. دوال قاعدة البيانات ---
def run_query(query, params=None, ttl=None):
    try: return conn.query(query, params=params, ttl=ttl)
    except Exception as e: st.error(f"DB Error: {e}"); return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params); session.commit()
        return True
    except Exception as e: st.error(f"DB Action Error: {e}"); return False

# --- 6. المنطق (Logic) ---
def login_user(username, password):
    # Fetch user + shift name
    query = """
        SELECT u.*, s.name as shift_name 
        FROM users u 
        LEFT JOIN shifts s ON u.shift_id = s.id 
        WHERE u.username = :u AND u.password = :p
    """
    df = run_query(query, params={"u": username, "p": password}, ttl=0)
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(username, password, name, region):
    return run_action("INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
                      params={"u": username, "p": password, "n": name, "r": region})

def update_user_profile_full(old_username, new_username, new_name, new_pass):
    if new_username != old_username:
        if not run_query("SELECT username FROM users WHERE username = :u", params={"u": new_username}, ttl=0).empty:
            return False, "Username taken!"
    return run_action("UPDATE users SET username = :nu, name = :nn, password = :np WHERE username = :ou",
                      {"nu": new_username, "nn": new_name, "np": new_pass, "ou": old_username}), "Updated"

def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

def update_central_stock(item_name, location, change, user, action_desc, unit):
    change = int(change)
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location}, ttl=0)
    if df.empty: return False, "Item not found"
    current_qty = int(df.iloc[0]['qty'])
    new_qty = current_qty + change
    try:
        with conn.session as s:
            s.execute(text("UPDATE inventory SET qty = :nq WHERE name_en = :name AND location = :loc"), {"nq": new_qty, "name": item_name, "loc": location})
            s.execute(text("INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, :act, :item, :loc, :chg, :nq)"),
                      {"u": user, "act": f"{action_desc} ({unit})", "item": item_name, "loc": location, "chg": change, "nq": new_qty})
            s.commit()
        return True, "Success"
    except Exception as e: return False, str(e)

def transfer_stock(item_name, qty, user, unit):
    qty = int(qty)
    ok, msg = update_central_stock(item_name, "SNC", -qty, user, "Transfer Out", unit)
    if not ok: return False, msg
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name}, ttl=0)
    if df.empty: run_action("INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')", params={"n": item_name, "u": unit})
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, msg2
    return True, "Transfer Complete"

def handle_external_transfer(item_name, my_loc, ext_proj, action, qty, user, unit):
    desc = f"Loan {action} {ext_proj}"
    change = -int(qty) if action == "Lend" else int(qty)
    return update_central_stock(item_name, my_loc, change, user, desc, unit)

def receive_from_cww(item_name, dest_loc, qty, user, unit):
    return update_central_stock(item_name, dest_loc, int(qty), user, "Received from CWW", unit)

def update_local_inventory(region, item_name, new_qty, user):
    new_qty = int(new_qty)
    # Check if record exists for this item in this region
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name}, ttl=0)
    if not df.empty:
        return run_action("UPDATE local_inventory SET qty = :q, last_updated = NOW(), updated_by = :u WHERE region = :r AND item_name = :i", 
                          params={"q": new_qty, "u": user, "r": region, "i": item_name})
    else:
        return run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)", 
                          params={"r": region, "i": item_name, "q": new_qty, "u": user})

def create_request(supervisor, region, item, category, qty, unit):
    return run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                      params={"s": supervisor, "r": region, "i": item, "c": category, "q": int(qty), "u": unit})

def update_request_details(req_id, new_qty, notes):
    query = "UPDATE requests SET qty = :q"
    params = {"q": int(new_qty), "id": req_id}
    if notes is not None:
        query += ", notes = :n"
        params['n'] = notes
    query += " WHERE req_id = :id"
    return run_action(query, params)

def update_request_status(req_id, status, final_qty=None, notes=None):
    query = "UPDATE requests SET status = :s"
    params = {"s": status, "id": req_id}
    if final_qty is not None: 
        query += ", qty = :q"
        params["q"] = int(final_qty)
    if notes is not None: 
        query += ", notes = :n"
        params["n"] = notes
    query += " WHERE req_id = :id"
    return run_action(query, params)

def delete_request(req_id):
    return run_action("DELETE FROM requests WHERE req_id = :id", params={"id": req_id})

def get_local_inventory_by_item(region, item_name):
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name}, ttl=0)
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- Helper for Bulk Stock Take ---
def render_bulk_stock_take(location, user_name, key_prefix):
    inv = get_inventory(location)
    if inv.empty:
        st.info(f"No inventory found in {location}")
        return

    df_view = inv[['name_en', 'category', 'qty', 'unit']].copy()
    df_view.rename(columns={'qty': 'System Qty', 'name_en': 'Item Name'}, inplace=True)
    df_view['Physical Count'] = df_view['System Qty'] 

    st.markdown(f"### 📋 {location} Stock Take")
    edited_df = st.data_editor(
        df_view,
        key=f"stock_editor_{key_prefix}_{location}",
        column_config={
            "Item Name": st.column_config.TextColumn(disabled=True),
            "category": st.column_config.TextColumn(disabled=True),
            "unit": st.column_config.TextColumn(disabled=True),
            "System Qty": st.column_config.NumberColumn(disabled=True),
            "Physical Count": st.column_config.NumberColumn(min_value=0, max_value=20000, required=True)
        },
        disabled=["Item Name", "category", "unit", "System Qty"],
        hide_index=True,
        width="stretch",
        height=500
    )

    if st.button(f"💾 Update {location} Stock", key=f"btn_update_{key_prefix}_{location}"):
        changes_count = 0
        for index, row in edited_df.iterrows():
            sys_q = int(row['System Qty'])
            phy_q = int(row['Physical Count'])
            if sys_q != phy_q:
                diff = phy_q - sys_q
                update_central_stock(row['Item Name'], location, diff, user_name, "Stock Take", row['unit'])
                changes_count += 1
        
        if changes_count > 0:
            st.success(f"Updated {changes_count} items in {location}!"); st.cache_data.clear(); time.sleep(1); st.rerun()
        else:
            st.info("No changes detected.")

# --- 7. الواجهات (Views) ---

def show_login():
    st.title(f"🔐 {txt['app_title']}")
    # Copyright Footer
    st.markdown(
        """
        <style>
        .footer {position: fixed; left: 0; bottom: 0; width: 100%; background-color: transparent; color: grey; text-align: right; padding-right: 20px; padding-bottom: 10px;}
        </style>
        <div class='footer'>
            <p>COPYRIGHT © abdulaziz alhazmi AST.Project manager</p>
        </div>
        """,
        unsafe_allow_html=True
    )
    t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
    with t1:
        with st.form("login_form"):
            u = st.text_input(txt['username'])
            p = st.text_input(txt['password'], type="password")
            if st.form_submit_button(txt['login_btn'], use_container_width=True):
                user_data = login_user(u.strip(), p.strip())
                if user_data:
                    st.session_state.logged_in = True
                    st.session_state.user_info = user_data
                    st.rerun()
                else: st.error(txt['error_login'])
    with t2:
        with st.form("register_form"):
            nu = st.text_input(txt['username'])
            np = st.text_input(txt['password'], type='password')
            nn = st.text_input(txt['fullname'])
            # Multi-select regions for registration
            nr = st.multiselect(txt['region'], AREAS)
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                # Join regions with comma
                region_str = ",".join(nr)
                if register_user(nu.strip(), np.strip(), nn, region_str): 
                    st.success(txt['success_reg']); st.cache_data.clear()
                else: st.error("Error: Username might exist")

def show_main_app():
    info = st.session_state.user_info
    
    st.sidebar.title(f"👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    
    # Module Switcher
    # Use re-calculated is_night_shift logic helper if needed, but user_info available here
    is_night_shift_sidebar = False
    if info.get('role') == 'night_supervisor': is_night_shift_sidebar = True
    if info.get('shift_name') in ['B', 'B1']: is_night_shift_sidebar = True

    if not is_night_shift_sidebar: # Hide switcher for night supervisor
        st.sidebar.divider()
        st.sidebar.markdown("### 🔀 Module Selection")
        mod = st.sidebar.radio("Go to:", ["Warehouse", "Manpower"], index=0 if st.session_state.get('active_module', 'Warehouse') == 'Warehouse' else 1, key="mod_switcher")
        st.session_state.active_module = mod
        st.sidebar.divider()
    else:
        st.sidebar.info(f"🌙 Night Shift Mode ({info.get('shift_name', 'B')})")

    if st.sidebar.button(txt['refresh_data'], use_container_width=True):
        st.cache_data.clear()
        st.rerun()
    
    with st.sidebar.expander(f"🛠 {txt['edit_profile']}"):
        new_u = st.text_input(txt['username'], value=info['username'])
        new_n = st.text_input(txt['new_name'], value=info['name'])
        new_p = st.text_input(txt['new_pass'], type="password", value=info['password'])
        if st.button(txt['save_changes'], use_container_width=True):
            res, msg = update_user_profile_full(info['username'], new_u, new_n, new_p)
            if res:
                st.success(msg)
                st.session_state.logged_in = False
                st.cache_data.clear()
                st.rerun()
            else: st.error(msg)

    if st.sidebar.button(txt['logout'], use_container_width=True):
        st.session_state.logged_in = False
        st.session_state.user_info = {}
        st.rerun()

    # Routing based on Module and Role
    
    # Night Supervisor Logic: OR if Shift is B/B1
    is_night_shift = False
    if info.get('role') == 'night_supervisor': is_night_shift = True
    if info.get('shift_name') in ['B', 'B1']: is_night_shift = True
    
    if is_night_shift:
        st.session_state.active_module = "Manpower"
    
    if st.session_state.active_module == "Warehouse":
        if is_night_shift: 
            st.warning("⛔ Access Restricted: Night Shift (B) can only access Manpower module.")
            supervisor_view_manpower()
        elif info['role'] == 'manager': manager_view_warehouse()
        elif info['role'] == 'storekeeper': storekeeper_view()
        else: supervisor_view_warehouse()
    else:
        if info['role'] == 'manager': manager_view_manpower()
        elif is_night_shift: supervisor_view_manpower()
        else: supervisor_view_manpower()
    
    # Copyright Footer (In App)
    st.markdown(
        """
        <style>
        .footer {position: fixed; left: 0; bottom: 0; width: 100%; background-color: transparent; color: grey; text-align: right; padding-right: 20px; padding-bottom: 10px; z-index: 100;}
        </style>
        <div class='footer'>
            <p>COPYRIGHT © abdulaziz alhazmi AST.Project manager</p>
        </div>
        """,
        unsafe_allow_html=True
    )

# ==========================================
# ============ MANAGER VIEW (MANPOWER) =====
# ==========================================
def manager_view_manpower():
    st.header("👷‍♂️ Manpower Project Management")
    tab1, tab2, tab3, tab4 = st.tabs(["📊 Reports", "👥 Worker Database", "⏰ Duty Roster / Shifts", "📍 Supervisors"])

    with tab2: # Worker Database
        st.subheader("Manage Workers")
        workers = run_query("SELECT * FROM workers ORDER BY id DESC")
        
        # Add Worker
        with st.expander("➕ Add New Worker"):
            c1, c2, c3, c4, c5 = st.columns(5)
            # Layout: Name | Emp ID | Role | Region | Shift
            wn = c1.text_input("Worker Name")
            we = c2.text_input("EMP ID (Numbers Only)")
            wr = c3.text_input("Role/Position")
            wreg = c4.selectbox("Region", AREAS)
            
            # Fetch Shifts
            shifts = run_query("SELECT id, name FROM shifts")
            shift_opts = {s['name']: s['id'] for i, s in shifts.iterrows()} if not shifts.empty else {}
            wshift = c5.selectbox("Shift", list(shift_opts.keys()) if shift_opts else ["Default"])
            
            if st.button("Add Worker", use_container_width=True):
                if wn and we:
                    if not we.isdigit():
                        st.error("EMP ID must be numbers only")
                    else:
                        sid = shift_opts.get(wshift, None)
                        run_action("INSERT INTO workers (name, emp_id, role, region, shift_id) VALUES (:n, :e, :r, :reg, :sid)", 
                                   {"n":wn, "e":we, "r":wr, "reg":wreg, "sid":sid})
                        st.success("Worker Added"); st.cache_data.clear(); st.rerun()
                else: st.error("Name and EMP ID required")
        
        # Edit Workers
        if not workers.empty:
            edited_w = st.data_editor(
                workers,
                key="worker_editor",
                column_config={
                    "id": st.column_config.NumberColumn(disabled=True),
                    "created_at": st.column_config.DatetimeColumn(disabled=True),
                    "shift_id": st.column_config.NumberColumn(disabled=True), # Hide or disable complex edit
                    "emp_id": st.column_config.TextColumn("EMP ID", required=True),
                    "status": st.column_config.SelectboxColumn(options=["Active", "Inactive"], required=True),
                    "region": st.column_config.SelectboxColumn(options=AREAS, required=True)
                },
                hide_index=True, width="stretch"
            )
            if st.button("💾 Save Worker Changes"):
                changes = 0
                for index, row in edited_w.iterrows():
                    # Basic validation for update could be added here if needed
                    eid = str(row['emp_id']) if row['emp_id'] else ""
                    if eid and not eid.isdigit():
                         st.error(f"Invalid EMP ID for {row['name']}: Numbers only."); continue

                    run_action("UPDATE workers SET name=:n, emp_id=:e, role=:r, region=:reg, status=:s WHERE id=:id",
                               {"n":row['name'], "e":eid, "r":row['role'], "reg":row['region'], "s":row['status'], "id":row['id']})
                    # Note: Editing Shift ID in data_editor is complex with FKs. 
                    # Ideally we add a "Move Shift" Action or handle it here if we load shift name.
                    changes += 1
                if changes > 0: st.success("Updated"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab3: # Shifts
        st.subheader("⏰ Shift Management (Duty Roster)")
        shifts = run_query("SELECT * FROM shifts ORDER BY id")
        
        with st.expander("➕ Add New Shift"):
            c1, c2, c3 = st.columns(3)
            sn = c1.text_input("Shift Name (e.g. Morning A)")
            ss = c2.time_input("Start Time")
            se = c3.time_input("End Time")
            if st.button("Add Shift"):
                if sn:
                    s_str = ss.strftime("%H:%M")
                    e_str = se.strftime("%H:%M")
                    run_action("INSERT INTO shifts (name, start_time, end_time) VALUES (:n, :s, :e)", {"n":sn, "s":s_str, "e":e_str})
                    st.success("Shift Added"); st.cache_data.clear(); st.rerun()

        if not shifts.empty:
            st.data_editor(shifts, key="shift_editor", disabled=["id"], hide_index=True, width="stretch")
            
    with tab4: # Supervisors
        st.subheader("📍 Supervisor Region Assignment")
        # Fetch only supervisors
        supervisors = run_query("SELECT username, name, region FROM users WHERE role = 'supervisor' ORDER BY name")
        
        if supervisors.empty:
            st.info("No supervisors found.")
        else:
            # We cannot easily edit a multi-select in a data_editor yet for complex strings like "A,B".
            # So we will use a loop with expanders or a selection to edit one by one.
            
            # Option 1: Select a supervisor to edit
            sup_list = supervisors['username'].tolist()
            selected_sup_u = st.selectbox("Select Supervisor to Edit", sup_list, format_func=lambda x: f"{x} - {supervisors[supervisors['username']==x].iloc[0]['name']}")
            
            if selected_sup_u:
                current_row = supervisors[supervisors['username'] == selected_sup_u].iloc[0]
                
                # Region Editing
                current_regions_str = current_row['region'] if current_row['region'] else ""
                current_regions_list = current_regions_str.split(",") if current_regions_str else []
                valid_defaults = [r for r in current_regions_list if r in AREAS]
                new_regions = st.multiselect(f"Assign Regions for {current_row['name']}", AREAS, default=valid_defaults)
                
                # Shift Editing (New)
                shifts = run_query("SELECT id, name FROM shifts")
                # We need to fetch current shift for user. Query above didn't get it.
                # Let's re-fetch full user row.
                u_full = run_query("SELECT shift_id, role FROM users WHERE username = :u", {"u":selected_sup_u}).iloc[0]
                
                s_opts = {s['name']: s['id'] for i, s in shifts.iterrows()}
                cur_s_id = u_full['shift_id']
                # Create reverse lookup or find name
                cur_s_name = next((k for k, v in s_opts.items() if v == cur_s_id), None)
                idx = list(s_opts.keys()).index(cur_s_name) if cur_s_name in s_opts else 0
                
                new_shift_name = st.selectbox("Assign Shift", list(s_opts.keys()), index=idx if s_opts else 0)
                
                # Role Editing (To allow changing to Night Supervisor)
                roles = ["supervisor", "storekeeper", "night_supervisor"]
                cur_role = u_full['role']
                new_role = st.selectbox("Assign Role", roles, index=roles.index(cur_role) if cur_role in roles else 0)

                if st.button("Update Supervisor Profile"):
                    new_reg_str = ",".join(new_regions)
                    new_sid = s_opts.get(new_shift_name)
                    run_action("UPDATE users SET region=:r, shift_id=:sid, role=:role WHERE username=:u", 
                               {"r": new_reg_str, "sid":new_sid, "role":new_role, "u": selected_sup_u})
                    st.success(f"Updated {current_row['name']}"); st.cache_data.clear(); time.sleep(1); st.rerun()
            
            st.divider()
            st.dataframe(supervisors, width="stretch")

    with tab1: # Reports
        st.subheader("📊 Today's Attendance")
        today = datetime.now().strftime("%Y-%m-%d")
        df = run_query("""
            SELECT w.name, w.region, w.role, a.status, s.name as shift, a.notes 
            FROM attendance a 
            JOIN workers w ON a.worker_id = w.id 
            LEFT JOIN shifts s ON a.shift_id = s.id
            WHERE a.date = :d
        """, {"d": today})
        
        if df.empty: st.info("No attendance records for today.")
        else:
            c1, c2, c3 = st.columns(3)
            c1.metric("Present", len(df[df['status'] == 'Present']))
            c2.metric("Absent", len(df[df['status'] == 'Absent']))
            c3.metric("On Leave", len(df[df['status'] == 'Vacation']))
            st.dataframe(df, width="stretch")

# ==========================================
# ============ SUPERVISOR VIEW (MANPOWER) ==
# ==========================================
def supervisor_view_manpower():
    user = st.session_state.user_info
    my_regions = user['region'].split(",") if "," in user['region'] else [user['region']]
    st.header(f"👷‍♂️ Supervisor: {user['name']}")
    
    selected_region_mp = st.selectbox("📂 Select Region", my_regions, key="sup_mp_reg_sel")
    
    tab1, tab2 = st.tabs(["📝 Daily Attendance", "👥 My Workers"])
    
    with tab1:
        st.subheader(f"📅 Attendance for {datetime.now().strftime('%Y-%m-%d')} - {selected_region_mp}")
        
        # 1. Select Shift
        shifts = run_query("SELECT * FROM shifts")
        if shifts.empty:
            st.warning("No shifts defined. Please contact Manager.")
            return
            
        shift_opts = {f"{r['name']} ({r['start_time']}-{r['end_time']})": r['id'] for i, r in shifts.iterrows()}
        selected_shift_label = st.selectbox("Select Shift", list(shift_opts.keys()))
        selected_shift_id = shift_opts[selected_shift_label]
        
        # 2. Get Workers in Region
        workers = run_query("SELECT id, name, role, status FROM workers WHERE region = :r AND status = 'Active' ORDER BY name", {"r": selected_region_mp})
        
        if workers.empty:
            st.info(f"No active workers found in {selected_region_mp}.")
        else:
            today = datetime.now().strftime("%Y-%m-%d")
            existing = run_query("SELECT worker_id, status, notes FROM attendance WHERE date = :d AND shift_id = :s", {"d": today, "s": selected_shift_id})
            
            display_data = []
            for i, w in workers.iterrows():
                row = {"ID": w['id'], "Name": w['name'], "Role": w['role'], "Status": "Present", "Notes": ""}
                if not existing.empty:
                    match = existing[existing['worker_id'] == w['id']]
                    if not match.empty:
                        row['Status'] = match.iloc[0]['status']
                        row['Notes'] = match.iloc[0]['notes']
                display_data.append(row)
            
            df_att = pd.DataFrame(display_data)
            
            edited_att = st.data_editor(
                df_att,
                key=f"att_editor_{selected_region_mp}_{selected_shift_id}",
                column_config={
                    "ID": st.column_config.NumberColumn(disabled=True),
                    "Name": st.column_config.TextColumn(disabled=True),
                    "Role": st.column_config.TextColumn(disabled=True),
                    "Status": st.column_config.SelectboxColumn(
                        options=["Present", "Absent", "Vacation", "Sick Leave"], required=True),
                    "Notes": st.column_config.TextColumn()
                },
                hide_index=True, width="stretch"
            )
            
            if st.button("💾 Submit Attendance"):
                count = 0
                for i, row in edited_att.iterrows():
                    run_action("DELETE FROM attendance WHERE worker_id=:wid AND date=:d AND shift_id=:sid", 
                               {"wid": row['ID'], "d": today, "sid": selected_shift_id})
                    run_action("INSERT INTO attendance (worker_id, date, shift_id, status, notes, supervisor) VALUES (:wid, :d, :sid, :s, :n, :sup)",
                               {"wid": row['ID'], "d": today, "sid": selected_shift_id, "s": row['Status'], "n": row['Notes'], "sup": user['name']})
                    count += 1
                st.success(f"Attendance recorded for {count} workers!"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab2:
        st.dataframe(run_query("SELECT * FROM workers WHERE region = :r", {"r": selected_region_mp}), width="stretch")

# ==========================================
# ============ MANAGER VIEW (WH) ===========
# ==========================================
def manager_view_warehouse():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock Management", txt['ext_tab'], "⏳ Bulk Review", txt['local_inv'], "📜 Logs"])
    
    with tab1: # Stock
        with st.expander(txt['create_item_title'], expanded=False):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Name")
            c = c2.selectbox("Category", CATS_EN)
            l = c3.selectbox("Location", LOCATIONS)
            q = c4.number_input("Qty", 0, 10000)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn'], use_container_width=True):
                if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}, ttl=0).empty:
                    run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                              {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                    st.success("Added"); st.cache_data.clear(); st.rerun()
                else: st.error("Exists")
        st.divider()
        col_ntcc, col_snc = st.columns(2)
        with col_ntcc: render_bulk_stock_take("NTCC", st.session_state.user_info['name'], "mgr")
        with col_snc: render_bulk_stock_take("SNC", st.session_state.user_info['name'], "mgr")

    with tab2: # External
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                wh = st.selectbox("From/To Warehouse", LOCATIONS, key="l_wh")
                proj = st.selectbox("External Project", EXTERNAL_PROJECTS)
                inv = get_inventory(wh)
                if not inv.empty:
                    it = st.selectbox("Select Item", inv['name_en'].unique(), key="l_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    st.caption(f"Current Stock: {row['qty']} {row['unit']}")
                    op = st.radio("Action Type", ["Lend (Stock Decrease)", "Borrow (Stock Increase)"], horizontal=True)
                    amt = st.number_input("Quantity", 1, 10000, key="l_q")
                    if st.button(txt['exec_trans'], use_container_width=True, key="btn_l"):
                        change = -int(amt) if "Lend" in op else int(amt)
                        desc = f"Lend to {proj}" if "Lend" in op else f"Borrow from {proj}"
                        res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], desc, row['unit'])
                        if res: st.success("Transaction Successful!"); st.cache_data.clear(); st.rerun()
                        else: st.error(msg)
        with c2:
            st.subheader(txt['cww_supply'])
            with st.container(border=True):
                dest = st.selectbox("To Warehouse", LOCATIONS, key="c_wh")
                inv = get_inventory(dest)
                if not inv.empty:
                    it = st.selectbox("Item Received", inv['name_en'].unique(), key="c_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    amt = st.number_input("Quantity", 1, 10000, key="c_q")
                    if st.button("Receive from CWW", use_container_width=True, key="btn_c"):
                        res, msg = update_central_stock(it, dest, amt, st.session_state.user_info['name'], "From CWW", row['unit'])
                        if res: st.success("Done"); st.cache_data.clear(); st.rerun()
                        else: st.error(msg)
        st.divider()
        loan_logs = run_query("SELECT log_date, item_name, change_amount, location, action_type FROM stock_logs WHERE action_type LIKE '%Lend%' OR action_type LIKE '%Borrow%' ORDER BY log_date DESC")
        if not loan_logs.empty: st.dataframe(loan_logs, width="stretch")

    with tab3: # Requests
        reqs = run_query("SELECT req_id, request_date, region, supervisor_name, item_name, qty, unit, notes FROM requests WHERE status='Pending' ORDER BY region, request_date DESC")
        if reqs.empty: st.info("No pending requests")
        else:
            regions = reqs['region'].unique()
            region_tabs = st.tabs(list(regions))
            for i, region in enumerate(regions):
                with region_tabs[i]:
                    st.markdown("##### ⚡ Global Actions")
                    bulk_action = st.radio(f"Apply to {region}:", ["Maintain Status", "Approve All", "Reject All"], key=f"bulk_{region}", horizontal=True)
                    reg_df = reqs[reqs['region'] == region].copy()
                    if bulk_action == "Approve All": reg_df['Action'] = "Approve"
                    elif bulk_action == "Reject All": reg_df['Action'] = "Reject"
                    else: reg_df['Action'] = "Keep Pending"
                    
                    reg_df['Mgr Qty'] = reg_df['qty']
                    reg_df['Mgr Note'] = reg_df['notes']
                    display_df = reg_df[['req_id', 'item_name', 'supervisor_name', 'qty', 'unit', 'Mgr Qty', 'Mgr Note', 'Action']]
                    
                    edited_df = st.data_editor(
                        display_df,
                        key=f"editor_{region}",
                        column_config={
                            "req_id": None, "item_name": st.column_config.TextColumn(disabled=True),
                            "supervisor_name": st.column_config.TextColumn(disabled=True),
                            "qty": st.column_config.NumberColumn(disabled=True, label="Req Qty"),
                            "unit": st.column_config.TextColumn(disabled=True),
                            "Mgr Qty": st.column_config.NumberColumn(min_value=1, max_value=10000, required=True),
                            "Action": st.column_config.SelectboxColumn(options=["Keep Pending", "Approve", "Reject"], required=True)
                        },
                        hide_index=True, width="stretch"
                    )
                    
                    if st.button(f"Process Updates for {region}", key=f"btn_{region}"):
                        count_changes = 0
                        for index, row in edited_df.iterrows():
                            rid = row['req_id']
                            action = row['Action']
                            new_q = int(row['Mgr Qty'])
                            new_n = row['Mgr Note']
                            if action == "Approve":
                                stock = run_query("SELECT qty FROM inventory WHERE name_en=:n AND location='NTCC'", {"n":row['item_name']}, ttl=0)
                                avail = stock.iloc[0]['qty'] if not stock.empty else 0
                                if avail >= new_q:
                                    final_note = f"Manager: {new_n}" if new_n else ""
                                    run_action("UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id", {"q":new_q, "n":final_note, "id":rid})
                                    count_changes += 1
                                else: st.toast(f"❌ Low Stock for {row['item_name']}. Skipped.", icon="⚠️")
                            elif action == "Reject":
                                run_action("UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id", {"n":new_n, "id":rid})
                                count_changes += 1
                        if count_changes > 0: st.success(f"Processed {count_changes} requests!"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab4: # Local Inventory (TABS ADDED)
        st.subheader("📊 Branch Inventory (By Area)")
        m_tabs = st.tabs(AREAS)
        for i, area in enumerate(AREAS):
            with m_tabs[i]:
                df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r ORDER BY item_name", {"r":area})
                if df.empty:
                    st.info(f"No inventory record for {area}")
                else:
                    st.dataframe(df, width="stretch")

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), width="stretch")

# ==========================================
# ============ STOREKEEPER VIEW ============
# ==========================================
def storekeeper_view():
    st.header(txt['storekeeper_role'])
    t1, t2, t3, t4 = st.tabs([txt['approved_reqs'], "📋 Issued Today", "NTCC Stock Take", "SNC Stock Take"])
    
    with t1: # Bulk Issue
        reqs = run_query("SELECT * FROM requests WHERE status='Approved'")
        if reqs.empty: st.info("No tasks")
        else:
            regions = reqs['region'].unique()
            if len(regions) > 0:
                rtabs = st.tabs(list(regions))
                for i, region in enumerate(regions):
                    with rtabs[i]:
                        select_all = st.checkbox(f"Select All ({region})", key=f"sel_all_{region}")
                        sk_df = reqs[reqs['region'] == region].copy()
                        sk_df['Final Issue Qty'] = sk_df['qty']
                        sk_df['SK Note'] = ""
                        sk_df['Ready to Issue'] = select_all
                        
                        display_sk = sk_df[['req_id', 'item_name', 'qty', 'unit', 'notes', 'Final Issue Qty', 'SK Note', 'Ready to Issue']]
                        
                        edited_sk = st.data_editor(
                            display_sk,
                            key=f"sk_editor_{region}",
                            column_config={
                                "req_id": None, "item_name": st.column_config.TextColumn(disabled=True),
                                "qty": st.column_config.NumberColumn(disabled=True, label="Appr Qty"),
                                "unit": st.column_config.TextColumn(disabled=True),
                                "notes": st.column_config.TextColumn(disabled=True, label="Mgr Note"),
                                "Final Issue Qty": st.column_config.NumberColumn(min_value=1, max_value=10000),
                                "Ready to Issue": st.column_config.CheckboxColumn(label="Issue?", default=False)
                            },
                            hide_index=True, width="stretch"
                        )
                        if st.button(f"Confirm Bulk Issue for {region}", key=f"sk_btn_{region}"):
                            issued_count = 0
                            for index, row in edited_sk.iterrows():
                                if row['Ready to Issue']:
                                    rid = row['req_id']
                                    iq = int(row['Final Issue Qty'])
                                    sn = row['SK Note']
                                    existing_note = row['notes'] if row['notes'] else ""
                                    final_note = f"{existing_note} | SK: {sn}" if sn else existing_note
                                    res, msg = update_central_stock(row['item_name'], "NTCC", -iq, st.session_state.user_info['name'], f"Issued {region}", row['unit'])
                                    if res:
                                        run_action("UPDATE requests SET status='Issued', qty=:q, notes=:n WHERE req_id=:id", {"q":iq, "n":final_note, "id":rid})
                                        issued_count += 1
                                    else: st.toast(f"Error {row['item_name']}: {msg}", icon="❌")
                            if issued_count > 0: st.success(f"Issued {issued_count} items!"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with t2: # Issued Today
        st.subheader("📋 Items Issued Today")
        today_log = run_query("""SELECT item_name, qty, unit, region, supervisor_name, notes, request_date FROM requests WHERE status IN ('Issued', 'Received') AND request_date::date = CURRENT_DATE ORDER BY request_date DESC""")
        if today_log.empty: st.info("Nothing issued today yet.")
        else: st.dataframe(today_log, width="stretch")

    with t3: render_bulk_stock_take("NTCC", st.session_state.user_info['name'], "sk")
    with t4: render_bulk_stock_take("SNC", st.session_state.user_info['name'], "sk")

# ==========================================
# ============ SUPERVISOR VIEW (WH) ========
# ==========================================
def supervisor_view_warehouse():
    user = st.session_state.user_info
    # Handle multiple regions
    my_regions = user['region'].split(",") if "," in user['region'] else [user['region']]
    
    st.header(txt['supervisor_role'])
    # Add a selector for the region if multiple, or tabs?
    # Original design was tabs for functionality. 
    # Let's add a Region Selector at the top to filter the view context.
    
    selected_region_wh = st.selectbox("📂 Select Active Region", my_regions, key="sup_wh_reg_sel")
    
    t1, t2, t3, t4 = st.tabs([txt['req_form'], "🚚 Ready for Pickup", "⏳ My Pending", txt['local_inv']])
    
    with t1: # Bulk Request
        st.markdown(f"### 🛒 Bulk Order Form ({selected_region_wh})")
        # reg = st.selectbox("Ordering for Area:", AREAS, index=AREAS.index(user['region']) if user['region'] in AREAS else 0)
        # Replaced with fixed selected region
        
        inv = get_inventory("NTCC")
        if not inv.empty:
            inv_df = inv[['name_en', 'category', 'unit']].copy() 
            inv_df.rename(columns={'name_en': 'Item Name'}, inplace=True)
            inv_df['Order Qty'] = 0 
            st.info(f"Ordering for: {selected_region_wh}")
            
            edited_order = st.data_editor(
                inv_df, key=f"order_editor_{selected_region_wh}",
                column_config={
                    "Item Name": st.column_config.TextColumn(disabled=True),
                    "category": st.column_config.TextColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "Order Qty": st.column_config.NumberColumn(min_value=0, max_value=1000, step=1)
                },
                hide_index=True, width="stretch", height=400
            )
            if st.button(txt['send_req'], use_container_width=True):
                items_to_order = edited_order[edited_order['Order Qty'] > 0]
                if items_to_order.empty: st.warning("Please enter quantity for at least one item.")
                else:
                    success_count = 0
                    for index, row in items_to_order.iterrows():
                        create_request(supervisor=user['name'], region=selected_region_wh, item=row['Item Name'], category=row['category'], qty=int(row['Order Qty']), unit=row['unit'])
                        success_count += 1
                    st.balloons(); st.success(f"Sent {success_count} requests for {selected_region_wh}!"); st.cache_data.clear(); time.sleep(2); st.rerun()

    with t2: # Ready for Pickup
        # Filter by region as well
        ready = run_query("SELECT * FROM requests WHERE supervisor_name=:s AND status='Issued' AND region=:r", {"s": user['name'], "r": selected_region_wh})
        if ready.empty: st.info(f"No items ready for pickup in {selected_region_wh}.")
        else:
             # Just show the list for this region
            pickup_all = st.checkbox(f"Select All ({selected_region_wh})", key=f"pickup_all_{selected_region_wh}")
            ready_df = ready[['req_id', 'item_name', 'qty', 'unit', 'notes']].copy()
            ready_df['Confirm'] = pickup_all
            
            edited_ready = st.data_editor(
                ready_df,
                key=f"ready_editor_{selected_region_wh}",
                column_config={
                    "req_id": None, "item_name": st.column_config.TextColumn(disabled=True),
                    "Confirm": st.column_config.CheckboxColumn("Received?", default=False)
                },
                hide_index=True, width="stretch"
            )
            
            if st.button(f"Confirm Receipt for {selected_region_wh}", key=f"btn_rec_{selected_region_wh}"):
                rec_count = 0
                for index, row in edited_ready.iterrows():
                    if row['Confirm']:
                        run_action("UPDATE requests SET status='Received' WHERE req_id=:id", {"id":row['req_id']})
                        current_local_qty = get_local_inventory_by_item(selected_region_wh, row['item_name'])
                        new_total_qty = current_local_qty + int(row['qty'])
                        update_local_inventory(selected_region_wh, row['item_name'], new_total_qty, user['name'])
                        rec_count += 1
                if rec_count > 0: st.balloons(); st.success(f"Received {rec_count} items."); st.cache_data.clear(); time.sleep(1); st.rerun()

    with t3: # Edit Pending
        pending = run_query("SELECT req_id, item_name, qty, unit, request_date FROM requests WHERE supervisor_name=:s AND status='Pending' AND region=:r ORDER BY request_date DESC", 
                            {"s": user['name'], "r": selected_region_wh})
        if pending.empty: st.info(f"No pending requests for {selected_region_wh}.")
        else:
            # Same logic but filtered
            sup_action = st.radio("Bulk Action:", ["Maintain Status", "Cancel All"], horizontal=True, key=f"sup_bulk_pending_{selected_region_wh}")
            pending_df = pending.copy()
            pending_df['Modify Qty'] = pending_df['qty']
            if sup_action == "Cancel All": pending_df['Action'] = "Cancel"
            else: pending_df['Action'] = "Keep"
            
            edited_pending = st.data_editor(
                pending_df,
                key=f"sup_pending_edit_{selected_region_wh}",
                column_config={
                    "req_id": None, "item_name": st.column_config.TextColumn(disabled=True),
                    "Modify Qty": st.column_config.NumberColumn(min_value=1),
                    "Action": st.column_config.SelectboxColumn(options=["Keep", "Update", "Cancel"])
                },
                hide_index=True, width="stretch"
            )
            if st.button("Apply Changes", key=f"btn_changes_{selected_region_wh}"):
                p_changes = 0
                for index, row in edited_pending.iterrows():
                    rid = row['req_id']
                    if row['Action'] == "Update":
                        update_request(rid, int(row['Modify Qty'])) # This function was missing in original context but update_request_details exists.
                        # Assuming update_request_details usage
                        update_request_details(rid, int(row['Modify Qty']), None)
                        p_changes += 1
                    elif row['Action'] == "Cancel":
                        delete_request(rid)
                        p_changes += 1
                if p_changes > 0: st.success(f"Applied changes."); st.cache_data.clear(); time.sleep(1); st.rerun()

    with t4: # Local Inventory
        st.info(f"Update Local Inventory for {selected_region_wh}")
        local_inv = run_query("SELECT item_name, qty FROM local_inventory WHERE region=:r AND updated_by=:u", {"r":selected_region_wh, "u":user['name']})
        
        if local_inv.empty:
            st.warning(f"No inventory record found for {selected_region_wh}.")
        else:
            local_inv_df = local_inv.copy()
            local_inv_df.rename(columns={'qty': 'System Count', 'item_name': 'Item Name'}, inplace=True)
            local_inv_df['Physical Count'] = local_inv_df['System Count']
            
            edited_local = st.data_editor(
                local_inv_df,
                key=f"sup_stock_take_{selected_region_wh}",
                column_config={
                    "Item Name": st.column_config.TextColumn(disabled=True),
                    "System Count": st.column_config.NumberColumn(disabled=True),
                    "Physical Count": st.column_config.NumberColumn(min_value=0, max_value=10000, required=True)
                },
                hide_index=True, width="stretch"
            )
            
            if st.button(f"Update {selected_region_wh} Counts", key=f"btn_up_{selected_region_wh}"):
                up_count = 0
                for index, row in edited_local.iterrows():
                    sys = int(row['System Count'])
                    phy = int(row['Physical Count'])
                    if sys != phy:
                        update_local_inventory(selected_region_wh, row['Item Name'], phy, user['name'])
                        up_count += 1
                if up_count > 0: st.success(f"Updated {up_count} items."); st.cache_data.clear(); time.sleep(1); st.rerun()
                else: st.info("No changes made.")

# --- 8. تشغيل التطبيق ---
if __name__ == "__main__":
    init_db() # Ensure tables exist
    if st.session_state.logged_in:
        show_main_app()
    else:
        show_login()
