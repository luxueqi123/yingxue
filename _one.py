import io,os,re,subprocess,sys
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
root="."
rel=sys.argv[1]
p=subprocess.run([BUN,"test",rel],cwd=os.path.join(root,"web"),capture_output=True,text=True,encoding="utf-8",errors="replace")
s=(p.stdout or "")+(p.stderr or "")
io.open("_t_out.txt","w",encoding="utf-8").write(s)
print(len(s))
