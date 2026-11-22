import io,os,re,subprocess,sys
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
p=subprocess.run([BUN,"test","test/kling-native-execution.test.ts"],cwd="web",capture_output=True,text=True,encoding="utf-8",errors="replace")
s=(p.stdout or "")+(p.stderr or "")
io.open("_t_kling.txt","w",encoding="utf-8").write(s)
print(s[:6000])
