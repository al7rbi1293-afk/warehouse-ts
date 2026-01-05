import streamlit as st
import pandas as pd
from datetime import datetime
import io
import uuid
import time
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# --- إعدادات الصفحة ---
st.set_page_config(page_title="WMS Integrated", layout="wide")

# --- القوائم للترجمة ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
CATS_AR = ["كهربائية", "كيميائية", "أدوات يدوية", "مستهلكات", "سلامة", "أخرى"]

def get_cat_key(selection):
    if selection in CATS_EN: return selection
    elif selection in CATS_AR: return CATS_EN[CATS_AR.index(selection)]
    return "Others"

# --- الترجمة ---
T = {
    "ar": {
        "app_title": "نظام إدارة سلسلة الإمداد والمستودعات",
        "login_page": "تسجيل الدخول", "register_page": "تسجيل مشرف جديد",
        "username": "اسم المستخدم", "password": "كلمة المرور",
        "fullname": "الاسم الكامل", "region": "المنطقة",
        "login_btn": "دخول", "register_btn": "إنشاء حساب", "logout": "خروج",
        "manager_role": "الإدارة", "supervisor_role": "مشرف", "storekeeper_role": "أمين المستودع",
        "name_ar": "الاسم (عربي)", "name_en": "الاسم (English)", "category": "التصنيف",
        "qty": "الكمية المركزية", "cats": CATS_AR,
        "requests_log": "سجل الطلبات", "inventory": "المخزون المركزي",
        "local_inv": "📦 جرد مستودعي (تحديث الكميات)",
        "local_inv_mgr": "🏢 تقارير المخزون المحلي للفروع",
        "req_form": "طلب مواد",
        "select_item": "اختر المادة",
        "current_local": "المتوفر لديك حالياً:",
        "update_local": "تحديث الجرد",
        "qty_req": "الكمية المطلوبة",
        "qty_local": "العدد الفعلي لدي",
        "send_req": "إرسال الطلب", "update_btn": "حفظ الجرد",
        "download_excel": "تصدير Excel", "no_items": "لا يوجد مواد",
        "pending_reqs": "⏳ طلبات تحتاج موافقة (مقسمة بالمناطق)",
        "approved_reqs": "📦 طلبات معتمدة (بانتظار الصرف)",
        "approve": "✅ اعتماد", "reject": "❌ رفض", "issue": "📦 صرف وخصم من المخزون",
        "status": "الحالة", "reason": "ملاحظات / سبب الرفض",
        "pending": "بانتظار المدير", "approved": "معتمد (بانتظار الصرف)", 
        "rejected": "مرفوض", "issued": "تم الصرف",
        "err_qty": "الكمية في المخزون المركزي غير كافية!",
        "success_update": "تم التحديث بنجاح",
        "success_req": "تم إرسال الطلب",
        "success_issue": "تم صرف المواد وتحديث المخزون بنجاح",
        "filter_region": "المنطقة",
        "issue_qty_input": "الكمية التي سيتم صرفها فعلياً",
        "manage_stock": "⚙️ إدارة وتعديل المخزون المركزي",
        "select_action": "نوع العملية",
        "add_stock": "➕ إضافة للمخزون (توريد)",
        "reduce_stock": "➖ سحب من المخزون (تالف/صرف يدوي)",
        "amount": "الكمية",
        "current_stock_display": "الرصيد الحالي في النظام:",
        "new_stock_display": "الرصيد المتوقع بعد التحديث:",
        "execute_update": "تحديث الرصيد"
    },
    "en": {
        "app_title": "Supply Chain & Warehouse System",
        "login_page": "Login", "register_page": "Register",
        "username": "Username", "password": "Password",
        "fullname": "Full Name", "region": "Region",
        "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
        "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
        "name_ar": "Name (Ar)", "name_en": "Name (En)", "category": "Category",
        "qty": "Central Qty", "cats": CATS_EN,
        "requests_log": "Requests Log", "inventory": "Central Inventory",
        "local_inv": "📦 My Stock Take",
        "local_inv_mgr": "🏢 Local Stock Reports",
        "req_form": "Request Items",
        "select_item": "Select Item",
        "current_local": "Current Local Stock:",
        "update_local": "Update Stock",
        "qty_req": "Qty Requested",
        "qty_local": "Actual Qty on Hand",
        "send_req": "Submit Request", "update_btn": "Save Count",
        "download_excel": "Export Excel", "no_items": "No items",
        "pending_reqs": "⏳ Pending Approval (By Region)",
        "approved_reqs": "📦 Approved Requests (Ready to Issue)",
        "approve": "✅ Approve", "reject": "❌ Reject", "issue": "📦 Issue & Deduct Stock",
        "status": "Status", "reason": "Reason",
        "pending": "Pending Manager", "approved": "Approved (Pending Issue)", 
        "rejected": "Rejected", "issued": "Issued",
        "err_qty": "Insufficient Central Stock!",
        "success_update": "Stock updated",
        "success_req": "Request sent",
        "success_issue": "Items issued and stock updated",
        "filter_region": "Region",
        "issue_qty_input": "Actual Issued Qty",
        "manage_stock": "⚙️ Central Stock Management",
        "select_action": "Action Type",
        "add_stock": "➕ Add to Stock",
        "reduce_stock": "➖ Remove from Stock",
        "amount": "Amount",
        "current_stock_display": "Current System Stock:",
        "new_stock_display": "Expected Stock after update:",
        "execute_update": "Update Stock"
    }
}

