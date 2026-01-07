import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

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
    "app_title": "Unified WMS System",
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

# --- 5. دوال قاعدة البيانات ---
def run_query(query, params=None):
    try: return conn.query(query, params=params, ttl=0)
    except Exception as e: st.error(f"DB Error: {e}"); return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params); session.commit()
        return True
    except Exception as e: st.error(f"DB Action Error: {e}"); return False

# --- 6. المنطق (Logic) ---
def login_user(username, password):
    df = run_query("SELECT * FROM users WHERE username = :u AND password = :p", params={"u": username, "p": password})
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(username, password, name, region):
    return run_action("INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
                      params={"u": username, "p": password, "n": name, "r": region})

def update_user_profile_full(old_username, new_username, new_name, new_pass):
    if new_username != old_username:
        if not run_query("SELECT username FROM users WHERE username = :u", params={"u": new_username}).empty:
            return False, "Username taken!"
    return run_action("UPDATE users SET username = :nu, name = :nn, password = :np WHERE username = :ou",
                      {"nu": new_username, "nn": new_name, "np": new_pass, "ou": old_username}), "Updated"

def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

def update_central_stock(item_name, location, change, user, action_desc, unit):
    change = int(change)
    # Check if item exists
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location})
    
    if df.empty:
        # If borrowing (adding stock) and item doesn't exist, create it? 
        # For simplicity, we assume item must exist or be created first.
        return False, "Item not found in warehouse. Create it first."
    
    current_qty = int(df.iloc[0]['qty'])
    
    # Validation: Prevent negative stock if lending
    if change < 0 and abs(change) > current_qty:
        return False, f"Insufficient stock! Available: {current_qty}"
    
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
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name})
    if df.empty: run_action("INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')", params={"n": item_name, "u": unit})
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, msg2
    return True, "Transfer Complete"

def receive_from_cww(item_name, dest_loc, qty, user, unit):
    return update_central_stock(item_name, dest_loc, int(qty), user, "Received from CWW", unit)

def update_local_inventory(region, item_name, new_qty, user):
    new_qty = int(new_qty)
    # Check if entry exists
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
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
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- Helper for Bulk Stock Take (Editable Grid) ---
def render_bulk_stock_take(location, user_name, key_prefix):
    inv = get_inventory(location)
    if inv.empty:
        st.info(f"No inventory found in {location}")
        return

    df_view = inv[['name_en', 'category', 'qty', 'unit']].copy()
    df_view.rename(columns={'qty': 'System Qty', 'name_en': 'Item Name'}, inplace=True)
    df_view['Physical Count'] = df_view['System Qty'] 

    st.markdown(f"### 📋 {location} Stock Take")
    st.caption("Edit 'Physical Count'. Differences update automatically.")

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
            st.success(f"Updated {changes_count} items in {location}!"); time.sleep(1); st.rerun()
        else:
            st.info("No changes detected.")

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
                else: st.error(txt['error_login'])
    with t2:
        with st.form("register_form"):
            nu = st.text_input(txt['username'])
            np = st.text_input(txt['password'], type='password')
            nn = st.text_input(txt['fullname'])
            nr = st.selectbox(txt['region'], AREAS)
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                if register_user(nu.strip(), np.strip(), nn, nr): st.success(txt['success_reg'])
                else: st.error("Error: Username might exist")

