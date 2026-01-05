import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import time
import uuid
from sqlalchemy import text
import extra_streamlit_components as stx

# --- 1. Page Configuration ---
st.set_page_config(page_title="WMS Pro (SQL)", layout="wide", initial_sidebar_state="expanded")

# --- Session Management ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

if 'logout_pressed' not in st.session_state:
    st.session_state.logout_pressed = False

# --- Cookie Manager ---
def get_manager():
    return stx.CookieManager()

cookie_manager = get_manager()

# --- Constants ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
LOCATIONS = ["NTCC", "SNC"]
AREAS = [
    "Ground floor", "1st floor", 
    "2nd floor O.R", "2nd floor ICU 28", "2nd floor RT and Waiting area", "2nd floor ICU 29",
    "Ward 30", "Ward 31", "Ward 40", "Ward 41", "Ward 50", "Ward 51",
    "Service area", "OPD", "E.R", "x-rays", "neurodiagnostic"
]

# --- Dictionary (Fixed KeyError) ---
txt = {
    "app_title": "Unified WMS System (SQL)",
    "login_page": "Login", "register_page": "Register",
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
    "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
    "name_en": "Name", "category": "Category",
    "qty": "Qty", "location": "Location",
    "requests_log": "Log", "inventory": "Inventory",
    "req_form": "Request Items", "select_item": "Select Item",
    "local_inv": "My Stock",  # <--- تمت الإضافة هنا لحل المشكلة
    "current_local": "You have:", "update_local": "Update",
    "qty_req": "Request Qty", "qty_local": "Actual Qty",
    "send_req": "Send Request", "update_btn": "Save",
    "pending_reqs": "⏳ Supervisor Requests", "approved_reqs": "📦 Requests to Issue",
    "approve": "Approve ✅", "reject": "Reject ❌", "issue": "Confirm Issue 📦",
    "status": "Status", "pending": "Pending", "approved": "Approved", 
    "rejected": "Rejected", "issued": "Issued",
    "err_qty": "Low Stock!",
    "success_update": "Updated successfully",
    "success_req": "Request Sent",
    "success_issue": "Issued successfully",
    "issue_qty_input": "Actual Issued Qty",
    "manage_stock": "📦 Central Stock Monitor",
    "select_action": "Action",
    "add_stock": "Add (+)", "reduce_stock": "Remove (-)",
    "amount": "Amount",
    "current_stock_display": "Current:",
    "execute_update": "Update Stock",
    "error_login": "Invalid Username or Password", "success_reg": "Registered successfully",
    "stock_take_central": "📝 Internal Warehouse Management",
    "sk_request": "📥 Store Keeper Request",
    "source_wh": "Select Warehouse",
    "ntcc_label": "Internal (NTCC)", "snc_label": "External (SNC)",
    "logs": "Activity Logs",
    "copyright": "All rights reserved © Abdulaziz Alhazmi.",
    "select_area": "📍 Target Area / Section",
    "area_label": "Area",
    "edit_profile": "Edit Profile", "new_name": "New Name", "new_pass": "New Password", 
    "save_changes": "Save Changes", "profile_updated": "Profile updated, please login again",
    "my_pending": "My Pending Requests (Edit/Cancel)",
    "update_req": "Update",
    "cancel_req": "Delete 🗑️",
    "cancel_confirm": "Deleted successfully",
    "receive_from_snc": "📥 Receive from External (SNC) to Internal (NTCC)",
    "transfer_btn": "Transfer Stock",
    "manual_stock_take": "🛠️ Manual Stock Take (NTCC Only)",
    "err_no_stock_approve": "❌ Cannot Approve: Insufficient Stock in NTCC!"
}

# --- Database Connection ---
conn = st.connection("supabase", type="sql")

# --- CSS ---
st.markdown(f"""
    <style>
    .stButton button {{ width: 100%; }}
    .copyright-footer {{
        position: fixed; left: 10px; bottom: 5px;
        background-color: rgba(255, 255, 255, 0.9);
        padding: 5px 10px; border-radius: 5px; font-size: 10px;
        color: #333; z-index: 99999; pointer-events: none; border: 1px solid #ddd;
    }}
    </style>
    <div class="copyright-footer">{txt['copyright']}</div>
""", unsafe_allow_html=True)

# --- Database Functions (SQL) ---

def run_query(query, params=None):
    """Executes a read query and returns a DataFrame."""
    try:
        return conn.query(query, params=params, ttl=0)
    except Exception as e:
        st.error(f"DB Error: {e}")
        return pd.DataFrame()

