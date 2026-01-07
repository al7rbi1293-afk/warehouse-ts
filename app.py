import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. إدارة الجلسة (Stable No-Cookie) ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# --- 3. الثوابت والقواميس ---
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
    "app_title": "Unified WMS System",
    "login_page": "Login", "register_page": "Register",
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
    "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
    "create_item_title": "➕ Create New Item", "create_btn": "Create Item",
    "ext_tab": "🔄 External & CWW", "project_loans": "🤝 Project Loans",
    "cww_supply": "🏭 Central Warehouse Supply (CWW)", "exec_trans": "Execute Transfer",
    "refresh_data": "🔄 Refresh Data", "notes": "Notes / Remarks",
    "save_mod": "💾 Save Changes (Keep Pending)", "insufficient_stock_sk": "❌ STOP: Issue Qty > NTCC Stock!",
    "error_login": "Invalid Username or Password", "success_reg": "Registered successfully",
    "local_inv": "Branch Inventory Reports", "req_form": "Request Items", 
    "select_item": "Select Item", "qty_req": "Request Qty", "send_req": "Send Request",
    "approved_reqs": "📦 Requests to Issue", "issue": "Confirm Issue 📦",
    "transfer_btn": "Transfer Stock", "edit_profile": "Edit Profile", 
    "new_name": "New Name", "new_pass": "New Password", "save_changes": "Save Changes",
    "update_btn": "Save"
}

# --- 4. الاتصال بقاعدة البيانات ---
try:
    conn = st.connection("supabase", type="sql")
except:
    st.error("Connection Error: Please check secrets.")
    st.stop()

# --- 5. دوال قاعدة البيانات ---
def run_query(query, params=None):
    try:
        return conn.query(query, params=params, ttl=0)
    except Exception as e:
        st.error(f"DB Error: {e}")
        return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params)
            session.commit()
        return True
    except Exception as e:
        st.error(f"DB Action Error: {e}")
        return False

# --- 6. دوال المنطق ---
def login_user(username, password):
    df = run_query("SELECT * FROM users WHERE username = :u AND password = :p", params={"u": username, "p": password})
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(username, password, name, region):
    return run_action(
        "INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
        params={"u": username, "p": password, "n": name, "r": region}
    )

def update_user_profile_full(old_username, new_username, new_name, new_pass):
    if new_username != old_username:
        check = run_query("SELECT username FROM users WHERE username = :u", params={"u": new_username})
        if not check.empty: return False, "Username already taken!"
    return run_action("UPDATE users SET username = :nu, name = :nn, password = :np WHERE username = :ou",
                      {"nu": new_username, "nn": new_name, "np": new_pass, "ou": old_username}), "Profile Updated"

def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

def create_new_item(name, category, unit, location, qty):
    df = run_query("SELECT id FROM inventory WHERE name_en = :n AND location = :l", params={"n": name, "l": location})
    if not df.empty: return False, "Item exists"
    return run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                      params={"n": name, "c": category, "u": unit, "l": location, "q": qty}), "Created"

def update_central_stock(item_name, location, change, user, action_desc, unit):
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location})
    if df.empty: return False, "Item not found"
    current_qty = int(df.iloc[0]['qty'])
    if change < 0 and abs(change) > current_qty: return False, "Insufficient stock"
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
    ok, msg = update_central_stock(item_name, "SNC", -qty, user, "Transfer Out", unit)
    if not ok: return False, msg
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name})
    if df.empty: run_action("INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')", params={"n": item_name, "u": unit})
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, msg2
    return True, "Transfer Complete"

def handle_external_transfer(item_name, my_loc, ext_proj, action, qty, user, unit):
    desc = f"Loan OUT to {ext_proj}" if action == "Lend" else f"Loan IN from {ext_proj}"
    change = -qty if action == "Lend" else qty
    return update_central_stock(item_name, my_loc, change, user, desc, unit)

def receive_from_cww(item_name, dest_loc, qty, user, unit):
    return update_central_stock(item_name, dest_loc, qty, user, "Received from CWW", unit)