def show_main_app():
    info = st.session_state.user_info
    
    st.sidebar.title(f"👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    if st.sidebar.button(txt['refresh_data'], use_container_width=True): st.rerun()
    
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
            else: st.error(msg)

    if st.sidebar.button(txt['logout'], use_container_width=True):
        st.session_state.logged_in = False
        st.session_state.user_info = {}
        st.rerun()

    if info['role'] == 'manager': manager_view()
    elif info['role'] == 'storekeeper': storekeeper_view()
    else: supervisor_view()

# ==========================================
# ============ MANAGER VIEW ================
# ==========================================
def manager_view():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock Management", txt['ext_tab'], "⏳ Bulk Review", txt['local_inv'], "📜 Logs"])
    
    # Tab 1: Stock Management (Bulk Edit)
    with tab1:
        with st.expander(txt['create_item_title'], expanded=False):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Name")
            c = c2.selectbox("Category", CATS_EN)
            l = c3.selectbox("Location", LOCATIONS)
            q = c4.number_input("Qty", 0, 10000)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn'], use_container_width=True):
                if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                    run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                              {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                    st.success("Added"); st.rerun()
                else: st.error("Exists")
        st.divider()
        col_ntcc, col_snc = st.columns(2)
        with col_ntcc:
            render_bulk_stock_take("NTCC", st.session_state.user_info['name'], "mgr")
        with col_snc:
            render_bulk_stock_take("SNC", st.session_state.user_info['name'], "mgr")

    # Tab 2: External (LEND / BORROW LOGIC FIXED)
    with tab2:
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
                        # Logic: Lend = Decrease (-), Borrow = Increase (+)
                        if "Lend" in op:
                            change = -int(amt)
                            desc = f"Lend to {proj}"
                        else:
                            change = int(amt)
                            desc = f"Borrow from {proj}"
                            
                        res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], desc, row['unit'])
                        if res: st.success("Transaction Successful!"); st.rerun()
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
                        if res: st.success("Done"); st.rerun()
                        else: st.error(msg)
        
        st.divider()
        st.markdown("### 📊 Project Loan History")
        loan_logs = run_query("SELECT log_date, item_name, change_amount, location, action_type FROM stock_logs WHERE action_type LIKE '%Lend%' OR action_type LIKE '%Borrow%' ORDER BY log_date DESC")
        if not loan_logs.empty:
            st.dataframe(loan_logs, width="stretch")

    # Tab 3: Bulk Review (Requests)
    with tab3: 
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
                            "req_id": None, 
                            "item_name": st.column_config.TextColumn(disabled=True),
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
                                stock = run_query("SELECT qty FROM inventory WHERE name_en=:n AND location='NTCC'", {"n":row['item_name']})
                                avail = stock.iloc[0]['qty'] if not stock.empty else 0
                                if avail >= new_q:
                                    final_note = f"Manager: {new_n}" if new_n else ""
                                    run_action("UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id", {"q":new_q, "n":final_note, "id":rid})
                                    count_changes += 1
                                else: st.toast(f"❌ Low Stock: {row['item_name']}", icon="⚠️")
                            elif action == "Reject":
                                run_action("UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id", {"n":new_n, "id":rid})
                                count_changes += 1
                        if count_changes > 0: st.success(f"Processed {count_changes} requests!"); time.sleep(1); st.rerun()

    with tab4: # Reports
        st.subheader("📊 Detailed Branch Inventory")
        area = st.selectbox("Select Area", AREAS)
        df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r ORDER BY item_name", {"r":area})
        st.dataframe(df, width="stretch")

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), width="stretch")

# ==========================================
# ============ STOREKEEPER VIEW ============
# ==========================================
def storekeeper_view():
    st.header(txt['storekeeper_role'])
    t1, t2, t3, t4 = st.tabs([txt['approved_reqs'], "📋 Issued Today", "NTCC Stock Take", "SNC Stock Take"])
    
    with t1: # Requests (Bulk Issue)
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
                                "req_id": None,
                                "item_name": st.column_config.TextColumn(disabled=True),
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
                            if issued_count > 0: st.success(f"Issued {issued_count} items!"); time.sleep(1); st.rerun()

    with t2: # Issued Today
        st.subheader("📋 Items Issued Today")
        today_log = run_query("""SELECT item_name, qty, unit, region, supervisor_name, notes, request_date FROM requests WHERE status IN ('Issued', 'Received') AND request_date::date = CURRENT_DATE ORDER BY request_date DESC""")
        if today_log.empty: st.info("Nothing issued today yet.")
        else: st.dataframe(today_log, width="stretch")

    with t3: # NTCC Stock Take
        render_bulk_stock_take("NTCC", st.session_state.user_info['name'], "sk")

    with t4: # SNC Stock Take
        render_bulk_stock_take("SNC", st.session_state.user_info['name'], "sk")

