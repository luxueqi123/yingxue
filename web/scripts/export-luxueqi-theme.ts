import { LUXUEQI_TIANYA_SKIN } from "../src/themes/luxueqi-tianya/skin";
import { buildThemeSkinInstallScript } from "./export-theme-skins";

if (import.meta.main) console.log(buildThemeSkinInstallScript([LUXUEQI_TIANYA_SKIN]));