def update_local_inventory(region, item_name, new_qty, user):
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    if not df.empty:
        return run_action("UPDATE local_inventory SET qty = :q, last_updated = NOW(), updated_by = :u WHERE region = :r AND item_name = :i", 
                          params={"q": new_qty, "u": user, "r": region, "i": item_name})
    else:
        return run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)", 
                          params={"r": region, "i": item_name, "q": new_qty, "u": user})

def update_request_details(req_id, new_qty, notes):
    return run_action("UPDATE requests SET qty = :q, notes = :n WHERE req_id = :id", params={"q": new_qty, "n": notes, "id": req_id})

def update_request_status(req_id, status, final_qty=None, notes=None):
    query = "UPDATE requests SET status = :s"
    params = {"s": status, "id": req_id}
    if final_qty is not None: query += ", qty = :q"; params["q"] = final_qty
    if notes is not None: query += ", notes = :n"; params["n"] = notes
    query += " WHERE req_id = :id"
    return run_action(query, params)

# --- 7. الواجهات (Views) ---

def show_login():
    st.title(f"🔐 {txt['app_title']}")
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
                else:
                    st.error(txt['error_login'])

    with t2:
        with st.form("register_form"):
            nu = st.text_input(txt['username'])
            np = st.text_input(txt['password'], type='password')
            nn = st.text_input(txt['fullname'])
            nr = st.selectbox(txt['region'], AREAS)
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                if register_user(nu.strip(), np.strip(), nn, nr):
                    st.success(txt['success_reg'])
                else:
                    st.error("Error: Username might exist")

