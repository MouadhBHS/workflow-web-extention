from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
out=root/'dist';out.mkdir(exist_ok=True)
with ZipFile(out/'workflow-extension.zip','w',ZIP_DEFLATED) as z:
 for name in ['manifest.json','index.html','src','icons']:
  path=root/name
  for f in ([path] if path.is_file() else sorted(path.rglob('*'))):
   if f.is_file():z.write(f,f.relative_to(root))
print(out/'workflow-extension.zip')
