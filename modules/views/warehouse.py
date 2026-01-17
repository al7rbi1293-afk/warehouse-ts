
import streamlit as st
import pandas as pd
import time
from modules.database import run_query, run_action, run_batch_action
from modules.config import TEXT as txt, CATS_EN, LOCATIONS, EXTERNAL_PROJECTS, AREAS
from modules.utils import convert_df_to_excel
from modules.inventory_logic import (
    get_inventory, update_central_stock, get_local_inventory_by_item, 
    update_local_inventory, update_request_details, delete_request, transfer_stock
)
from modules.views.common import render_bulk_stock_take

# ==========================================
# ============ MANAGER VIEW (WH) ===========
# ==========================================
@st.fragment
def manager_view_warehouse():
    st.header(txt['manager_role'])
    view_option = st.radio("Navigate", ["📦 Stock Management", txt['ext_tab'], "⏳ Bulk Review", txt['local_inv'], "📜 Logs"], horizontal=True, label_visibility="collapsed")
    
    if view_option == "📦 Stock Management": # Stock
        with st.expander(txt['create_item_title'], expanded=False):
            with st.form("create_item_form", clear_on_submit=True):
                c1, c2, c3, c4 = st.columns(4)
                n = c1.text_input("Name")
                c = c2.selectbox("Category", CATS_EN)
                l = c3.selectbox("Location", LOCATIONS)
                q = c4.number_input("Qty", 0, 10000)
                u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
                if st.form_submit_button(txt['create_btn'], use_container_width=True):
                    if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                        run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                                  {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                        st.toast("Item Added Successfully!", icon="📦")
                        st.rerun()
                    else: st.error("Exists")
        
        with st.expander("🔄 Internal Stock Transfer (SNC ➡️ NSTC)", expanded=False):
            st.caption("Pull stock from SNC warehouse to NSTC warehouse.")
            snc_inv = get_inventory("SNC")
            if not snc_inv.empty:
                 # Prepare for bulk editor
                transfer_df = snc_inv[['name_en', 'category', 'qty', 'unit']].copy()
                transfer_df.rename(columns={'name_en': 'Item Name', 'qty': 'Available Qty'}, inplace=True)
                transfer_df['Transfer Qty'] = 0

                with st.form("internal_transfer_form"):
                    edited_transfer = st.data_editor(
                        transfer_df,
                        key="transfer_editor_snc_nstc",
                        column_config={
                            "Item Name": st.column_config.TextColumn(disabled=True),
                            "category": st.column_config.TextColumn(disabled=True),
                            "unit": st.column_config.TextColumn(disabled=True),
                            "Available Qty": st.column_config.NumberColumn(disabled=True),
                            "Transfer Qty": st.column_config.NumberColumn(min_value=0, max_value=10000, required=True)
                        },
                        hide_index=True, width="stretch", height=400
                    )
                    
                    if st.form_submit_button("Execute Bulk Transfer", use_container_width=True):
                        # Process items with Transfer Qty > 0
                        items_to_transfer = edited_transfer[edited_transfer['Transfer Qty'] > 0]
                        
                        if items_to_transfer.empty:
                            st.warning("Please enter quantity for at least one item.")
                        else:
                            success_count = 0
                            fail_count = 0
                            
                            for index, row in items_to_transfer.iterrows():
                                t_item = row['Item Name']
                                t_qty = int(row['Transfer Qty'])
                                avail_qty = int(row['Available Qty'])
                                unit = row['unit']
                                
                                if t_qty <= avail_qty:
                                    res, msg = transfer_stock(t_item, t_qty, st.session_state.user_info['name'], unit)
                                    if res: success_count += 1
                                    else: fail_count += 1
                                else:
                                    st.error(f"❌ '{t_item}': Request {t_qty} > Available {avail_qty}")
                                    fail_count += 1
                            
                            if success_count > 0:
                                st.balloons()
                                st.success(f"Successfully transferred {success_count} items!")
                                time.sleep(1)
                                st.rerun()
                            if fail_count > 0:
                                st.warning(f"Failed to transfer {fail_count} items. Check errors above.")
            else:
                st.info("SNC Inventory is empty.")

        # Optimization: Use tabs for locations to avoid rendering both tables at once unless needed
        st_tabs = st.tabs(["NSTC Stock", "SNC Stock"])
        with st_tabs[0]: render_bulk_stock_take("NSTC", st.session_state.user_info['name'], "mgr")
        with st_tabs[1]: render_bulk_stock_take("SNC", st.session_state.user_info['name'], "mgr")

    elif view_option == txt['ext_tab']: # External
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                wh = st.selectbox("From/To Warehouse", LOCATIONS, key="l_wh") # Outside form to update list
                inv = get_inventory(wh)
                
                with st.form("loan_execution_form"):
                    proj = st.selectbox("External Project", EXTERNAL_PROJECTS)
                    if not inv.empty:
                        it = st.selectbox("Select Item", inv['name_en'].unique(), key="l_it")
                        op = st.radio("Action Type", ["Lend (Stock Decrease)", "Borrow (Stock Increase)"], horizontal=True)
                        amt = st.number_input("Quantity", 1, 10000, key="l_q")
                        
                        submitted = st.form_submit_button(txt['exec_trans'], use_container_width=True)
                        if submitted:
                            # Verify item still exists in filter
                            item_rows = inv[inv['name_en']==it]
                            if not item_rows.empty:
                                row = item_rows.iloc[0]
                                change = -int(amt) if "Lend" in op else int(amt)
                                desc = f"Lend to {proj}" if "Lend" in op else f"Borrow from {proj}"
                                res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], desc, row['unit'])
                                if res: 
                                    st.toast("Transaction Successful!", icon="🎉")
                                    st.rerun()
                                else: st.error(msg)
                            else: st.error("Item selection invalid. Please refresh.")
                    else:
                        st.info("No stock available.")
                        st.form_submit_button("Submit", disabled=True)

        with c2:
            st.subheader(txt['cww_supply'])
            with st.container(border=True):
                dest = st.selectbox("To Warehouse", LOCATIONS, key="c_wh")
                inv = get_inventory(dest)
                
                with st.form("receive_cww_form"):
                    if not inv.empty:
                        it = st.selectbox("Item Received", inv['name_en'].unique(), key="c_it")
                        amt = st.number_input("Quantity", 1, 10000, key="c_q")
                        if st.form_submit_button("Receive from CWW", use_container_width=True):
                            item_rows = inv[inv['name_en']==it]
                            if not item_rows.empty:
                                row = item_rows.iloc[0]
                                res, msg = update_central_stock(it, dest, amt, st.session_state.user_info['name'], "From CWW", row['unit'])
                                if res: st.success("Done"); st.rerun()
                                else: st.error(msg)
                            else: st.error("Item selection invalid.")
                    else:
                        st.info("No items found.")
                        st.form_submit_button("Submit", disabled=True)
        st.divider()
        loan_logs = run_query("SELECT log_date, item_name, change_amount, location, action_type FROM stock_logs WHERE action_type LIKE '%Lend%' OR action_type LIKE '%Borrow%' ORDER BY log_date DESC")
        if not loan_logs.empty: 
            st.dataframe(loan_logs, width="stretch")
            st.download_button("📥 Export Loan Logs", convert_df_to_excel(loan_logs, "Loans"), "loan_logs.xlsx")

    elif view_option == "⏳ Bulk Review": # Requests
        # Cache this query for 10s to avoid instant flicker but reduce load
        reqs = run_query("SELECT req_id, request_date, region, supervisor_name, item_name, qty, unit, notes FROM requests WHERE status='Pending' ORDER BY region, request_date DESC")

        # Nested fragment to isolate rerun scope
        @st.fragment
        def render_manager_bulk_review(requests_df):
            regions = requests_df['region'].unique()
            region_tabs = st.tabs(list(regions))
            for i, region in enumerate(regions):
                with region_tabs[i]:
                    st.markdown("##### ⚡ Global Actions")
                    bulk_action = st.radio(f"Apply to {region}:", ["Maintain Status", "Approve All", "Reject All"], key=f"bulk_{region}", horizontal=True)
                    reg_df = requests_df[requests_df['region'] == region].copy()
                    if bulk_action == "Approve All": reg_df['Action'] = "Approve"
                    elif bulk_action == "Reject All": reg_df['Action'] = "Reject"
                    else: reg_df['Action'] = "Keep Pending"
                    
                    reg_df['Mgr Qty'] = reg_df['qty']
                    reg_df['Mgr Note'] = reg_df['notes']
                    display_df = reg_df[['req_id', 'item_name', 'supervisor_name', 'qty', 'unit', 'Mgr Qty', 'Mgr Note', 'Action']]
                    
                    with st.form(key=f"mgr_form_{region}"):
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
                        
                        if st.form_submit_button(f"Process Updates for {region}"):
                            batch_cmds = []
                            count_changes = 0
                            
                            # Pre-fetch inventory to avoid queries in loop
                            inv_items = edited_df['item_name'].unique().tolist()
                            if inv_items:
                                stock_data = run_query("SELECT name_en, qty FROM inventory WHERE location='NSTC'")
                                stock_map = {row['name_en']: row['qty'] for _, row in stock_data.iterrows()}
                            else:
                                stock_map = {}

                            for index, row in edited_df.iterrows():
                                rid = row['req_id']
                                action = row['Action']
                                new_q = int(row['Mgr Qty'])
                                new_n = row['Mgr Note']
                                
                                if action == "Approve":
                                    avail = stock_map.get(row['item_name'], 0)
                                    if avail >= new_q:
                                        final_note = f"Manager: {new_n}" if new_n else ""
                                        batch_cmds.append((
                                            "UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id",
                                            {"q":new_q, "n":final_note, "id":rid}
                                        ))
                                        count_changes += 1
                                    else: 
                                        st.toast(f"❌ Low Stock for {row['item_name']}. Skipped.", icon="⚠️")
                                elif action == "Reject":
                                    batch_cmds.append((
                                        "UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id",
                                        {"n":new_n, "id":rid}
                                    ))
                                    count_changes += 1
                            
                            if batch_cmds:
                                if run_batch_action(batch_cmds):
                                    st.success(f"Processed {count_changes} requests!"); time.sleep(1); st.rerun()
                                else:
                                    st.error("Failed to process changes. Please try again.")
    
        if reqs.empty: st.info("No pending requests")
        else: render_manager_bulk_review(reqs)

    elif view_option == txt['local_inv']: # Local Inventory
        st.subheader("📊 Branch Inventory (By Area)")
        # Optimization: Fetch ALL local inventory in one query
        all_local = run_query("SELECT region, item_name, qty, last_updated, updated_by FROM local_inventory ORDER BY region, item_name")
        
        m_tabs = st.tabs(AREAS)
        for i, area in enumerate(AREAS):
            with m_tabs[i]:
                df = all_local[all_local['region'] == area] if not all_local.empty else pd.DataFrame()
                if df.empty:
                    st.info(f"No inventory record for {area}")
                else:
                    st.dataframe(df, width="stretch")
                    st.download_button(f"📥 Export {area} Inv", convert_df_to_excel(df, area), f"{area}_inv.xlsx", key=f"dl_loc_{area}")

    elif view_option == "📜 Logs": # Logs
        logs = run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 500")
        st.dataframe(logs, width="stretch")
        if not logs.empty:
            st.download_button("📥 Export Stock Logs", convert_df_to_excel(logs, "StockLogs"), "stock_logs.xlsx")