def show_main_app():
    info = st.session_state.user_info
    
    # Sidebar
    st.sidebar.markdown(f"### 👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    if st.sidebar.button(txt['refresh_data'], use_container_width=True):
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
                st.rerun()
            else:
                st.error(msg)

    if st.sidebar.button(txt['logout'], use_container_width=True):
        st.session_state.logged_in = False
        st.session_state.user_info = {}
        st.rerun()

    # --- Routing based on Role ---
    if info['role'] == 'manager':
        manager_view()
    elif info['role'] == 'storekeeper':
        storekeeper_view()
    else:
        supervisor_view()

# --- MANAGER VIEW (Restored Features) ---
def manager_view():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock", txt['ext_tab'], "⏳ Requests", txt['local_inv'], "📜 Logs"])
    
    with tab1: # Central Stock
        with st.expander(txt['create_item_title'], expanded=False):
            c_n, c_c, c_u, c_l, c_q = st.columns(5)
            new_i_name = c_n.text_input("Name")
            new_i_cat = c_c.selectbox("Category", CATS_EN)
            new_i_unit = c_u.selectbox("Unit", ["Piece", "Carton", "Set"])
            new_i_loc = c_l.selectbox("Location", ["NTCC", "SNC"])
            new_i_qty = c_q.number_input("Initial Qty", 0, 10000, 0)
            if st.button(txt['create_btn'], use_container_width=True):
                if new_i_name:
                    ok_cr, msg_cr = create_new_item(new_i_name, new_i_cat, new_i_unit, new_i_loc, new_i_qty)
                    if ok_cr: st.success(msg_cr); st.rerun()
                    else: st.error(msg_cr)
                else: st.warning("Enter Name")
        
        st.divider()
        col_ntcc, col_snc = st.columns(2)
        with col_ntcc:
            st.markdown("### 🏢 NTCC")
            st.dataframe(get_inventory("NTCC"), use_container_width=True)
        with col_snc:
            st.markdown("### 🏭 SNC")
            st.dataframe(get_inventory("SNC"), use_container_width=True)
            
    with tab2: # External & Loans (Restored)
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                sel_wh = st.selectbox("Internal Warehouse", ["NTCC", "SNC"], key="loan_wh")
                sel_proj = st.selectbox("External Project", EXTERNAL_PROJECTS, key="loan_proj")
                wh_inv = get_inventory(sel_wh)
                if not wh_inv.empty:
                    sel_item_loan = st.selectbox("Item", wh_inv['name_en'].unique(), key="loan_it")
                    row_loan = wh_inv[wh_inv['name_en'] == sel_item_loan].iloc[0]
                    st.caption(f"Avail: {row_loan['qty']} {row_loan['unit']}")
                    sel_action_loan = st.radio("Operation", ["Lend", "Borrow"], key="loan_op", horizontal=True)
                    qty_loan = st.number_input("Quantity", 1, 10000, 1, key="loan_q")
                    if st.button(txt['exec_trans'], use_container_width=True):
                        ok_l, msg_l = handle_external_transfer(sel_item_loan, sel_wh, sel_proj, sel_action_loan, qty_loan, st.session_state.user_info['name'], row_loan['unit'])
                        if ok_l: st.success("Success"); st.rerun()
                        else: st.error(msg_l)
        
        with c2:
            st.subheader(txt['cww_supply'])
            with st.container(border=True):
                dest_wh_cww = st.selectbox("Destination Warehouse", ["NTCC", "SNC"], key="cww_wh")
                dest_inv = get_inventory(dest_wh_cww)
                if not dest_inv.empty:
                    item_cww = st.selectbox("Item Received", dest_inv['name_en'].unique(), key="cww_it")
                    row_cww = dest_inv[dest_inv['name_en'] == item_cww].iloc[0]
                    qty_cww = st.number_input("Qty Received", 1, 10000, 1, key="cww_q")
                    if st.button("📥 Receive from CWW", use_container_width=True):
                        ok_c, msg_c = receive_from_cww(item_cww, dest_wh_cww, qty_cww, st.session_state.user_info['name'], row_cww['unit'])
                        if ok_c: st.success("Received"); st.rerun()
                        else: st.error(msg_c)
        
        st.divider()
        st.markdown("### 📊 Project Loan History")
        loan_logs = run_query("SELECT log_date, item_name, change_amount, location, action_type FROM stock_logs WHERE action_type LIKE '%Loan%' ORDER BY log_date DESC")
        if not loan_logs.empty:
            c_lent, c_borrowed = st.columns(2)
            with c_lent:
                st.markdown("**➡️ Items We LENT (Out)**")
                lent_df = loan_logs[loan_logs['action_type'].str.contains("Loan OUT")]
                st.dataframe(lent_df, use_container_width=True)
            with c_borrowed:
                st.markdown("**⬅️ Items We BORROWED (In)**")
                borrowed_df = loan_logs[loan_logs['action_type'].str.contains("Loan IN")]
                st.dataframe(borrowed_df, use_container_width=True)
        else: st.info("No loan history found.")

    with tab3: # Requests (Editable)
        reqs = run_query("SELECT * FROM requests WHERE status = 'Pending' ORDER BY request_date DESC")
        if reqs.empty: st.success("✅ No pending requests")
        else:
            for _, row in reqs.iterrows():
                with st.container(border=True):
                    c1, c2 = st.columns([1, 1])
                    with c1:
                        st.markdown(f"**{row['item_name']}**")
                        st.caption(f"Req Qty: **{row['qty']} {row['unit']}** | By: {row['supervisor_name']} ({row['region']})")
                        stock = run_query("SELECT qty FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": row['item_name']})
                        avail = stock.iloc[0]['qty'] if not stock.empty else 0
                        st.info(f"NTCC Stock: {avail}")
                    with c2:
                        # Editable Fields
                        mgr_qty = st.number_input("Edit Qty", 1, 10000, int(row['qty']), key=f"mgr_q_{row['req_id']}")
                        mgr_notes = st.text_input(txt['notes'], value=str(row['notes']) if row['notes'] else "", key=f"mgr_n_{row['req_id']}")
                        b1, b2, b3 = st.columns(3)
                        
                        if b1.button(txt['update_btn'], key=f"up_{row['req_id']}"):
                            update_request_details(row['req_id'], mgr_qty, mgr_notes)
                            st.success("Saved"); st.rerun()
                        
                        if b2.button("Approve", key=f"ap_{row['req_id']}"):
                            if avail >= mgr_qty:
                                update_request_status(row['req_id'], "Approved", mgr_qty, mgr_notes)
                                st.success("Approved"); st.rerun()
                            else: st.error("Low Stock")
                            
                        if b3.button("Reject", key=f"rj_{row['req_id']}"):
                            update_request_status(row['req_id'], "Rejected", notes=mgr_notes)
                            st.rerun()

    with tab4: # Local Reports (With Updated By)
        st.subheader("📊 Detailed Branch Inventory")
        sel_area = st.selectbox("Select Area to View Report", AREAS)
        df_report = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region = :r ORDER BY item_name", params={"r": sel_area})
        if df_report.empty: st.info(f"No inventory data recorded for **{sel_area}** yet.")
        else:
            st.dataframe(df_report, use_container_width=True)
            st.caption(f"Total Items Counted: {len(df_report)}")

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), use_container_width=True)

