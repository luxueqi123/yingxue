import pathlib
p = pathlib.Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912\backend\internal\platform\feature_availability.go")
s = p.read_text(encoding="utf-8")
subs = [
 ("type PublicFeatureAvailability struct {\n\tFeatureAvailability\n\tConfigured bool      `json:\"configured\"`\n\tUpdatedBy  string    `json:\"updatedBy,omitempty\"`\n\tUpdatedAt  time.Time `json:\"updatedAt,omitempty\"`\n}",
  "type PublicFeatureAvailability struct {\n\tFeatureAvailability\n\tDesktopLocalChannelsEnabled bool      `json:\"desktopLocalChannelsEnabled\"`\n\tConfigured                  bool      `json:\"configured\"`\n\tUpdatedBy                   string    `json:\"updatedBy,omitempty\"`\n\tUpdatedAt                   time.Time `json:\"updatedAt,omitempty\"`\n}", 1),
 ("\treturn publicFeatureAvailability(setting, value), nil\n}\n\nfunc (s *Service) AdminFeatureAvailability",
  "\treturn s.withRuntimeCapabilities(publicFeatureAvailability(setting, value)), nil\n}\n\nfunc (s *Service) AdminFeatureAvailability", 1),
 ("\treturn publicFeatureAvailability(&setting, value), nil\n}\n",
  "\treturn s.withRuntimeCapabilities(publicFeatureAvailability(&setting, value)), nil\n}\n", 1),
 ("func publicFeatureAvailability(setting *model.SystemSetting, value FeatureAvailability) *PublicFeatureAvailability {",
  "func (s *Service) withRuntimeCapabilities(result *PublicFeatureAvailability) *PublicFeatureAvailability {\n\tif result != nil {\n\t\tresult.DesktopLocalChannelsEnabled = s.desktopLocalChannelsEnabled()\n\t}\n\treturn result\n}\n\nfunc publicFeatureAvailability(setting *model.SystemSetting, value FeatureAvailability) *PublicFeatureAvailability {", 1),
]
for old, new, cnt in subs:
    c = s.count(old)
    assert c == cnt, (repr(old[:70]), c, cnt)
    s = s.replace(old, new)
p.write_text(s, encoding="utf-8", newline="\n")
print("ok")
