
import hashlib
import bcrypt
import streamlit as st
from modules.database import run_query, run_action

def hash_password(password: str) -> str:
    """Hash password using bcrypt with auto-generated salt (secure for passwords)."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def hash_password_sha256(password: str) -> str:
    """Legacy SHA256 hash - for backward compatibility only."""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(stored_password: str, provided_password: str) -> bool:
    """
    Verify password against stored hash.
    Supports: bcrypt (new), SHA256 (legacy), plain text (very old legacy)
    """
    # 1. Try bcrypt first (new secure format - starts with $2b$ or $2a$)
    if stored_password.startswith('$2'):
        try:
            return bcrypt.checkpw(provided_password.encode(), stored_password.encode())
        except Exception:
            return False
    
    # 2. Try SHA256 (legacy - 64 character hex string)
    if len(stored_password) == 64:
        if stored_password == hash_password_sha256(provided_password):
            return True
    
    # 3. Plain text fallback (very old legacy)
    if stored_password == provided_password:
        return True
        
    return False

def login_user(username, password):
    # Optimization: LOGIN should be real-time (ttl=0) to ensure security
    query = """
        SELECT u.*, s.name as shift_name 
        FROM users u 
        LEFT JOIN shifts s ON u.shift_id = s.id 
        WHERE u.username = :u
    """
    df = run_query(query, params={"u": username}, ttl=0)
    
    if df.empty:
        return None
        
    user_record = df.iloc[0].to_dict()
    stored_pass = user_record['password']
    
    if verify_password(stored_pass, password):
        # Optional: Auto-migrate to hash if it was plain text
        if stored_pass != hash_password(password):
            new_hash = hash_password(password)
            run_action("UPDATE users SET password = :p WHERE username = :u", {"p": new_hash, "u": username})
        return user_record
        
    return None

def register_user(username, password, name, region):
    hashed_pw = hash_password(password)
    with st.spinner("Creating account..."):
        # Check existence first to avoid raw SQL error in UI
        if not run_query("SELECT username FROM users WHERE username = :u", {"u": username}, ttl=0).empty:
            return False
            
        return run_action("INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
                          params={"u": username, "p": hashed_pw, "n": name, "r": region})

def update_user_profile_full(old_username, new_username, new_name, new_pass, current_hashed_pass):
    # Check if username changes and if it's taken
    if new_username != old_username:
        if not run_query("SELECT username FROM users WHERE username = :u", params={"u": new_username}, ttl=0).empty:
            return False, "Username taken!"
            
    # Hash the new password if it's different from the current one (which is should be if it's new plain text)
    # However, the UI passes the old hash if empty. We only hash if it's NOT the old hash.
    if new_pass != current_hashed_pass:
        final_pass = hash_password(new_pass)
    else:
        final_pass = current_hashed_pass
    
    success = run_action("UPDATE users SET username = :nu, name = :nn, password = :np WHERE username = :ou",
                       {"nu": new_username, "nn": new_name, "np": final_pass, "ou": old_username})
    return success, "Updated" if success else "Update failed"