# --- STOREKEEPER VIEW (Restored Features) ---
def storekeeper_view():
    st.header(txt['storekeeper_role'])
    tab1, tab2, tab3 = st.tabs([txt['approved_reqs'], "📦 Manage NTCC", "🏭 Manage SNC"])
    
    with tab1: # Issue
        reqs = run_query("SELECT * FROM requests WHERE status = 'Approved'")
        if reqs.empty: st.info("✅ No requests to issue")
        else:
            for _, row in reqs.iterrows():
                with st.container(border=True):
                    c_det, c_act = st.columns([1, 1])
                    with c_det:
                        st.markdown(f"**{row['item_name']}**")
                        st.caption(f"Approved Qty: **{row['qty']} {row['unit']}**")
                        if row['notes']: st.warning(f"Note: {row['notes']}")
                        inv_check = run_query("SELECT qty FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": row['item_name']})
                        current_stock = inv_check.iloc[0]['qty'] if not inv_check.empty else 0
                        st.info(f"NTCC Stock: {current_stock}")

                    with c_act:
                        final_qty = st.number_input("Issue Qty", 1, 10000, int(row['qty']), key=f"iq_{row['req_id']}")
                        sk_notes = st.text_input("Storekeeper Notes", key=f"sk_n_{row['req_id']}")
                        if st.button(txt['issue'], key=f"btn_iss_{row['req_id']}"):
                            if final_qty > current_stock:
                                st.error(txt['insufficient_stock_sk'])
                            else:
                                ok, msg = update_central_stock(row['item_name'], "NTCC", -final_qty, st.session_state.user_info['name'], f"Issued to {row['region']}", row['unit'])
                                if ok:
                                    final_note = f"{row['notes']} | SK: {sk_notes}" if row['notes'] else sk_notes
                                    update_request_status(row['req_id'], "Issued", final_qty, final_note)
                                    update_local_inventory(row['region'], row['item_name'], get_local_inventory_by_item(row['region'], row['item_name']) + final_qty, st.session_state.user_info['name'])
                                    st.success("Issued"); st.rerun()
                                else: st.error(msg)
    
    with tab2: # NTCC
        st.subheader("Internal Warehouse (NTCC)")
        ntcc_inv = get_inventory("NTCC")
        if not ntcc_inv.empty:
            st.dataframe(ntcc_inv[['name_en', 'qty', 'unit']], use_container_width=True)
            with st.expander("🛠 Manual Adjustment"):
                item_tk = st.selectbox("Item", ntcc_inv['name_en'].unique(), key="tk_it")
                row_tk = ntcc_inv[ntcc_inv['name_en'] == item_tk].iloc[0]
                c1, c2, c3 = st.columns(3)
                act_tk = c1.radio("Action", ["Add", "Remove"], key="act_tk")
                amt_tk = c2.number_input("Qty", 1, 1000, 1, key="amt_tk")
                if c3.button("Update", key="btn_tk"):
                    change = amt_tk if act_tk == "Add" else -amt_tk
                    ok, msg = update_central_stock(item_tk, "NTCC", change, st.session_state.user_info['name'], "Stock Take", row_tk['unit'])
                    if ok: st.success("Updated"); st.rerun()

    with tab3: # SNC
        st.subheader("External Warehouse (SNC)")
        snc_inv = get_inventory("SNC")
        if not snc_inv.empty:
            st.dataframe(snc_inv[['name_en', 'qty', 'unit']], use_container_width=True)
            with st.expander("🛠 SNC Transfer to NTCC"):
                item_tr = st.selectbox("Transfer Item", snc_inv['name_en'].unique(), key="tr_it")
                row_tr = snc_inv[snc_inv['name_en'] == item_tr].iloc[0]
                qty_tr = st.number_input("Transfer Qty", 1, 1000, 1, key="tr_qn")
                if st.button(txt['transfer_btn']):
                    if row_tr['qty'] >= qty_tr:
                        ok, msg = transfer_stock(item_tr, qty_tr, st.session_state.user_info['name'], row_tr['unit'])
                        if ok: st.success("Transferred"); st.rerun()
                        else: st.error(msg)
                    else: st.error("Low Stock")