lang_choice = st.sidebar.selectbox("Language / اللغة", ["العربية", "English"])
lang = "ar" if lang_choice == "العربية" else "en"
txt = T[lang]

if lang == "ar":
    st.markdown("<style>.stApp {direction: rtl; text-align: right;} .stDataFrame {direction: rtl;}</style>", unsafe_allow_html=True)
else:
    st.markdown("<style>.stApp {direction: ltr; text-align: left;}</style>", unsafe_allow_html=True)

# --- الاتصال بـ Google Sheets ---
@st.cache_resource
def get_connection():
    try:
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds_dict = dict(st.secrets["gcp_service_account"])
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open("WMS_Database")
        return sheet
    except: return None

def load_data(worksheet_name):
    try:
        sh = get_connection()
        ws = sh.worksheet(worksheet_name)
        data = ws.get_all_records()
        return pd.DataFrame(data)
    except: return pd.DataFrame()

def save_row(worksheet_name, row_data_list):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.append_row(row_data_list)

def update_data(worksheet_name, df):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.clear()
    ws.update([df.columns.values.tolist()] + df.values.tolist())

def update_local_inventory_record(region, item_en, item_ar, new_qty):
    try:
        sh = get_connection()
        ws = sh.worksheet('local_inventory')
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        
        if not df.empty:
            mask = (df['region'] == region) & (df['item_en'] == item_en)
        else: mask = pd.Series([False])

        if mask.any():
            row_idx = df.index[mask][0]
            ws.update_cell(row_idx + 2, 4, int(new_qty))
            ws.update_cell(row_idx + 2, 5, datetime.now().strftime("%Y-%m-%d %H:%M"))
        else:
            ws.append_row([region, item_en, item_ar, int(new_qty), datetime.now().strftime("%Y-%m-%d %H:%M")])
        return True
    except: return False

# --- إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# === تسجيل الدخول ===
if not st.session_state.logged_in:
    st.title(f"🔐 {txt['app_title']}")
    t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
    with t1:
        with st.form("log"):
            u = st.text_input(txt['username']).strip()
            p = st.text_input(txt['password'], type="password").strip()
            if st.form_submit_button(txt['login_btn']):
                users = load_data('users')
                if not users.empty:
                    users['username'] = users['username'].astype(str)
                    users['password'] = users['password'].astype(str)
                    match = users[(users['username']==u) & (users['password']==p)]
                    if not match.empty:
                        st.session_state.logged_in = True
                        st.session_state.user_info = match.iloc[0].to_dict()
                        st.rerun()
                    else: st.error(txt['error_login'])
                else: st.error("Database Error")
    with t2:
        with st.form("reg"):
            nu = st.text_input(txt['username'], key='r_u').strip()
            np = st.text_input(txt['password'], type='password', key='r_p').strip()
            nn = st.text_input(txt['fullname'])
            nr = st.text_input(txt['region'])
            if st.form_submit_button(txt['register_btn']):
                users = load_data('users')
                exists = False
                if not users.empty:
                    if nu in users['username'].astype(str).values: exists = True
                if not exists and nu:
                    save_row('users', [nu, np, nn, 'supervisor', nr])
                    st.success("OK")
                else: st.error("Error")