# ==========================================
# ============ STOREKEEPER VIEW ============
# ==========================================
@st.fragment
def storekeeper_view():
    st.header(txt['storekeeper_role'])
    st.caption("Manage requests and inventory")
    view_option = st.radio("Navigate", [txt['approved_reqs'], "📋 Issued Today", "NSTC Stock Take", "SNC Stock Take"], horizontal=True, label_visibility="collapsed")
    
    if view_option == txt['approved_reqs']: # Bulk Issue
        # Optimized Query: Select only needed columns
        reqs = run_query("SELECT req_id, region, item_name, qty, unit, notes, status FROM requests WHERE status='Approved'")
        
        @st.fragment
        def render_storekeeper_bulk_issue(reqs_df):
            regions = reqs_df['region'].unique()
            if len(regions) > 0:
                rtabs = st.tabs(list(regions))
                for i, region in enumerate(regions):
                    with rtabs[i]:
                        select_all = st.checkbox(f"Select All ({region})", key=f"sel_all_{region}")
                        sk_df = reqs_df[reqs_df['region'] == region].copy()
                        sk_df['Final Issue Qty'] = sk_df['qty']
                        sk_df['SK Note'] = ""
                        sk_df['Ready to Issue'] = select_all
                        
                        display_sk = sk_df[['req_id', 'item_name', 'qty', 'unit', 'notes', 'Final Issue Qty', 'SK Note', 'Ready to Issue']]
                        
                        with st.form(key=f"sk_form_{region}"):
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
                            if st.form_submit_button(f"Confirm Bulk Issue for {region}"):
                                batch_cmds = []
                                issued_count = 0
                                
                                for index, row in edited_sk.iterrows():
                                    if row['Ready to Issue']:
                                        rid = row['req_id']
                                        iq = int(row['Final Issue Qty'])
                                        sn = row['SK Note']
                                        existing_note = row['notes'] if row['notes'] else ""
                                        final_note = f"{existing_note} | SK: {sn}" if sn else existing_note
                                        item = row['item_name']
                                        unit = row['unit']
                                        
                                        batch_cmds.append((
                                            "UPDATE inventory SET qty = qty - :q, last_updated=NOW() WHERE name_en=:n AND location='NSTC'",
                                            {"q": iq, "n": item}
                                        ))
                                        batch_cmds.append((
                                            "INSERT INTO stock_logs (log_date, action_by, action_type, item_name, location, change_amount, new_qty, unit) VALUES (NOW(), :u, :t, :n, 'NSTC', :c, (SELECT qty FROM inventory WHERE name_en=:n AND location='NSTC') - :q, :un)",
                                            {"n": item, "c": -iq, "u": st.session_state.user_info['name'], "t": f"Issued {region}", "un": unit, "q": iq}
                                        ))
                                        
                                        batch_cmds.append((
                                            "UPDATE requests SET status='Issued', qty=:q, notes=:n WHERE req_id=:id",
                                            {"q":iq, "n":final_note, "id":rid}
                                        ))
                                        issued_count += 1
                                        
                                if issued_count > 0:
                                    if run_batch_action(batch_cmds):
                                        st.success(f"Issued {issued_count} items!"); time.sleep(1); st.rerun()
                                    else:
                                        st.error("Transaction failed.")
        
        if reqs.empty: st.info("No tasks")
        else: render_storekeeper_bulk_issue(reqs)

    elif view_option == "📋 Issued Today": # Issued Today
        st.subheader("📋 Items Issued Today")
        today_log = run_query("""SELECT item_name, qty, unit, region, supervisor_name, notes, request_date FROM requests WHERE status IN ('Issued', 'Received') AND request_date::date = CURRENT_DATE ORDER BY request_date DESC""")
        if today_log.empty: st.info("Nothing issued today yet.")
        else: st.dataframe(today_log, width="stretch")

    elif view_option == "NSTC Stock Take":
        render_bulk_stock_take("NSTC", st.session_state.user_info['name'], "sk")
    elif view_option == "SNC Stock Take":
        render_bulk_stock_take("SNC", st.session_state.user_info['name'], "sk")

