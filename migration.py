import sqlite3

def migrate():
    conn = sqlite3.connect('comic_studio.db')
    try:
        conn.execute("ALTER TABLE speech_bubbles ADD COLUMN outline_color VARCHAR(20) DEFAULT '#18181b'")
        print("Added outline_color")
    except Exception as e:
        print(e)
    
    try:
        conn.execute("ALTER TABLE speech_bubbles ADD COLUMN outline_width FLOAT DEFAULT 2.5")
        print("Added outline_width")
    except Exception as e:
        print(e)
        
    conn.commit()
    conn.close()

if __name__ == '__main__':
    migrate()
