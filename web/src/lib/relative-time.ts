import { currentLocale, translate } from "@/i18n";
import { interfaceTranslator, type InterfaceLocale } from "@/lib/interface-locale";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toTimestamp(value: string | number | Date | undefined | null) {
    if (value === undefined || value === null || value === "") return Number.NaN;
    return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}

/** 1 分钟内为「刚刚」，7 天内为「N 分钟/小时/天前」，同年显示「M月D日」，跨年显示「YYYY年M月D日」。 */
export function formatRelativeTime(value: string | number | Date | undefined | null, now: number = Date.now(), locale: InterfaceLocale = currentLocale()) {
    const timestamp = toTimestamp(value);
    if (!Number.isFinite(timestamp)) return interfaceTranslator(locale)("createUiTimeUnknown");
    const elapsed = Math.max(0, now - timestamp);
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (elapsed < MINUTE) return relative.format(0, "second");
    if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
    if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
    if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day");
    const date = new Date(timestamp);
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return date.toLocaleDateString(locale, sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" });
}

/** 绝对时间：YYYY/MM/DD HH:mm，用于 title / tooltip。 */
export function formatAbsoluteDateTime(value: string | number | Date | undefined | null, locale: InterfaceLocale = currentLocale()) {
    const timestamp = toTimestamp(value);
    if (!Number.isFinite(timestamp)) return interfaceTranslator(locale)("createUiTimeUnknown");
    return new Date(timestamp).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