# --- SUPERVISOR VIEW (Restored Features) ---
def supervisor_view():
    info = st.session_state.user_info
    tab1, tab2 = st.tabs([txt['req_form'], txt['local_inv']])
    
    with tab1: # Request
        # Allow selecting any region
        req_region = st.selectbox("Select Area for Request", AREAS, index=AREAS.index(info['region']) if info['region'] in AREAS else 0)
        inv = get_inventory("NTCC")
        if not inv.empty:
            with st.container(border=True):
                s_item = st.selectbox("Item", inv['name_en'].unique())
                row_item = inv[inv['name_en'] == s_item].iloc[0]
                st.caption(f"Unit: {row_item['unit']}")
                s_qty = st.number_input("Qty", 1, 1000, 1)
                if st.button(txt['send_req'], use_container_width=True):
                    run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                              {"s": info['name'], "r": req_region, "i": s_item, "c": row_item['category'], "q": s_qty, "u": row_item['unit']})
                    st.success("Sent"); st.rerun()
                
    with tab2: # Inventory (Dynamic Tabs)
        # 1. Submission Form
        selected_area_inv = st.selectbox("Select Area for Count", AREAS, index=AREAS.index(info['region']) if info['region'] in AREAS else 0, key="inv_reg_sel")
        inv = get_inventory("NTCC")
        
        # Helper to get current local quantity
        def get_local_qty(area, item):
            res = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", {"r": area, "i": item})
            return int(res.iloc[0]['qty']) if not res.empty else 0

        if not inv.empty:
            # Build list for selectbox
            items_list = inv['name_en'].unique()
            item_up = st.selectbox("Update Weekly Count", items_list)
            cur_q = get_local_qty(selected_area_inv, item_up)
            
            with st.container(border=True):
                st.metric("Current Registered", cur_q)
                new_val = st.number_input("New Actual Count", 0, 10000, cur_q)
                if st.button("Submit Count"):
                    update_local_inventory(selected_area_inv, item_up, new_val, info['name'])
                    st.success("Updated"); st.rerun()
        
        # 2. Display Dynamic Tabs (My Submitted Counts)
        st.divider()
        st.markdown("### 📋 My Submitted Counts")
        my_data = run_query("SELECT region, item_name, qty, last_updated FROM local_inventory WHERE updated_by = :u ORDER BY last_updated DESC", params={"u": info['name']})
        if not my_data.empty:
            my_regions = my_data['region'].unique()
            if len(my_regions) > 0:
                count_tabs = st.tabs(list(my_regions))
                for i, r_name in enumerate(my_regions):
                    with count_tabs[i]:
                        r_df = my_data[my_data['region'] == r_name]
                        st.dataframe(r_df[['item_name', 'qty', 'last_updated']], use_container_width=True)
        else:
            st.info("No counts submitted yet.")

# --- Helper for Storekeeper/Supervisor logic ---
def get_local_inventory_by_item(region, item_name):
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- 8. التنفيذ الرئيسي (الحل النهائي للشاشة البيضاء) ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
