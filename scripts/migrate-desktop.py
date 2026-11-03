"""Read a COPY of the desktop SQLite database and export an extension backup.
Usage: python migrate-desktop.py tempo.sqlite3 workflow-backup.json
Uses Python standard library only. Never writes to the desktop database.
"""
import sqlite3,json,sys
from pathlib import Path
if len(sys.argv)!=3:raise SystemExit(__doc__)
source=Path(sys.argv[1]).resolve()
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as db:
 db.row_factory=sqlite3.Row
 entries=[dict(r) for r in db.execute('SELECT id,category,note,start_ms,end_ms FROM entries ORDER BY start_ms')]
 prefs={}
 try:prefs=dict(db.execute('SELECT key,value FROM preferences'))
 except sqlite3.OperationalError:pass
 styles={key:{field:prefs[f'category.{key}.{field}'] for field in ['color','icon'] if f'category.{key}.{field}' in prefs} for key in ['professional','personal','adhd']}
 result={'version':1,'entries':entries,'styles':styles,'preferences':{'opacity':int(prefs.get('opacity',97)),'reminders_enabled':False,'cooldown_minutes':int(prefs.get('cooldown_minutes',15))}}
Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Exported {len(entries)} entries. Import this JSON from Workflow Settings. Original database unchanged.')
