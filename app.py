import streamlit as st
import time
from modules.database import init_db
from modules.auth import login_user, register_user, update_user_profile_full
from modules.utils import setup_styles, show_footer
from modules.config import TEXT as txt, AREAS
from modules.views.warehouse import manager_view_warehouse, storekeeper_view, supervisor_view_warehouse
from modules.views.manpower import manager_view_manpower, supervisor_view_manpower
from modules.views.dashboard import manager_dashboard

# --- 1. Page Setup & Styling ---
st.set_page_config(page_title="NSTC Management", layout="wide", initial_sidebar_state="expanded", page_icon="📦")
setup_styles()

# --- 2. Session Management ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}
if 'active_module' not in st.session_state:
    st.session_state.active_module = "Warehouse" # Default module

# --- 3. Main Application Views ---

@st.fragment
def show_login():
    st.title(f"🔐 {txt['app_title']}")
    show_footer()
    
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
    is_night_shift_sidebar = False
    if info.get('role') == 'night_supervisor': is_night_shift_sidebar = True
    if info.get('shift_name') in ['B', 'B1']: is_night_shift_sidebar = True

    if not is_night_shift_sidebar: # Hide switcher for night supervisor
        st.sidebar.divider()
        st.sidebar.markdown("### 🔀 Module Selection")
        # Add Dashboard for Manager
        options = ["Warehouse", "Manpower"]
        if info.get('role') == 'manager':
            options = ["Dashboard", "Warehouse", "Manpower"]
        
        # Get current index based on stored module
        current_mod = st.session_state.get('active_module', options[0])
        current_idx = options.index(current_mod) if current_mod in options else 0
        
        def on_module_change():
            st.session_state.active_module = st.session_state.mod_switcher
            
        st.sidebar.radio("Go to:", options, index=current_idx, key="mod_switcher", on_change=on_module_change)
        st.sidebar.divider()
    else:
        st.sidebar.info(f"🌙 Night Shift Mode ({info.get('shift_name', 'B')})")

    @st.fragment
    def refresh_button():
        if st.button(txt['refresh_data'], use_container_width=True):
            st.cache_data.clear()
            st.toast("✅ Data refreshed!", icon="🔄")
            st.rerun(scope="fragment")
    
    with st.sidebar:
        refresh_button()
    
    with st.sidebar.expander(f"🛠 {txt['edit_profile']}"):
        @st.fragment
        def render_profile_editor(current_info):
            new_u = st.text_input(txt['username'], value=current_info['username'])
            new_n = st.text_input(txt['new_name'], value=current_info['name'])
            # Password field empty by default for security focus in updates
            new_p = st.text_input(txt['new_pass'], type="password", help="Leave empty to keep current password")
            
            if st.button(txt['save_changes'], use_container_width=True):
                p_to_save = new_p if new_p else current_info['password']
                
                res, msg = update_user_profile_full(current_info['username'], new_u, new_n, p_to_save, current_info['password'])
                if res:
                    st.success(msg)
                    time.sleep(1)
                    st.session_state.logged_in = False
                    st.session_state.user_info = {}
                    st.cache_data.clear()
                    st.rerun()
                else: st.error(msg)
        render_profile_editor(info)

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
    
    if st.session_state.active_module == "Dashboard":
        manager_dashboard()
    elif st.session_state.active_module == "Warehouse":
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
    
    st.sidebar.caption("v1.2 - Schema Fix Applied (Check DB)")
    show_footer()

if __name__ == "__main__":
    init_db() # Ensure tables exist
    if st.session_state.logged_in:
        show_main_app()
    else:
        show_login()
