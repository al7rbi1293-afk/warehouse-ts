
import sys
import os

# Add the project root to the path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from modules.database import run_action

def migrate_db():
    print("Starting migration NTCC -> NSTC...")
    try:
        # Update Inventory
        res1 = run_action("UPDATE inventory SET location = 'NSTC' WHERE location = 'NTCC'")
        if res1: print("Updated inventory location.")
        else: print("Failed or no changes in inventory.")

        # Update Stock Logs
        res2 = run_action("UPDATE stock_logs SET location = 'NSTC' WHERE location = 'NTCC'")
        if res2: print("Updated stock_logs location.")
        else: print("Failed or no changes in stock_logs.")
        
        print("Migration complete.")
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate_db()
