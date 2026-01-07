import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. إدارة الجلسة (بدون كوكيز لضمان الاستقرار) ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# --- 3. الثوابت والقواميس ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
LOCATIONS = ["NTCC", "SNC"]
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

def manager_view():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock", txt['ext_tab'], "⏳ Requests", txt['local_inv'], "📜 Logs"])
    
    with tab1: # Central Stock
        col_ntcc, col_snc = st.columns(2)
        with col_ntcc:
            st.markdown("### 🏢 NTCC")
            st.dataframe(get_inventory("NTCC"), use_container_width=True)
        with col_snc:
            st.markdown("### 🏭 SNC")
            st.dataframe(get_inventory("SNC"), use_container_width=True)
            
    with tab3: # Requests
        reqs = run_query("SELECT * FROM requests WHERE status = 'Pending' ORDER BY request_date DESC")
        if reqs.empty: st.success("✅ No pending requests")
        else:
            for _, row in reqs.iterrows():
                with st.container(border=True):
                    c1, c2 = st.columns([3, 1])
                    with c1:
                        st.markdown(f"**{row['item_name']}** ({row['qty']})")
                        st.caption(f"By: {row['supervisor_name']} | {row['region']}")
                        # Check Stock
                        stock = run_query("SELECT qty FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": row['item_name']})
                        avail = stock.iloc[0]['qty'] if not stock.empty else 0
                        st.info(f"Stock: {avail}")
                    with c2:
                        if st.button("Approve", key=f"ap_{row['req_id']}"):
                            if avail >= row['qty']:
                                run_action("UPDATE requests SET status = 'Approved' WHERE req_id = :id", params={"id": row['req_id']})
                                st.rerun()
                            else: st.error("Low Stock")
                        if st.button("Reject", key=f"rj_{row['req_id']}"):
                            run_action("UPDATE requests SET status = 'Rejected' WHERE req_id = :id", params={"id": row['req_id']})
                            st.rerun()

    with tab4: # Local Reports
        st.subheader("📊 Branch Inventory")
        sel_area = st.selectbox("Area", AREAS)
        df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region = :r", params={"r": sel_area})
        st.dataframe(df, use_container_width=True)

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), use_container_width=True)

def storekeeper_view():
    st.header(txt['storekeeper_role'])
    tab1, tab2 = st.tabs([txt['approved_reqs'], "📦 Manage Stock"])
    
    with tab1:
        reqs = run_query("SELECT * FROM requests WHERE status = 'Approved'")
        if reqs.empty: st.info("No requests")
        else:
            for _, row in reqs.iterrows():
                with st.container(border=True):
                    st.markdown(f"**{row['item_name']}** ({row['qty']}) - {row['region']}")
                    if st.button(txt['issue'], key=f"iss_{row['req_id']}"):
                        # Simple Issue Logic
                        run_action("UPDATE inventory SET qty = qty - :q WHERE name_en = :n AND location = 'NTCC'", params={"q": row['qty'], "n": row['item_name']})
                        run_action("UPDATE requests SET status = 'Issued' WHERE req_id = :id", params={"id": row['req_id']})
                        st.success("Issued")
                        st.rerun()
    
    with tab2:
        st.subheader("Internal Warehouse")
        st.dataframe(get_inventory("NTCC"), use_container_width=True)

def supervisor_view():
    info = st.session_state.user_info
    tab1, tab2 = st.tabs([txt['req_form'], txt['local_inv']])
    
    with tab1:
        inv = get_inventory("NTCC")
        if not inv.empty:
            s_item = st.selectbox("Item", inv['name_en'].unique())
            s_qty = st.number_input("Qty", 1, 100)
            if st.button(txt['send_req'], use_container_width=True):
                cat = inv[inv['name_en'] == s_item].iloc[0]['category']
                unit = inv[inv['name_en'] == s_item].iloc[0]['unit']
                run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                          {"s": info['name'], "r": info['region'], "i": s_item, "c": cat, "q": s_qty, "u": unit})
                st.success("Sent")
                
    with tab2:
        # My Submitted Counts
        st.subheader("My Submitted Counts")
        my_data = run_query("SELECT region, item_name, qty, last_updated FROM local_inventory WHERE updated_by = :u", params={"u": info['name']})
        if not my_data.empty:
            st.dataframe(my_data, use_container_width=True)
        else:
            st.info("No counts submitted yet.")

# --- 8. التنفيذ الرئيسي (الحل النهائي للشاشة البيضاء) ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
