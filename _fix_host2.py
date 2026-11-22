import pathlib
p = pathlib.Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912\backend\internal\platform\host.go")
s = p.read_text(encoding="utf-8")
old = "\treturn s.host.AppendAudit(actor, action, targetType, targetID, summary, metadata)\n}\n"
new = "\treturn s.host.AppendAudit(actor, action, targetType, targetID, summary, metadata)\n}\n\nfunc (s *Service) desktopLocalChannelsEnabled() bool {\n\tif s == nil || s.host == nil {\n\t\treturn false\n\t}\n\treturn s.host.DesktopLocalChannelsEnabled()\n}\n"
assert s.count(old) == 1
p.write_text(s.replace(old, new), encoding="utf-8", newline="\n")
print("ok")
