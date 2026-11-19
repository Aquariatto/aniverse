import zipfile, os
root=r"C:\Users\shenshen\WorkBuddy AI\2026-11-03-19-48-08\aniverse\frontend"
out=r"C:\Users\shenshen\WorkBuddy AI\2026-11-03-19-48-08\aniverse\aniverse-release.zip"
# 运行所需
items=["dist","server","package.json",".env","README.md","start.py"]
# 作业提交需要的前端交互代码与配置
source=["src","index.html","vite.config.ts","tsconfig.json","scripts/build-images.py"]
# 随包分发的文档：(源路径, 包内路径)
extra=[(os.path.join(root,"..","AniVerse-说明文档.txt"),"AniVerse-说明文档.txt"),
       (os.path.join(root,"..","AniVerse-应用层接口说明.md"),"AniVerse-应用层接口说明.md"),
       (os.path.join(root,"..","AniVerse-应用层接口说明.docx"),"AniVerse-应用层接口说明.docx")]
if os.path.exists(out): os.remove(out)
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for it in items+source:
        p=os.path.join(root,it)
        if not os.path.exists(p):
            print("跳过（不存在）:", it); continue
        if os.path.isfile(p): z.write(p,it)
        else:
            for dirpath,_,files in os.walk(p):
                for f in files:
                    full=os.path.join(dirpath,f)
                    z.write(full, os.path.relpath(full, root).replace("\\","/"))
    for src,arc in extra:
        if os.path.isfile(src): z.write(src,arc)
        else: print("跳过（不存在）:", arc)
print("zip", round(os.path.getsize(out)/1024/1024,1), "MB")