def run_action(query, params=None):
    """Executes a write/update/delete query."""
    try:
        with conn.session as session:
            session.execute(text(query), params)
            session.commit()
        return True
    except Exception as e:
        st.error(f"DB Action Error: {e}")
        return False

# --- User Functions ---
def login_user(username, password):
    df = run_query("SELECT * FROM users WHERE username = :u AND password = :p", params={"u": username, "p": password})
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(username, password, name, region):
    return run_action(
        "INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
        params={"u": username, "p": password, "n": name, "r": region}
    )

def update_user_profile(username, new_name, new_pass):
    return run_action(
        "UPDATE users SET name = :n, password = :p WHERE username = :u",
        params={"n": new_name, "p": new_pass, "u": username}
    )

# --- Inventory Functions ---
def get_inventory(location=None):
    if location:
        return run_query("SELECT * FROM inventory WHERE location = :loc", params={"loc": location})
    return run_query("SELECT * FROM inventory")

def update_central_stock(item_name, location, change, user, action_desc, unit):
    # 1. Check current stock
    df = run_query(
        "SELECT qty FROM inventory WHERE name_en = :name AND location = :loc",
        params={"name": item_name, "loc": location}
    )
    
    if df.empty:
        return False, f"Item not found: {item_name} in {location}"
    
    current_qty = int(df.iloc[0]['qty'])
    
    # 2. Validation
    if change < 0 and abs(change) > current_qty:
        return False, f"Insufficient stock. Available: {current_qty}"
    
    new_qty = current_qty + change
    
    # 3. Transaction: Update Stock & Insert Log
    try:
        with conn.session as s:
            s.execute(
                text("UPDATE inventory SET qty = :nq WHERE name_en = :name AND location = :loc"),
                {"nq": new_qty, "name": item_name, "loc": location}
            )
            s.execute(
                text("INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, :act, :item, :loc, :chg, :nq)"),
                {"u": user, "act": f"{action_desc} ({unit})", "item": item_name, "loc": location, "chg": change, "nq": new_qty}
            )
            s.commit()
        return True, "Success"
    except Exception as e:
        return False, str(e)

def transfer_stock(item_name, qty, user, unit):
    # SNC -> NTCC
    # Step 1: Remove from SNC
    ok, msg = update_central_stock(item_name, "SNC", -qty, user, "Transfer Out", unit)
    if not ok: return False, msg
    
    # Step 2: Add to NTCC
    # Check if item exists in NTCC first
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name})
    if df.empty:
        # Auto-create item in NTCC if not exists (Optional but good for robustness)
        run_action(
            "INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')",
            params={"n": item_name, "u": unit}
        )
        
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, f"SNC deducted but NTCC failed: {msg2}"
    
    return True, "Transfer Complete"

def update_local_inventory(region, item_name, new_qty):
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    if not df.empty:
        return run_action("UPDATE local_inventory SET qty = :q, last_updated = NOW() WHERE region = :r AND item_name = :i", params={"q": new_qty, "r": region, "i": item_name})
    else:
        return run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated) VALUES (:r, :i, :q, NOW())", params={"r": region, "i": item_name, "q": new_qty})

def get_local_inventory(region, item_name):
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- Request Functions ---
def create_request(supervisor, region, item, category, qty, unit):
    return run_action(
        "INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
        params={"s": supervisor, "r": region, "i": item, "c": category, "q": qty, "u": unit}
    )

def get_requests(status_filter=None, supervisor_filter=None):
    q = "SELECT * FROM requests"
    conditions = []
    params = {}
    
    if status_filter:
        conditions.append("status = :s")
        params["s"] = status_filter
    if supervisor_filter:
        conditions.append("supervisor_name = :sup")
        params["sup"] = supervisor_filter
        
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    
    q += " ORDER BY request_date DESC"
    return run_query(q, params)

def update_request(req_id, new_qty):
    return run_action("UPDATE requests SET qty = :q WHERE req_id = :id", params={"q": new_qty, "id": req_id})

def update_request_status(req_id, status, final_qty=None):
    if final_qty:
        return run_action("UPDATE requests SET status = :s, qty = :q WHERE req_id = :id", params={"s": status, "q": final_qty, "id": req_id})
    return run_action("UPDATE requests SET status = :s WHERE req_id = :id", params={"s": status, "id": req_id})

def delete_request(req_id):
    return run_action("DELETE FROM requests WHERE req_id = :id", params={"id": req_id})

