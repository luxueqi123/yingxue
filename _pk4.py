import subprocess,json
p="backend/internal/protocol/official_catalog_test.go"
d=open(p,"rb").read().decode("utf-8")
i=d.find("provider_data_array_URL")
print("case in disk test:", i>=0)
print(d[max(0,i-1200):i+900] if i>=0 else "")
