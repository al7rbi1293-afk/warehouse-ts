import streamlit as st
import pandas as pd
from datetime import datetime
import io
import uuid
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# --- إعدادات الصفحة ---
st.set_page_config(page_title="WMS Cloud Pro", layout="wide")

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
        "app_title": "نظام إدارة المستودعات والمخزون المحلي",
        "login_page": "تسجيل الدخول", "register_page": "تسجيل مشرف جديد",
        "username": "اسم المستخدم", "password": "كلمة المرور",
        "fullname": "الاسم الكامل", "region": "المنطقة",
        "login_btn": "دخول", "register_btn": "إنشاء حساب", "logout": "خروج",
        "manager_role": "الإدارة", "supervisor_role": "مشرف",
        "add_item": "➕ تعريف مادة جديدة (النظام)",
        "name_ar": "الاسم (عربي)", "name_en": "الاسم (English)", "category": "التصنيف",
        "qty": "الكمية", "cats": CATS_AR,
        "requests_log": "سجل الطلبات", "inventory": "المخزون المركزي",
        "local_inv": "📦 مخزوني المحلي (الجرد)",
        "local_inv_mgr": "🏢 تقارير المخزون المحلي للفروع",
        "req_form": "طلب مواد",
        "select_item": "اختر المادة",
        "current_local": "المتوفر لديك حالياً في المستودع المحلي:",
        "update_local": "تحديث جرد المادة",
        "qty_req": "الكمية المطلوبة من المركزي",
        "qty_local": "الكمية المتوفرة لدي فعلياً (تحديث الجرد)",
        "send_req": "إرسال الطلب", "update_btn": "حفظ الجرد فقط",
        "download_excel": "تصدير Excel", "no_items": "لا يوجد مواد",
        "pending_reqs": "⏳ طلبات بانتظار الموافقة",
        "approve": "✅ قبول", "reject": "❌ رفض",
        "status": "الحالة", "reason": "ملاحظات / سبب الرفض",
        "pending": "قيد الانتظار", "approved": "تم الصرف", "rejected": "مرفوض",
        "err_qty": "الكمية في المخزون المركزي غير كافية!",
        "success_update": "تم تحديث جرد المنطقة بنجاح",
        "success_req": "تم إرسال الطلب بنجاح",
        "filter_region": "تصفية حسب المنطقة"
    },
    "en": {
        "app_title": "Warehouse & Local Inventory System",
        "login_page": "Login", "register_page": "Register",
        "username": "Username", "password": "Password",
        "fullname": "Full Name", "region": "Region",
        "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
        "manager_role": "Manager", "supervisor_role": "Supervisor",
        "add_item": "➕ Define New Item (System)",
        "name_ar": "Name (Ar)", "name_en": "Name (En)", "category": "Category",
        "qty": "Quantity", "cats": CATS_EN,
        "requests_log": "Requests Log", "inventory": "Central Inventory",
        "local_inv": "📦 My Local Inventory",
        "local_inv_mgr": "🏢 Branches Local Inventory Reports",
        "req_form": "Request Materials",
        "select_item": "Select Item",
        "current_local": "Currently in your Local Stock:",
        "update_local": "Update Local Stock",
        "qty_req": "Quantity Requested",
        "qty_local": "Actual Quantity on Hand (Update Stock)",
        "send_req": "Submit Request", "update_btn": "Save Stock Count Only",
        "download_excel": "Export Excel", "no_items": "No items",
        "pending_reqs": "⏳ Pending Requests",
        "approve": "✅ Approve", "reject": "❌ Reject",
        "status": "Status", "reason": "Reason",
        "pending": "Pending", "approved": "Approved", "rejected": "Rejected",
        "err_qty": "Insufficient Central Stock!",
        "success_update": "Local stock updated successfully",
        "success_req": "Request sent successfully",
        "filter_region": "Filter by Region"
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
def get_connection():
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds_dict = dict(st.secrets["gcp_service_account"])
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
    client = gspread.authorize(creds)
    sheet = client.open("WMS_Database")
    return sheet

def load_data(worksheet_name):
    try:
        sh = get_connection()
        ws = sh.worksheet(worksheet_name)
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        if worksheet_name == 'users' and not df.empty:
            df['username'] = df['username'].astype(str)
            df['password'] = df['password'].astype(str)
        return df
    except Exception as e:
        return pd.DataFrame()

def save_row(worksheet_name, row_data_list):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.append_row(row_data_list)

def update_data(worksheet_name, df):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.clear()
    ws.update([df.columns.values.tolist()] + df.values.tolist())

# --- دالة خاصة لتحديث الجرد المحلي ---
def update_local_inventory_record(region, item_en, item_ar, new_qty):
    try:
        sh = get_connection()
        ws = sh.worksheet('local_inventory')
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        
        # البحث هل المادة موجودة لهذه المنطقة؟
        if not df.empty:
            mask = (df['region'] == region) & (df['item_en'] == item_en)
        else:
            mask = pd.Series([False])

        if mask.any():
            # تحديث الكمية الموجودة
            row_idx = df.index[mask][0]
            # إضافة 2 لأن إندكس الباندا يبدأ من 0 والهيدر يأخذ 1 في جوجل شيت
            cell_row = row_idx + 2 
            # نفترض أن العمود 4 هو الكمية والعمود 5 هو التاريخ
            ws.update_cell(cell_row, 4, int(new_qty))
            ws.update_cell(cell_row, 5, datetime.now().strftime("%Y-%m-%d %H:%M"))
        else:
            # إضافة صف جديد للجرد
            ws.append_row([region, item_en, item_ar, int(new_qty), datetime.now().strftime("%Y-%m-%d %H:%M")])
        return True
    except Exception as e:
        st.error(f"Error updating local inventory: {e}")
        return False

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
                if nu not in users['username'].astype(str).values and nu:
                    save_row('users', [nu, np, nn, 'supervisor', nr])
                    st.success(txt['success_reg'])
                else: st.error("User exists or empty")

# === التطبيق الرئيسي ===
else:
    info = st.session_state.user_info
    st.sidebar.markdown("---")
    st.sidebar.write(f"👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']}")
    
    if st.sidebar.button(txt['logout']):
        st.session_state.logged_in = False
        st.rerun()

    # ================= واجهة المدير =================
    if info['role'] == 'manager':
        st.header(f"👨‍💼 {txt['manager_role']}")
        
        # 1. الطلبات المعلقة
        st.subheader(txt['pending_reqs'])
        reqs = load_data('requests')
        inv = load_data('inventory')
        
        pending_df = reqs[reqs['status'] == txt['pending']] if not reqs.empty else pd.DataFrame()
        
        if pending_df.empty:
            st.info("لا توجد طلبات معلقة")
        else:
            for index, row in pending_df.iterrows():
                # جلب الكمية المتوفرة في المخزن المحلي لهذا المشرف لعرضها للمدير
                local_inv_df = load_data('local_inventory')
                local_stock_val = 0
                if not local_inv_df.empty:
                    l_match = local_inv_df[(local_inv_df['region'] == row['region']) & (local_inv_df['item_en'] == row['item_en'])]
                    if not l_match.empty:
                        local_stock_val = l_match.iloc[0]['qty']

                with st.expander(f"{row['item_ar']} | الكمية: {row['qty']} | الفرع: {row['region']}", expanded=True):
                    c1, c2, c3 = st.columns([2,1,1])
                    c1.info(f"💡 المخزون المحلي لدى الفرع من هذه المادة: **{local_stock_val}**")
                    
                    if c2.button(txt['approve'], key=f"app_{row['req_id']}"):
                        item_match = inv[inv['name_en'] == row['item_en']]
                        if not item_match.empty:
                            idx = item_match.index[0]
                            curr_qty = int(inv.at[idx, 'qty'])
                            if curr_qty >= int(row['qty']):
                                inv.at[idx, 'qty'] = curr_qty - int(row['qty'])
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['approved']
                                update_data('inventory', inv)
                                update_data('requests', reqs)
                                
                                # تحديث المخزون المحلي للمشرف تلقائياً عند القبول (اختياري)
                                # هنا نزيد الكمية في المخزون المحلي
                                current_local = local_stock_val + int(row['qty'])
                                update_local_inventory_record(row['region'], row['item_en'], row['item_ar'], current_local)
                                
                                st.success("Approved")
                                st.rerun()
                            else: st.error(txt['err_qty'])
                        else: st.error("Item missing")
                    
                    reason = c3.text_input(txt['reason'], key=f"re_{row['req_id']}")
                    if c3.button(txt['reject'], key=f"rej_{row['req_id']}"):
                        if reason:
                            reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['rejected']
                            reqs.loc[reqs['req_id'] == row['req_id'], 'reason'] = reason
                            update_data('requests', reqs)
                            st.rerun()

        st.markdown("---")
        
        # 2. تقارير الجرد المحلي للفروع (جديد)
        st.subheader(txt['local_inv_mgr'])
        local_data = load_data('local_inventory')
        if not local_data.empty:
            regions = ["الكل"] + list(local_data['region'].unique())
            selected_reg = st.selectbox(txt['filter_region'], regions)
            
            if selected_reg != "الكل":
                display_local = local_data[local_data['region'] == selected_reg]
            else:
                display_local = local_data
            
            st.dataframe(display_local, use_container_width=True)
            
            b = io.BytesIO()
            with pd.ExcelWriter(b, engine='openpyxl') as w: display_local.to_excel(w, index=False)
            st.download_button(f"{txt['download_excel']} (Local Inventory)", b.getvalue(), "local_inventory.xlsx")
        else:
            st.warning("لا يوجد بيانات جرد محلي حتى الآن")

        # 3. إدارة المواد (المدير فقط يضيف المواد للنظام)
        with st.expander(txt['add_item']):
            c1, c2, c3 = st.columns(3)
            na = c1.text_input(txt['name_ar'])
            ne = c1.text_input(txt['name_en'])
            cat = c2.selectbox(txt['category'], txt['cats'])
            q = c3.number_input(txt['qty'], 0, 99999, 0, help="الكمية في المستودع المركزي")
            if st.button(txt['add_item']):
                if na and ne:
                    save_row('inventory', [na, ne, get_cat_key(cat), q, 'Available'])
                    st.success("تم تعريف المادة في النظام")
                    st.rerun()

    # ================= واجهة المشرف =================
    else:
        st.header(f"👷 {txt['req_form']} & {txt['local_inv']}")
        
        # تحميل البيانات
        inv = load_data('inventory') # مخزون مركزي لجلب الأسماء
        local_inv = load_data('local_inventory') # مخزون محلي
        
        avail_items = inv[inv['status'] == 'Available']
        
        if avail_items.empty:
            st.warning(txt['no_items'])
        else:
            # دمج البيانات لعرض الجرد الحالي للمشرف
            opts = avail_items.apply(lambda x: f"{x['name_ar']} | {x['name_en']}", axis=1)
            selection = st.selectbox(txt['select_item'], opts)
            
            if selection:
                # استخراج بيانات المادة المختارة
                idx = opts[opts == selection].index[0]
                item_data = avail_items.loc[idx]
                
                # البحث عن الكمية المحلية الحالية لهذه المادة في منطقة المشرف
                current_local_qty = 0
                if not local_inv.empty:
                    match = local_inv[(local_inv['region'] == info['region']) & (local_inv['item_en'] == item_data['name_en'])]
                    if not match.empty:
                        current_local_qty = match.iloc[0]['qty']
                
                st.info(f"📊 {txt['current_local']} **{current_local_qty}**")
                
                col_a, col_b = st.columns(2)
                
                # الخيار 1: طلب مواد من المركزي
                with col_a:
                    st.markdown("### 📥 طلب مواد")
                    req_qty = st.number_input(txt['qty_req'], 0, 1000, 0)
                    if st.button(txt['send_req']):
                        if req_qty > 0:
                            save_row('requests', [
                                str(uuid.uuid4()), info['name'], info['region'],
                                item_data['name_ar'], item_data['name_en'], item_data['category'],
                                req_qty, datetime.now().strftime("%Y-%m-%d %H:%M"),
                                txt['pending'], ""
                            ])
                            st.success(txt['success_req'])
                        else:
                            st.warning("حدد الكمية المطلوبة")

                # الخيار 2: تحديث الجرد المحلي (دون طلب)
                with col_b:
                    st.markdown("### 📝 جرد (تحديث المتوفر)")
                    # نجعل القيمة الافتراضية هي الموجودة حالياً
                    new_local_qty = st.number_input(txt['qty_local'], 0, 9999, int(current_local_qty))
                    
                    if st.button(txt['update_btn']):
                        if update_local_inventory_record(info['region'], item_data['name_en'], item_data['name_ar'], new_local_qty):
                            st.success(txt['success_update'])
                            # مهلة بسيطة ثم تحديث الصفحة لرؤية الرقم الجديد
                            st.rerun()

        st.markdown("---")
        st.subheader("📋 حالة طلباتي السابقة")
        reqs = load_data('requests')
        if not reqs.empty:
            my_reqs = reqs[reqs['supervisor'] == info['name']]
            st.dataframe(my_reqs[['item_ar', 'qty', 'status', 'reason', 'date']], use_container_width=True)
