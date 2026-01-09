
import streamlit as st
import time
from modules.database import run_query, run_action, run_batch_action
from modules.config import TEXT as txt, CATS_EN, LOCATIONS, EXTERNAL_PROJECTS, AREAS
from modules.utils import convert_df_to_excel
from modules.inventory_logic import (
    get_inventory, update_central_stock, get_local_inventory_by_item, 
    update_local_inventory, update_request_details, delete_request
)
from modules.views.common import render_bulk_stock_take

# ==========================================
# ============ MANAGER VIEW (WH) ===========
# ==========================================
def manager_view_warehouse():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock Management", txt['ext_tab'], "⏳ Bulk Review", txt['local_inv'], "📜 Logs"])
    
    with tab1: # Stock
        with st.expander(txt['create_item_title'], expanded=False):
            with st.form("create_item_form", clear_on_submit=True):
                c1, c2, c3, c4 = st.columns(4)
                n = c1.text_input("Name")
                c = c2.selectbox("Category", CATS_EN)
                l = c3.selectbox("Location", LOCATIONS)
                q = c4.number_input("Qty", 0, 10000)
                u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
                if st.form_submit_button(txt['create_btn'], use_container_width=True):
                    if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}, ttl=0).empty:
                        run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                                  {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                        st.toast("Item Added Successfully!", icon="📦")
                        st.cache_data.clear(); st.rerun()
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
                                    st.cache_data.clear(); st.rerun()
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
                                if res: st.success("Done"); st.cache_data.clear(); st.rerun()
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

    with tab4: # Local Inventory
        st.subheader("📊 Branch Inventory (By Area)")
        m_tabs = st.tabs(AREAS)
        for i, area in enumerate(AREAS):
            with m_tabs[i]:
                df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r ORDER BY item_name", {"r":area})
                if df.empty:
                    st.info(f"No inventory record for {area}")
                else:
                    st.dataframe(df, width="stretch")
                    st.download_button(f"📥 Export {area} Inv", convert_df_to_excel(df, area), f"{area}_inv.xlsx", key=f"dl_loc_{area}")

    with tab5: # Logs
        logs = run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 500")
        st.dataframe(logs, width="stretch")
        if not logs.empty:
            st.download_button("📥 Export Stock Logs", convert_df_to_excel(logs, "StockLogs"), "stock_logs.xlsx")

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
    
    selected_region_wh = st.selectbox("📂 Select Active Region", my_regions, key="sup_wh_reg_sel")
    
    t1, t2, t3, t4 = st.tabs([txt['req_form'], "🚚 Ready for Pickup", "⏳ My Pending", txt['local_inv']])
    
    with t1: # Bulk Request
        st.markdown(f"### 🛒 Bulk Order Form ({selected_region_wh})")
        
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
                    batch_cmds = []
                    for index, row in items_to_order.iterrows():
                        batch_cmds.append((
                            "INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                            {"s": user['name'], "r": selected_region_wh, "i": row['Item Name'], "c": row['category'], "q": int(row['Order Qty']), "u": row['unit']}
                        ))
                    
                    if run_batch_action(batch_cmds):
                        st.balloons(); st.success(f"Sent {len(items_to_order)} requests for {selected_region_wh}!"); st.cache_data.clear(); time.sleep(2); st.rerun()

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
                        # update_request(rid, int(row['Modify Qty'])) # This function was missing in original context but update_request_details exists.
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