# ==========================================
# ============ SUPERVISOR VIEW ============
# ==========================================
def supervisor_view():
    user = st.session_state.user_info
    st.header(txt['supervisor_role'])
    t1, t2, t3, t4 = st.tabs([txt['req_form'], "🚚 Ready for Pickup", "⏳ My Pending", txt['local_inv']])
    
    with t1: # Bulk Request Form
        st.markdown("### 🛒 Bulk Order Form")
        reg = st.selectbox("Ordering for Area:", AREAS, index=AREAS.index(user['region']) if user['region'] in AREAS else 0)
        inv = get_inventory("NTCC")
        if not inv.empty:
            inv_df = inv[['name_en', 'category', 'unit']].copy() 
            inv_df.rename(columns={'name_en': 'Item Name'}, inplace=True)
            inv_df['Order Qty'] = 0 
            
            edited_order = st.data_editor(
                inv_df,
                key="order_editor",
                column_config={
                    "Item Name": st.column_config.TextColumn(disabled=True),
                    "category": st.column_config.TextColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "Order Qty": st.column_config.NumberColumn(min_value=0, max_value=1000, step=1)
                },
                hide_index=True, width="stretch", height=500
            )
            
            if st.button(txt['send_req'], use_container_width=True):
                items_to_order = edited_order[edited_order['Order Qty'] > 0]
                if items_to_order.empty: st.warning("Please enter quantity for at least one item.")
                else:
                    success_count = 0
                    for index, row in items_to_order.iterrows():
                        create_request(supervisor=user['name'], region=reg, item=row['Item Name'], category=row['category'], qty=int(row['Order Qty']), unit=row['unit'])
                        success_count += 1
                    st.balloons(); st.success(f"Sent {success_count} requests!"); time.sleep(2); st.rerun()

    with t2: # Ready for Pickup
        ready = run_query("SELECT * FROM requests WHERE supervisor_name=:s AND status='Issued'", {"s": user['name']})
        if ready.empty: st.info("No items ready for pickup.")
        else:
            st.markdown("### ✅ Items Ready for Pickup")
            pickup_all = st.checkbox("Select All for Receipt", key="pickup_all")
            ready_df = ready[['req_id', 'item_name', 'qty', 'unit', 'notes']].copy()
            ready_df['Confirm'] = pickup_all
            
            edited_ready = st.data_editor(
                ready_df,
                key="ready_editor",
                column_config={
                    "req_id": None,
                    "item_name": st.column_config.TextColumn(disabled=True),
                    "qty": st.column_config.NumberColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "notes": st.column_config.TextColumn(disabled=True),
                    "Confirm": st.column_config.CheckboxColumn("Received?", default=False)
                },
                hide_index=True, width="stretch"
            )
            
            if st.button("Confirm Receipt for Selected"):
                rec_count = 0
                for index, row in edited_ready.iterrows():
                    if row['Confirm']:
                        run_action("UPDATE requests SET status='Received' WHERE req_id=:id", {"id":row['req_id']})
                        current_local_qty = get_local_inventory_by_item(user['region'], row['item_name'])
                        new_total_qty = current_local_qty + int(row['qty'])
                        update_local_inventory(user['region'], row['item_name'], new_total_qty, user['name'])
                        rec_count += 1
                if rec_count > 0: st.balloons(); st.success(f"Received {rec_count} items. Inventory Updated."); time.sleep(1); st.rerun()

    with t3: # Edit Pending
        pending = run_query("SELECT req_id, item_name, qty, unit, request_date FROM requests WHERE supervisor_name=:s AND status='Pending' ORDER BY request_date DESC", {"s": user['name']})
        if pending.empty: st.info("No pending requests.")
        else:
            sup_action = st.radio("Bulk Action:", ["Maintain Status", "Cancel All"], horizontal=True, key="sup_bulk_pending")
            pending_df = pending.copy()
            pending_df['Modify Qty'] = pending_df['qty']
            if sup_action == "Cancel All": pending_df['Action'] = "Cancel"
            else: pending_df['Action'] = "Keep"
            
            edited_pending = st.data_editor(
                pending_df,
                key="sup_pending_edit",
                column_config={
                    "req_id": None,
                    "item_name": st.column_config.TextColumn(disabled=True),
                    "qty": st.column_config.NumberColumn(disabled=True, label="Old Qty"),
                    "Modify Qty": st.column_config.NumberColumn(min_value=1),
                    "Action": st.column_config.SelectboxColumn(options=["Keep", "Update", "Cancel"])
                },
                hide_index=True, width="stretch"
            )
            
            if st.button("Apply Changes"):
                p_changes = 0
                for index, row in edited_pending.iterrows():
                    rid = row['req_id']
                    if row['Action'] == "Update":
                        update_request(rid, int(row['Modify Qty']))
                        p_changes += 1
                    elif row['Action'] == "Cancel":
                        delete_request(rid)
                        p_changes += 1
                if p_changes > 0: st.success(f"Applied changes."); time.sleep(1); st.rerun()

    with t4: # Local Inventory (Manual Count)
        st.info("Update Local Inventory (Weekly Stock Take)")
        # Show existing inventory first to guide user
        local_inv = run_query("SELECT item_name, qty FROM local_inventory WHERE region=:r", {"r":user['region']})
        
        # Merge with master list to allow adding new items to count even if 0
        master_inv = get_inventory("NTCC")[['name_en']].drop_duplicates()
        if not local_inv.empty:
            merged_df = pd.merge(master_inv, local_inv, left_on='name_en', right_on='item_name', how='left')
            merged_df['qty'] = merged_df['qty'].fillna(0).astype(int)
            merged_df['item_name'] = merged_df['name_en'] # ensure name is filled
        else:
            merged_df = master_inv.copy()
            merged_df['qty'] = 0
            merged_df['item_name'] = merged_df['name_en']

        display_df = merged_df[['item_name', 'qty']].copy()
        display_df.rename(columns={'qty': 'System Count', 'item_name': 'Item Name'}, inplace=True)
        display_df['Physical Count'] = display_df['System Count']
        
        edited_local = st.data_editor(
            display_df,
            key="sup_stock_take",
            column_config={
                "Item Name": st.column_config.TextColumn(disabled=True),
                "System Count": st.column_config.NumberColumn(disabled=True),
                "Physical Count": st.column_config.NumberColumn(min_value=0, max_value=10000, required=True)
            },
            hide_index=True, width="stretch", height=500
        )
        
        if st.button("Update Physical Counts"):
            up_count = 0
            for index, row in edited_local.iterrows():
                sys = int(row['System Count'])
                phy = int(row['Physical Count'])
                if sys != phy:
                    update_local_inventory(user['region'], row['Item Name'], phy, user['name'])
                    up_count += 1
            if up_count > 0: st.success(f"Updated {up_count} items."); time.sleep(1); st.rerun()
            else: st.info("No changes made.")

# --- 8. تشغيل التطبيق ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
