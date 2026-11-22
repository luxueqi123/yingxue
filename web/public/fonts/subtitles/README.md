# 字幕导出字体

- 字体：Noto Sans CJK SC Regular，未修改的 OpenType 文件。
- 来源：notofonts/noto-cjk，commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`。
- 原路径：`Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`。
- 许可证：SIL Open Font License 1.1，完整原文见同目录 `OFL.txt`，随部署保留。
- 字体 SHA256：`2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`。
- 大小：16,437,364 bytes；仅烧录字幕时按需从应用同源加载，不进入页面首屏字体或 JS 包。

WASM 文件系统不会自动继承操作系统字体。导出运行时将字体写入临时文件系统，字幕滤镜通过 fontsdir 显式读取；导出后清理。不得改回依赖用户操作系统或外部字体 CDN。
