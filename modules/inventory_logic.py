
import streamlit as st
import pandas as pd
from sqlalchemy import text
from modules.database import run_query, run_action, conn

def get_inventory(location):
    # Optimization: Cache inventory for short duration (10s) to balance freshness and speed
    return run_query("SELECT name_en, category, unit, qty, location, status FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location}, ttl=600)

def update_central_stock(item_name, location, change, user, action_desc, unit):
    change = int(change)
    # Use 0 TTL for writes/checks to ensure consistency
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location}, ttl=0)
    if df.empty: return False, "Item not found"
    current_qty = int(df.iloc[0]['qty'])
    new_qty = current_qty + change
    try:
        with conn.session as s:
            s.execute(text("UPDATE inventory SET qty = :nq WHERE name_en = :name AND location = :loc"), {"nq": new_qty, "name": item_name, "loc": location})
            s.execute(text("INSERT INTO stock_logs (log_date, action_by, action_type, item_name, location, change_amount, new_qty, unit) VALUES (NOW(), :u, :act, :item, :loc, :chg, :nq, :unit)"),
                      {"u": user, "act": action_desc, "item": item_name, "loc": location, "chg": change, "nq": new_qty, "unit": unit})
            s.commit()
            st.cache_data.clear() # Manually clear cache since we used raw session
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
    # Optimizing read-heavy view
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name}, ttl=600)
    return int(df.iloc[0]['qty']) if not df.empty else 0