# ==========================================
# ============ SUPERVISOR VIEW (WH) ========
# ==========================================
@st.fragment
def supervisor_view_warehouse():
    user = st.session_state.user_info
    # Handle multiple regions
    my_regions = user['region'].split(",") if "," in user['region'] else [user['region']]
    
    st.header(txt['supervisor_role'])
    
    selected_region_wh = st.selectbox("📂 Select Active Region", my_regions, key="sup_wh_reg_sel")
    
    view_option = st.radio("Navigate", [txt['req_form'], "🚚 Ready for Pickup", "⏳ My Pending", txt['local_inv']], horizontal=True, label_visibility="collapsed")
    
    if view_option == txt['req_form']: # Bulk Request
        st.markdown(f"### 🛒 Bulk Order Form ({selected_region_wh})")
        
        inv = get_inventory("NSTC")
        if not inv.empty:
            inv_df = inv[['name_en', 'category', 'unit']].copy() 
            inv_df.rename(columns={'name_en': 'Item Name'}, inplace=True)
            inv_df['Order Qty'] = 0 
            st.info(f"Ordering for: {selected_region_wh}")
            
            @st.fragment
            def render_supervisor_order_form(inv_df):
                with st.form(key=f"order_form_{selected_region_wh}"):
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
                    if st.form_submit_button(txt['send_req']):
                        items_to_order = edited_order[edited_order['Order Qty'] > 0]
                        if items_to_order.empty: st.warning("Please enter quantity for at least one item.")
                        else:
                            batch_cmds = []
                            for index, row in items_to_order.iterrows():
                                batch_cmds.append((
                                    "INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                                    {"s": user['name'], "r": selected_region_wh, "i": row['Item Name'], "c": row['category'], "q": int(row['Order Qty']), "u": row['unit']}
                                ))
                            
                            if run_batch_action(batch_cmds):
                                st.balloons(); st.success(f"Sent {len(items_to_order)} requests for {selected_region_wh}!"); time.sleep(2); st.rerun()
            render_supervisor_order_form(inv_df)

    elif view_option == "🚚 Ready for Pickup": # Ready for Pickup
        # Filter by region as well
        ready = run_query("SELECT req_id, item_name, qty, unit, notes FROM requests WHERE supervisor_name=:s AND status='Issued' AND region=:r", {"s": user['name'], "r": selected_region_wh})
        if ready.empty: st.info(f"No items ready for pickup in {selected_region_wh}.")
        else:
             # Just show the list for this region
            pickup_all = st.checkbox(f"Select All ({selected_region_wh})", key=f"pickup_all_{selected_region_wh}")
            ready_df = ready[['req_id', 'item_name', 'qty', 'unit', 'notes']].copy()
            ready_df['Confirm'] = pickup_all
            
            @st.fragment
            def render_supervisor_pickup_form(ready_df):
                with st.form(key=f"rec_form_{selected_region_wh}"):
                    edited_ready = st.data_editor(
                        ready_df,
                        key=f"ready_editor_{selected_region_wh}",
                        column_config={
                            "req_id": None, "item_name": st.column_config.TextColumn(disabled=True),
                            "Confirm": st.column_config.CheckboxColumn("Received?", default=False)
                        },
                        hide_index=True, width="stretch"
                    )
                    
                    if st.form_submit_button(f"Confirm Receipt for {selected_region_wh}"):
                        batch_cmds = []
                        rec_count = 0
                        
                        for index, row in edited_ready.iterrows():
                            if row['Confirm']:
                                rid = row['req_id']
                                item = row['item_name']
                                qty = int(row['qty'])
                                
                                # 1. Update Request
                                batch_cmds.append(("UPDATE requests SET status='Received' WHERE req_id=:id", {"id":rid}))
                                
                                # 2. Upsert Local Inventory
                                upsert_sql = """
                                INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) 
                                VALUES (:r, :i, :q, NOW(), :u)
                                ON CONFLICT (region, item_name) 
                                DO UPDATE SET qty = local_inventory.qty + :q, last_updated=NOW(), updated_by=:u;
                                """
                                batch_cmds.append((upsert_sql, {"r":selected_region_wh, "i":item, "q":qty, "u":user['name']}))
                                
                                rec_count += 1
                                
                        if rec_count > 0:
                             if run_batch_action(batch_cmds):
                                st.balloons(); st.success(f"Received {rec_count} items."); time.sleep(1); st.rerun()
                             else: st.error("Failed to process receipt.")
            render_supervisor_pickup_form(ready_df)

    elif view_option == "⏳ My Pending": # Edit Pending
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
            
            @st.fragment
            def render_supervisor_pending_edit(pending_df):
                with st.form(key=f"pending_form_{selected_region_wh}"):
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
                    if st.form_submit_button("Apply Changes"):
                        p_changes = 0
                        for index, row in edited_pending.iterrows():
                            rid = row['req_id']
                            if row['Action'] == "Update":
                                update_request_details(rid, int(row['Modify Qty']), None)
                                p_changes += 1
                            elif row['Action'] == "Cancel":
                                delete_request(rid)
                                p_changes += 1
                        if p_changes > 0: st.success(f"Applied changes."); time.sleep(1); st.rerun()
            render_supervisor_pending_edit(pending_df)

    elif view_option == txt['local_inv']: # Local Inventory
        st.info(f"Update Local Inventory for {selected_region_wh}")
        local_inv = run_query("SELECT item_name, qty FROM local_inventory WHERE region=:r AND updated_by=:u", {"r":selected_region_wh, "u":user['name']})
        
        if local_inv.empty:
            st.warning(f"No inventory record found for {selected_region_wh}.")
        else:
            local_inv_df = local_inv.copy()
            local_inv_df.rename(columns={'qty': 'System Count', 'item_name': 'Item Name'}, inplace=True)
            local_inv_df['Physical Count'] = local_inv_df['System Count']
            
            @st.fragment
            def render_supervisor_local_inventory(local_inv_df):
                with st.form(key=f"stock_form_{selected_region_wh}"):
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
                    
                    if st.form_submit_button(f"Update {selected_region_wh} Counts"):
                        up_count = 0
                        for index, row in edited_local.iterrows():
                            sys = int(row['System Count'])
                            phy = int(row['Physical Count'])
                            if sys != phy:
                                update_local_inventory(selected_region_wh, row['Item Name'], phy, user['name'])
                                up_count += 1
                        if up_count > 0: st.success(f"Updated {up_count} items."); time.sleep(1); st.rerun()
                        else: st.info("No changes made.")
            render_supervisor_local_inventory(local_inv_df)
