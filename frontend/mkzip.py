import zipfile, os
root=r"C:\Users\shenshen\WorkBuddy AI\2026-11-03-19-48-08\aniverse\frontend"
out=r"C:\Users\shenshen\WorkBuddy AI\2026-11-03-19-48-08\aniverse\aniverse-release.zip"
items=["dist","server","package.json",".env","README.md","start.py"]
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
    for it in items:
        p=os.path.join(root,it)
        if os.path.isfile(p): z.write(p,it)
        else:
            for dirpath,_,files in os.walk(p):
                for f in files:
                    full=os.path.join(dirpath,f)
                    z.write(full, os.path.relpath(full, root).replace("\\","/"))
print("zip ok", round(os.path.getsize(out)/1024/1024,1), "MB")