# --- Auto Login ---
if not st.session_state.logged_in and not st.session_state.get('logout_pressed', False):
    time.sleep(0.1)
    cookie_user = cookie_manager.get(cookie="wms_user_pro_sql")
    if cookie_user:
        u_data = login_user(cookie_user, "")
        if u_data:
            st.session_state.logged_in = True
            st.session_state.user_info = u_data
            st.rerun()

# === LOGIN PAGE ===
if not st.session_state.logged_in:
    st.title(f"🔐 {txt['app_title']}")
    t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
    with t1:
        with st.form("log"):
            u = st.text_input(txt['username']).strip()
            p = st.text_input(txt['password'], type="password").strip()
            if st.form_submit_button(txt['login_btn'], use_container_width=True):
                user_data = login_user(u, p)
                if user_data:
                    st.session_state.logged_in = True
                    st.session_state.user_info = user_data
                    st.session_state.logout_pressed = False 
                    cookie_manager.set("wms_user_pro_sql", u, expires_at=datetime.now() + timedelta(days=7))
                    time.sleep(0.5)
                    st.rerun()
                else: st.error(txt['error_login'])
    with t2:
        with st.form("reg"):
            nu = st.text_input(txt['username'], key='r_u').strip()
            np = st.text_input(txt['password'], type='password', key='r_p').strip()
            nn = st.text_input(txt['fullname'])
            nr = st.text_input(txt['region'])
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                if register_user(nu, np, nn, nr):
                    st.success(txt['success_reg'])
                else: st.error("Error: Username might exist")