# === النظام الرئيسي ===
else:
    info = st.session_state.user_info
    st.sidebar.markdown("---")
    st.sidebar.write(f"👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']}")
    st.sidebar.caption(f"🔑 {info['role']}")
    
    if st.sidebar.button(txt['logout']):
        st.session_state.logged_in = False
        st.rerun()

    # ================= 1. واجهة المدير (Manager) =================
    if info['role'] == 'manager':
        st.header(f"👨‍💼 {txt['manager_role']}")
        
        reqs = load_data('requests')
        inv = load_data('inventory')
        
        # --- قسم 1: إدارة المخزون المركزي (التعديل الجديد) ---
        with st.expander(txt['manage_stock'], expanded=True):
            if inv.empty:
                st.warning(txt['no_items'])
                st.caption("الرجاء إضافة المواد عن طريق ملف Google Sheets صفحة Inventory")
            else:
                st.info("💡 لإضافة مواد جديدة أو تعديل الأسماء، استخدم ملف Google Sheets مباشرة.")
                # قائمة اختيار المادة
                item_options = inv.apply(lambda x: f"{x['name_ar']} | {x['name_en']}", axis=1)
                selected_item_mgr = st.selectbox(txt['select_item'], item_options, key="mgr_stock_sel")
                
                # جلب بيانات المادة المختارة
                idx_mgr = item_options[item_options == selected_item_mgr].index[0]
                current_mgr_qty = int(inv.at[idx_mgr, 'qty'])
                
                c1, c2, c3 = st.columns(3)
                c1.metric(txt['current_stock_display'], current_mgr_qty)
                
                # خيارات التعديل
                action_type = c2.radio(txt['select_action'], [txt['add_stock'], txt['reduce_stock']], key="mgr_action")
                adjust_qty = c3.number_input(txt['amount'], 1, 10000, 1, key="mgr_adj_val")
                
                # حساب الرصيد المتوقع
                if action_type == txt['add_stock']:
                    expected_qty = current_mgr_qty + adjust_qty
                else:
                    expected_qty = max(0, current_mgr_qty - adjust_qty)
                
                c3.caption(f"{txt['new_stock_display']} **{expected_qty}**")
                
                if st.button(txt['execute_update'], key="mgr_save_btn"):
                    inv.at[idx_mgr, 'qty'] = expected_qty
                    update_data('inventory', inv)
                    st.success(txt['success_update'])
                    time.sleep(1)
                    st.rerun()

        st.markdown("---")

        # --- قسم 2: الطلبات المعلقة ---
        st.subheader(txt['pending_reqs'])
        pending_all = reqs[reqs['status'] == txt['pending']] if not reqs.empty else pd.DataFrame()
        
        if pending_all.empty:
            st.info("✅ لا توجد طلبات جديدة")
        else:
            regions = pending_all['region'].unique()
            for region in regions:
                with st.expander(f"📍 منطقة: {region} ({len(pending_all[pending_all['region']==region])} طلبات)", expanded=False):
                    region_reqs = pending_all[pending_all['region'] == region]
                    for index, row in region_reqs.iterrows():
                        c1, c2, c3 = st.columns([3, 1, 1])
                        c1.write(f"**{row['item_ar']}** | العدد: **{row['qty']}** | المشرف: {row['supervisor']}")
                        
                        if c2.button(txt['approve'], key=f"app_{row['req_id']}"):
                            reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['approved']
                            update_data('requests', reqs)
                            st.success(f"تم اعتماد طلب {row['item_ar']}")
                            time.sleep(1)
                            st.rerun()
                            
                        reason = c3.text_input("سبب الرفض", key=f"rsn_{row['req_id']}")
                        if c3.button(txt['reject'], key=f"rej_{row['req_id']}"):
                            if reason:
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['rejected']
                                reqs.loc[reqs['req_id'] == row['req_id'], 'reason'] = reason
                                update_data('requests', reqs)
                                st.warning("تم الرفض")
                                time.sleep(1)
                                st.rerun()
                            else: st.error("اذكر السبب")
                        st.divider()

        st.markdown("---")
        # --- قسم 3: تقارير الجرد المحلي ---
        with st.expander(txt['local_inv_mgr']):
            local_data = load_data('local_inventory')
            if not local_data.empty:
                st.dataframe(local_data, use_container_width=True)
                b = io.BytesIO()
                with pd.ExcelWriter(b, engine='openpyxl') as w: local_data.to_excel(w, index=False)
                st.download_button(txt['download_excel'], b.getvalue(), "local_inv.xlsx")

    # ================= 2. واجهة أمين المستودع (Store Keeper) =================
    elif info['role'] == 'storekeeper':
        st.header(f"🏭 {txt['storekeeper_role']}")
        reqs = load_data('requests')
        inv = load_data('inventory')
        approved_df = reqs[reqs['status'] == txt['approved']] if not reqs.empty else pd.DataFrame()
        st.subheader(txt['approved_reqs'])
        
        if approved_df.empty:
            st.info("لا توجد طلبات بانتظار الصرف")
        else:
            st.dataframe(approved_df[['region', 'item_ar', 'qty', 'date']], use_container_width=True)
            st.markdown("---")
            st.write("### ⏬ تنفيذ الصرف")
            for index, row in approved_df.iterrows():
                with st.container(border=True):
                    c1, c2, c3 = st.columns([2, 1, 1])
                    c1.write(f"**{row['item_ar']}** ({row['item_en']})")
                    c1.caption(f"المنطقة: {row['region']} | المطلوب: {row['qty']}")
                    issue_qty = c2.number_input(txt['issue_qty_input'], 1, 9999, int(row['qty']), key=f"iss_q_{row['req_id']}")
                    if c3.button(txt['issue'], key=f"iss_btn_{row['req_id']}"):
                        item_match = inv[inv['name_en'] == row['item_en']]
                        if not item_match.empty:
                            idx = item_match.index[0]
                            current_stock = int(inv.at[idx, 'qty'])
                            if current_stock >= issue_qty:
                                inv.at[idx, 'qty'] = current_stock - issue_qty
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['issued']
                                reqs.loc[reqs['req_id'] == row['req_id'], 'qty'] = issue_qty
                                
                                local_inv_df = load_data('local_inventory')
                                current_local = 0
                                if not local_inv_df.empty:
                                    lm = local_inv_df[(local_inv_df['region'] == row['region']) & (local_inv_df['item_en'] == row['item_en'])]
                                    if not lm.empty: current_local = int(lm.iloc[0]['qty'])
                                
                                update_local_inventory_record(row['region'], row['item_en'], row['item_ar'], current_local + issue_qty)
                                update_data('inventory', inv)
                                update_data('requests', reqs)
                                st.balloons()
                                st.success(f"{txt['success_issue']} ({issue_qty})")
                                time.sleep(2)
                                st.rerun()
                            else: st.error(f"{txt['err_qty']} (المتوفر: {current_stock})")
                        else: st.error("المادة غير موجودة")

    # ================= 3. واجهة المشرف (Supervisor) =================
    else:
        t_req, t_inv = st.tabs([txt['req_form'], txt['local_inv']])
        inv = load_data('inventory')
        local_inv = load_data('local_inventory')
        avail_items = inv[inv['status'] == 'Available'] if not inv.empty else pd.DataFrame()
        
        with t_req:
            st.header(txt['req_form'])
            if avail_items.empty:
                st.warning(txt['no_items'])
            else:
                with st.form("req_form_new"):
                    opts = avail_items.apply(lambda x: f"{x['name_ar']} | {x['name_en']}", axis=1)
                    sel = st.selectbox(txt['select_item'], opts)
                    qty = st.number_input(txt['qty_req'], 1, 1000, 1)
                    if st.form_submit_button(txt['send_req']):
                        idx = opts[opts == sel].index[0]
                        item = avail_items.loc[idx]
                        save_row('requests', [
                            str(uuid.uuid4()), info['name'], info['region'],
                            item['name_ar'], item['name_en'], item['category'],
                            qty, datetime.now().strftime("%Y-%m-%d %H:%M"),
                            txt['pending'], ""
                        ])
                        st.success(txt['success_req'])
                        time.sleep(1)
                        st.rerun()
            st.markdown("---")
            st.caption("حالة طلباتي:")
            reqs = load_data('requests')
            if not reqs.empty:
                my_reqs = reqs[reqs['supervisor'] == info['name']]
                st.dataframe(my_reqs[['item_ar', 'qty', 'status', 'reason']], use_container_width=True)

        with t_inv:
            st.header(txt['local_inv'])
            st.caption("قم بتحديث الكميات المتوفرة في مستودعك المحلي:")
            if avail_items.empty:
                st.info("لا توجد مواد")
            else:
                items_list = []
                for idx, row in avail_items.iterrows():
                    current_qty = 0
                    if not local_inv.empty:
                        match = local_inv[(local_inv['region'] == info['region']) & (local_inv['item_en'] == row['name_en'])]
                        if not match.empty: current_qty = int(match.iloc[0]['qty'])
                    items_list.append({"name_ar": row['name_ar'], "name_en": row['name_en'], "current_qty": current_qty})
                
                selected_item_inv = st.selectbox("اختر المادة لتحديث جردها:", [f"{x['name_ar']}" for x in items_list], key="inv_sel")
                selected_data = next((item for item in items_list if item["name_ar"] == selected_item_inv), None)
                if selected_data:
                    st.write(f"**المادة:** {selected_data['name_ar']} ({selected_data['name_en']})")
                    c1, c2 = st.columns(2)
                    new_val = c1.number_input(txt['qty_local'], 0, 9999, selected_data['current_qty'], key="new_val_inv")
                    if c2.button(txt['update_btn'], key="save_inv_btn"):
                        update_local_inventory_record(info['region'], selected_data['name_en'], selected_data['name_ar'], new_val)
                        st.success(txt['success_update'])
                        time.sleep(1)
                        st.rerun()