# === MAIN APP ===
else:
    info = st.session_state.user_info
    
    st.sidebar.markdown(f"### 👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    with st.sidebar.expander(f"🛠 {txt['edit_profile']}"):
        new_name_input = st.text_input(txt['new_name'], value=info['name'])
        new_pass_input = st.text_input(txt['new_pass'], type="password", value=info['password'])
        if st.button(txt['save_changes'], use_container_width=True):
            if update_user_profile(info['username'], new_name_input, new_pass_input):
                st.success(txt['profile_updated'])
                cookie_manager.delete("wms_user_pro_sql")
                st.session_state.logged_in = False
                st.session_state.logout_pressed = True
                time.sleep(1)
                st.rerun()
            else: st.error("Error")

    if st.sidebar.button(txt['logout'], use_container_width=True):
        cookie_manager.delete("wms_user_pro_sql")
        st.session_state.logged_in = False
        st.session_state.user_info = {}
        st.session_state.logout_pressed = True
        time.sleep(0.5) 
        st.rerun()

    # --- 1. MANAGER ---
    if info['role'] == 'manager':
        st.header(txt['manager_role'])
        
        tab_inv, tab_reqs, tab_logs = st.tabs(["📦 Central Stock", "⏳ Pending Requests", "📜 Logs"])
        
        with tab_inv:
            st.subheader(txt['manage_stock'])
            col_ntcc, col_snc = st.columns(2)
            
            with col_ntcc:
                st.markdown("### 🏢 NTCC")
                df_ntcc = get_inventory("NTCC")
                st.dataframe(df_ntcc[['name_en', 'qty', 'unit', 'category']], use_container_width=True)
                
                with st.expander("🛠 Update NTCC"):
                    if not df_ntcc.empty:
                        item_ntcc = st.selectbox("Item", df_ntcc['name_en'].unique(), key="sel_ntcc")
                        row_n = df_ntcc[df_ntcc['name_en'] == item_ntcc].iloc[0]
                        st.caption(f"Current: {row_n['qty']} {row_n['unit']}")
                        
                        c1, c2 = st.columns(2)
                        act_n = c1.radio("Action", ["Add", "Remove"], key="act_n")
                        amt_n = c2.number_input("Qty", 1, 1000, 1, key="amt_n")
                        
                        if st.button("Update NTCC"):
                            change = amt_n if act_n == "Add" else -amt_n
                            ok, msg = update_central_stock(item_ntcc, "NTCC", change, info['name'], "Manager Update", row_n['unit'])
                            if ok: st.success(msg); time.sleep(1); st.rerun()
                            else: st.error(msg)

            with col_snc:
                st.markdown("### 🏭 SNC")
                df_snc = get_inventory("SNC")
                st.dataframe(df_snc[['name_en', 'qty', 'unit', 'category']], use_container_width=True)
                
                with st.expander("🛠 Update SNC"):
                    if not df_snc.empty:
                        item_snc = st.selectbox("Item", df_snc['name_en'].unique(), key="sel_snc")
                        row_s = df_snc[df_snc['name_en'] == item_snc].iloc[0]
                        st.caption(f"Current: {row_s['qty']} {row_s['unit']}")
                        
                        c3, c4 = st.columns(2)
                        act_s = c3.radio("Action", ["Add", "Remove"], key="act_s")
                        amt_s = c4.number_input("Qty", 1, 1000, 1, key="amt_s")
                        
                        if st.button("Update SNC"):
                            change = amt_s if act_s == "Add" else -amt_s
                            ok, msg = update_central_stock(item_snc, "SNC", change, info['name'], "Manager Update", row_s['unit'])
                            if ok: st.success(msg); time.sleep(1); st.rerun()
                            else: st.error(msg)

        with tab_reqs:
            reqs = get_requests(status_filter="Pending")
            if reqs.empty:
                st.success("✅ No pending requests")
            else:
                for idx, row in reqs.iterrows():
                    with st.container(border=True):
                        st.markdown(f"**📦 {row['item_name']}**")
                        st.caption(f"Requested: **{row['qty']} {row['unit']}** | By: {row['supervisor_name']} ({row['region']})")
                        
                        # Stock Check
                        inv_check = run_query("SELECT qty FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": row['item_name']})
                        avail = inv_check.iloc[0]['qty'] if not inv_check.empty else 0
                        st.info(f"Available in NTCC: **{avail}**")
                        
                        b1, b2 = st.columns(2)
                        if b1.button(txt['approve'], key=f"ap_{row['req_id']}"):
                            if avail >= row['qty']:
                                update_request_status(row['req_id'], "Approved")
                                st.success("Approved"); time.sleep(1); st.rerun()
                            else:
                                st.error(f"Insufficient Stock! Need {row['qty']}, have {avail}")
                        
                        if b2.button(txt['reject'], key=f"rj_{row['req_id']}"):
                            update_request_status(row['req_id'], "Rejected")
                            st.rerun()

        with tab_logs:
            logs = run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 100")
            st.dataframe(logs, use_container_width=True)

    # --- 2. STORE KEEPER ---
    elif info['role'] == 'storekeeper':
        st.header(txt['storekeeper_role'])
        
        tab_issue, tab_stock = st.tabs([txt['approved_reqs'], txt['stock_take_central']])
        
        with tab_issue:
            reqs = get_requests(status_filter="Approved")
            if reqs.empty:
                st.info("✅ No approved requests")
            else:
                for idx, row in reqs.iterrows():
                    with st.container(border=True):
                        st.markdown(f"**📦 {row['item_name']}**")
                        st.caption(f"Region: {row['region']} | Requested: {row['qty']} {row['unit']}")
                        
                        final_qty = st.number_input("Actual Issue Qty", 1, 1000, int(row['qty']), key=f"iq_{row['req_id']}")
                        
                        if st.button(txt['issue'], key=f"btn_iss_{row['req_id']}"):
                            # 1. Decrease Central Stock
                            ok, msg = update_central_stock(row['item_name'], "NTCC", -final_qty, info['name'], f"Issued to {row['region']}", row['unit'])
                            if ok:
                                # 2. Update Request
                                update_request_status(row['req_id'], "Issued", final_qty)
                                
                                # 3. Increase Local Stock
                                cur_local = get_local_inventory(row['region'], row['item_name'])
                                update_local_inventory(row['region'], row['item_name'], cur_local + final_qty)
                                
                                st.success("Issued Successfully"); time.sleep(1); st.rerun()
                            else:
                                st.error(msg)

        with tab_stock:
            st.info("Manage NTCC Inventory")
            
            # Transfer
            with st.expander(txt['receive_from_snc'], expanded=True):
                snc_inv = get_inventory("SNC")
                if not snc_inv.empty:
                    c1, c2 = st.columns([2, 1])
                    item_tr = c1.selectbox("Select Item", snc_inv['name_en'].unique(), key="tr_it")
                    row_tr = snc_inv[snc_inv['name_en'] == item_tr].iloc[0]
                    c1.caption(f"SNC Stock: {row_tr['qty']} {row_tr['unit']}")
                    
                    qty_tr = c2.number_input("Transfer Qty", 1, 1000, 1, key="tr_qn")
                    if st.button(txt['transfer_btn']):
                        if row_tr['qty'] >= qty_tr:
                            ok, msg = transfer_stock(item_tr, qty_tr, info['name'], row_tr['unit'])
                            if ok: st.success("Transferred"); time.sleep(1); st.rerun()
                            else: st.error(msg)
                        else: st.error("Low Stock in SNC")
            
            st.divider()
            
            # Manual Stock Take
            with st.expander(txt['manual_stock_take']):
                ntcc_inv = get_inventory("NTCC")
                if not ntcc_inv.empty:
                    item_tk = st.selectbox("Select Item", ntcc_inv['name_en'].unique(), key="tk_it")
                    row_tk = ntcc_inv[ntcc_inv['name_en'] == item_tk].iloc[0]
                    st.info(f"Current: {row_tk['qty']} {row_tk['unit']}")
                    
                    c1, c2 = st.columns(2)
                    act_tk = c1.radio("Action", ["Add", "Remove"], key="act_tk")
                    amt_tk = c2.number_input("Qty", 1, 1000, 1, key="amt_tk")
                    
                    if st.button("Update Stock", key="btn_tk"):
                        change = amt_tk if act_tk == "Add" else -amt_tk
                        ok, msg = update_central_stock(item_tk, "NTCC", change, info['name'], "Stock Take", row_tk['unit'])
                        if ok: st.success("Updated"); time.sleep(1); st.rerun()
                        else: st.error(msg)

    # --- 3. SUPERVISOR ---
    else:
        tab_req, tab_my_inv = st.tabs([txt['req_form'], txt['local_inv']])
        ntcc_inv = get_inventory("NTCC")
        
        with tab_req:
            req_area = st.selectbox(txt['select_area'], AREAS)
            
            if not ntcc_inv.empty:
                with st.container(border=True):
                    item_req = st.selectbox(txt['select_item'], ntcc_inv['name_en'].unique())
                    row_item = ntcc_inv[ntcc_inv['name_en'] == item_req].iloc[0]
                    st.caption(f"Unit: {row_item['unit']}")
                    
                    qty_req = st.number_input(txt['qty_req'], 1, 1000, 1)
                    
                    if st.button(txt['send_req'], use_container_width=True):
                        create_request(info['name'], req_area, item_req, row_item['category'], qty_req, row_item['unit'])
                        st.success("✅ Request Sent"); time.sleep(1); st.rerun()
            
            st.divider()
            
            # My Pending Requests
            my_reqs = get_requests(supervisor_filter=info['name'])
            if not my_reqs.empty:
                pending = my_reqs[my_reqs['status'] == 'Pending']
                if not pending.empty:
                    st.subheader(txt['my_pending'])
                    for idx, row in pending.iterrows():
                        with st.expander(f"⚙️ {row['item_name']} ({row['qty']})"):
                            new_q = st.number_input("New Qty", 1, 1000, int(row['qty']), key=f"ed_{row['req_id']}")
                            c1, c2 = st.columns(2)
                            if c1.button("Update", key=f"up_{row['req_id']}"):
                                update_request(row['req_id'], new_q)
                                st.success("Updated"); time.sleep(1); st.rerun()
                            if c2.button("Delete", key=f"del_{row['req_id']}"):
                                delete_request(row['req_id'])
                                st.success("Deleted"); time.sleep(1); st.rerun()
                
                st.divider()
                st.caption("All Requests History")
                st.dataframe(my_reqs[['item_name', 'qty', 'status', 'region', 'request_date']], use_container_width=True)

        with tab_my_inv:
            view_area = st.selectbox("View Area Stock", AREAS, key="v_area")
            # Get local inventory for this area
            df_local = run_query("SELECT * FROM local_inventory WHERE region = :r", params={"r": view_area})
            
            # Merge with NTCC list to show items even if qty is 0
            if not ntcc_inv.empty:
                items_list = []
                for item in ntcc_inv['name_en'].unique():
                    qty = 0
                    if not df_local.empty:
                        match = df_local[df_local['item_name'] == item]
                        if not match.empty:
                            qty = int(match.iloc[0]['qty'])
                    items_list.append({"Item": item, "Qty": qty})
                
                df_view = pd.DataFrame(items_list)
                
                item_up = st.selectbox("Update Item Stock", df_view['Item'].unique())
                cur_q = df_view[df_view['Item'] == item_up].iloc[0]['Qty']
                
                with st.container(border=True):
                    st.info(f"Current Stock: {cur_q}")
                    new_val = st.number_input("New Actual Qty", 0, 10000, cur_q)
                    if st.button("Update Local Stock"):
                        update_local_inventory(view_area, item_up, new_val)
                        st.success("Updated"); time.sleep(1); st.rerun()
