"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { formatCurrency } from "@/lib/utils";
import { convertCurrency } from "@/lib/profit-engine";
import { currencyForCountry } from "@/lib/country-currency";
import {
  mostCommonCurrency,
  parseFxRatesPayload,
  resolveDisplayCurrency,
} from "@/lib/display-currency";
import {
  parseDetectedCache,
  serializeDetected,
  type DetectedCurrency,
} from "@/lib/geo-detection";

// ── Currency registry ─────────────────────────────────────────────────────────

export interface CurrencyDef {
  code: string;        // ISO 4217 code, e.g. "USD"
  symbol: string;      // e.g. "$"
  name: string;        // e.g. "US Dollar"
  locale: string;      // BCP 47 locale for Intl.NumberFormat
  label: string;       // Display label in selector, e.g. "US Dollar ($)"
}

// All 148 unique currencies in use across 208 countries/territories.
// (Countries sharing a currency — e.g. Eurozone/EUR, West Africa/XOF,
// Central Africa/XAF, East Caribbean/XCD — are collapsed to one entry.)
export const CURRENCIES: CurrencyDef[] = [
  // ─── Africa ───
  { code: "DZD", symbol: "د.ج",  name: "Algerian Dinar",         locale: "ar-DZ", label: "Algerian Dinar (د.ج)" },
  { code: "AOA", symbol: "Kz",   name: "Angolan Kwanza",         locale: "pt-AO", label: "Angolan Kwanza (Kz)" },
  { code: "XOF", symbol: "CFA",  name: "West African CFA Franc", locale: "fr-BJ", label: "West African CFA Franc (CFA)" },
  { code: "BWP", symbol: "P",    name: "Botswana Pula",          locale: "en-BW", label: "Botswana Pula (P)" },
  { code: "BIF", symbol: "FBu",  name: "Burundian Franc",        locale: "fr-BI", label: "Burundian Franc (FBu)" },
  { code: "CVE", symbol: "$",    name: "Cape Verdean Escudo",    locale: "pt-CV", label: "Cape Verdean Escudo ($)" },
  { code: "XAF", symbol: "FCFA", name: "Central African CFA Franc", locale: "fr-CM", label: "Central African CFA Franc (FCFA)" },
  { code: "KMF", symbol: "CF",   name: "Comorian Franc",         locale: "fr-KM", label: "Comorian Franc (CF)" },
  { code: "CDF", symbol: "FC",   name: "Congolese Franc",        locale: "fr-CD", label: "Congolese Franc (FC)" },
  { code: "DJF", symbol: "Fdj",  name: "Djiboutian Franc",       locale: "fr-DJ", label: "Djiboutian Franc (Fdj)" },
  { code: "EGP", symbol: "£",    name: "Egyptian Pound",         locale: "ar-EG", label: "Egyptian Pound (£)" },
  { code: "ERN", symbol: "Nfk",  name: "Nakfa",                  locale: "ti-ER", label: "Nakfa (Nfk)" },
  { code: "SZL", symbol: "L",    name: "Lilangeni",              locale: "en-SZ", label: "Lilangeni (L)" },
  { code: "ETB", symbol: "Br",   name: "Ethiopian Birr",         locale: "am-ET", label: "Ethiopian Birr (Br)" },
  { code: "GMD", symbol: "D",    name: "Dalasi",                 locale: "en-GM", label: "Dalasi (D)" },
  { code: "GHS", symbol: "₵",    name: "Ghanaian Cedi",          locale: "en-GH", label: "Ghanaian Cedi (₵)" },
  { code: "GNF", symbol: "FG",   name: "Guinean Franc",          locale: "fr-GN", label: "Guinean Franc (FG)" },
  { code: "LSL", symbol: "L",    name: "Loti",                   locale: "en-LS", label: "Loti (L)" },
  { code: "LRD", symbol: "$",    name: "Liberian Dollar",        locale: "en-LR", label: "Liberian Dollar ($)" },
  { code: "LYD", symbol: "ل.د",  name: "Libyan Dinar",           locale: "ar-LY", label: "Libyan Dinar (ل.د)" },
  { code: "MGA", symbol: "Ar",   name: "Malagasy Ariary",        locale: "fr-MG", label: "Malagasy Ariary (Ar)" },
  { code: "MWK", symbol: "MK",   name: "Malawian Kwacha",        locale: "en-MW", label: "Malawian Kwacha (MK)" },
  { code: "MRU", symbol: "UM",   name: "Ouguiya",                locale: "ar-MR", label: "Ouguiya (UM)" },
  { code: "MUR", symbol: "₨",    name: "Mauritian Rupee",        locale: "en-MU", label: "Mauritian Rupee (₨)" },
  { code: "MAD", symbol: "د.م.", name: "Moroccan Dirham",        locale: "ar-MA", label: "Moroccan Dirham (د.م.)" },
  { code: "MZN", symbol: "MT",   name: "Mozambican Metical",     locale: "pt-MZ", label: "Mozambican Metical (MT)" },
  { code: "NAD", symbol: "$",    name: "Namibian Dollar",        locale: "en-NA", label: "Namibian Dollar ($)" },
  { code: "NGN", symbol: "₦",    name: "Naira",                  locale: "en-NG", label: "Naira (₦)" },
  { code: "RWF", symbol: "FRw",  name: "Rwandan Franc",          locale: "en-RW", label: "Rwandan Franc (FRw)" },
  { code: "STN", symbol: "Db",   name: "Dobra",                  locale: "pt-ST", label: "Dobra (Db)" },
  { code: "SCR", symbol: "₨",    name: "Seychellois Rupee",      locale: "en-SC", label: "Seychellois Rupee (₨)" },
  { code: "SLE", symbol: "Le",   name: "Leone",                  locale: "en-SL", label: "Leone (Le)" },
  { code: "SOS", symbol: "Sh",   name: "Somali Shilling",        locale: "so-SO", label: "Somali Shilling (Sh)" },
  { code: "ZAR", symbol: "R",    name: "South African Rand",     locale: "en-ZA", label: "South African Rand (R)" },
  { code: "SSP", symbol: "£",    name: "South Sudanese Pound",   locale: "en-SS", label: "South Sudanese Pound (£)" },
  { code: "SDG", symbol: "ج.س.", name: "Sudanese Pound",         locale: "ar-SD", label: "Sudanese Pound (ج.س.)" },
  { code: "TZS", symbol: "TSh",  name: "Tanzanian Shilling",     locale: "en-TZ", label: "Tanzanian Shilling (TSh)" },
  { code: "TND", symbol: "د.ت",  name: "Tunisian Dinar",         locale: "ar-TN", label: "Tunisian Dinar (د.ت)" },
  { code: "UGX", symbol: "USh",  name: "Ugandan Shilling",       locale: "en-UG", label: "Ugandan Shilling (USh)" },
  { code: "ZMW", symbol: "ZK",   name: "Zambian Kwacha",         locale: "en-ZM", label: "Zambian Kwacha (ZK)" },
  { code: "ZWL", symbol: "$",    name: "Zimbabwean Dollar",      locale: "en-ZW", label: "Zimbabwean Dollar ($)" },

  // ─── Americas ───
  { code: "XCD", symbol: "$",    name: "East Caribbean Dollar",  locale: "en-AG", label: "East Caribbean Dollar ($)" },
  { code: "ARS", symbol: "$",    name: "Argentine Peso",         locale: "es-AR", label: "Argentine Peso ($)" },
  { code: "BSD", symbol: "$",    name: "Bahamian Dollar",        locale: "en-BS", label: "Bahamian Dollar ($)" },
  { code: "BBD", symbol: "$",    name: "Barbadian Dollar",       locale: "en-BB", label: "Barbadian Dollar ($)" },
  { code: "BZD", symbol: "$",    name: "Belize Dollar",          locale: "en-BZ", label: "Belize Dollar ($)" },
  { code: "BOB", symbol: "Bs.",  name: "Boliviano",              locale: "es-BO", label: "Boliviano (Bs.)" },
  { code: "BRL", symbol: "R$",   name: "Brazilian Real",         locale: "pt-BR", label: "Brazilian Real (R$)" },
  { code: "CAD", symbol: "CA$",  name: "Canadian Dollar",        locale: "en-CA", label: "Canadian Dollar (CA$)" },
  { code: "CLP", symbol: "$",    name: "Chilean Peso",           locale: "es-CL", label: "Chilean Peso ($)" },
  { code: "COP", symbol: "$",    name: "Colombian Peso",         locale: "es-CO", label: "Colombian Peso ($)" },
  { code: "CRC", symbol: "₡",    name: "Costa Rican Colón",      locale: "es-CR", label: "Costa Rican Colón (₡)" },
  { code: "CUP", symbol: "$",    name: "Cuban Peso",             locale: "es-CU", label: "Cuban Peso ($)" },
  { code: "DOP", symbol: "RD$",  name: "Dominican Peso",         locale: "es-DO", label: "Dominican Peso (RD$)" },
  { code: "USD", symbol: "$",    name: "US Dollar",              locale: "en-US", label: "US Dollar ($)" },
  { code: "GTQ", symbol: "Q",    name: "Quetzal",                locale: "es-GT", label: "Quetzal (Q)" },
  { code: "GYD", symbol: "$",    name: "Guyanese Dollar",        locale: "en-GY", label: "Guyanese Dollar ($)" },
  { code: "HTG", symbol: "G",    name: "Gourde",                 locale: "fr-HT", label: "Gourde (G)" },
  { code: "HNL", symbol: "L",    name: "Lempira",                locale: "es-HN", label: "Lempira (L)" },
  { code: "JMD", symbol: "$",    name: "Jamaican Dollar",        locale: "en-JM", label: "Jamaican Dollar ($)" },
  { code: "MXN", symbol: "$",    name: "Mexican Peso",           locale: "es-MX", label: "Mexican Peso ($)" },
  { code: "NIO", symbol: "C$",   name: "Córdoba",                locale: "es-NI", label: "Córdoba (C$)" },
  { code: "PAB", symbol: "B/.",  name: "Balboa",                 locale: "es-PA", label: "Balboa (B/.)" },
  { code: "PYG", symbol: "₲",    name: "Guarani",                locale: "es-PY", label: "Guarani (₲)" },
  { code: "PEN", symbol: "S/",   name: "Sol",                    locale: "es-PE", label: "Sol (S/)" },
  { code: "SRD", symbol: "$",    name: "Surinamese Dollar",      locale: "nl-SR", label: "Surinamese Dollar ($)" },
  { code: "TTD", symbol: "$",    name: "Trinidad Dollar",        locale: "en-TT", label: "Trinidad Dollar ($)" },
  { code: "UYU", symbol: "$U",   name: "Uruguayan Peso",         locale: "es-UY", label: "Uruguayan Peso ($U)" },
  { code: "VES", symbol: "Bs.S", name: "Bolívar",                locale: "es-VE", label: "Bolívar (Bs.S)" },

  // ─── Asia ───
  { code: "AFN", symbol: "؋",    name: "Afghani",                locale: "fa-AF", label: "Afghani (؋)" },
  { code: "AMD", symbol: "֏",    name: "Dram",                   locale: "hy-AM", label: "Dram (֏)" },
  { code: "AZN", symbol: "₼",    name: "Manat",                  locale: "az-AZ", label: "Manat (₼)" },
  { code: "BHD", symbol: ".د.ب", name: "Bahraini Dinar",         locale: "ar-BH", label: "Bahraini Dinar (.د.ب)" },
  { code: "BDT", symbol: "৳",    name: "Taka",                   locale: "bn-BD", label: "Taka (৳)" },
  { code: "BTN", symbol: "Nu.",  name: "Ngultrum",               locale: "dz-BT", label: "Ngultrum (Nu.)" },
  { code: "BND", symbol: "$",    name: "Brunei Dollar",          locale: "ms-BN", label: "Brunei Dollar ($)" },
  { code: "KHR", symbol: "៛",    name: "Riel",                   locale: "km-KH", label: "Riel (៛)" },
  { code: "CNY", symbol: "¥",    name: "Yuan Renminbi",          locale: "zh-CN", label: "Yuan Renminbi (¥)" },
  { code: "EUR", symbol: "€",    name: "Euro",                   locale: "en-DE", label: "Euro (€)" },
  { code: "GEL", symbol: "₾",    name: "Lari",                   locale: "ka-GE", label: "Lari (₾)" },
  { code: "INR", symbol: "₹",    name: "Indian Rupee",           locale: "en-IN", label: "Indian Rupee (₹)" },
  { code: "IDR", symbol: "Rp",   name: "Rupiah",                 locale: "id-ID", label: "Rupiah (Rp)" },
  { code: "IRR", symbol: "﷼",    name: "Iranian Rial",           locale: "fa-IR", label: "Iranian Rial (﷼)" },
  { code: "IQD", symbol: "ع.د",  name: "Iraqi Dinar",            locale: "ar-IQ", label: "Iraqi Dinar (ع.د)" },
  { code: "ILS", symbol: "₪",    name: "New Shekel",             locale: "he-IL", label: "New Shekel (₪)" },
  { code: "JPY", symbol: "¥",    name: "Yen",                    locale: "ja-JP", label: "Yen (¥)" },
  { code: "JOD", symbol: "د.ا",  name: "Jordanian Dinar",        locale: "ar-JO", label: "Jordanian Dinar (د.ا)" },
  { code: "KZT", symbol: "₸",    name: "Tenge",                  locale: "kk-KZ", label: "Tenge (₸)" },
  { code: "KWD", symbol: "د.ك",  name: "Kuwaiti Dinar",          locale: "ar-KW", label: "Kuwaiti Dinar (د.ك)" },
  { code: "KGS", symbol: "с",    name: "Som",                    locale: "ky-KG", label: "Som (с)" },
  { code: "LAK", symbol: "₭",    name: "Kip",                    locale: "lo-LA", label: "Kip (₭)" },
  { code: "LBP", symbol: "ل.ل",  name: "Lebanese Pound",         locale: "ar-LB", label: "Lebanese Pound (ل.ل)" },
  { code: "MYR", symbol: "RM",   name: "Ringgit",                locale: "ms-MY", label: "Ringgit (RM)" },
  { code: "MVR", symbol: "Rf",   name: "Rufiyaa",                locale: "dv-MV", label: "Rufiyaa (Rf)" },
  { code: "MNT", symbol: "₮",    name: "Tugrik",                 locale: "mn-MN", label: "Tugrik (₮)" },
  { code: "MMK", symbol: "K",    name: "Kyat",                   locale: "my-MM", label: "Kyat (K)" },
  { code: "NPR", symbol: "₨",    name: "Nepalese Rupee",         locale: "ne-NP", label: "Nepalese Rupee (₨)" },
  { code: "KPW", symbol: "₩",    name: "North Korean Won",       locale: "ko-KP", label: "North Korean Won (₩)" },
  { code: "OMR", symbol: "﷼",    name: "Omani Rial",             locale: "ar-OM", label: "Omani Rial (﷼)" },
  { code: "PKR", symbol: "₨",    name: "Pakistani Rupee",        locale: "ur-PK", label: "Pakistani Rupee (₨)" },
  { code: "PHP", symbol: "₱",    name: "Philippine Peso",        locale: "en-PH", label: "Philippine Peso (₱)" },
  { code: "QAR", symbol: "﷼",    name: "Qatari Riyal",           locale: "ar-QA", label: "Qatari Riyal (﷼)" },
  { code: "SAR", symbol: "﷼",    name: "Saudi Riyal",            locale: "ar-SA", label: "Saudi Riyal (﷼)" },
  { code: "SGD", symbol: "$",    name: "Singapore Dollar",       locale: "en-SG", label: "Singapore Dollar ($)" },
  { code: "KRW", symbol: "₩",    name: "Won",                    locale: "ko-KR", label: "Won (₩)" },
  { code: "LKR", symbol: "₨",    name: "Sri Lankan Rupee",       locale: "si-LK", label: "Sri Lankan Rupee (₨)" },
  { code: "SYP", symbol: "£",    name: "Syrian Pound",           locale: "ar-SY", label: "Syrian Pound (£)" },
  { code: "TWD", symbol: "NT$",  name: "New Taiwan Dollar",      locale: "zh-TW", label: "New Taiwan Dollar (NT$)" },
  { code: "TJS", symbol: "ЅМ",   name: "Somoni",                 locale: "tg-TJ", label: "Somoni (ЅМ)" },
  { code: "THB", symbol: "฿",    name: "Baht",                   locale: "th-TH", label: "Baht (฿)" },
  { code: "TRY", symbol: "₺",    name: "Turkish Lira",           locale: "tr-TR", label: "Turkish Lira (₺)" },
  { code: "TMT", symbol: "m",    name: "Manat",                  locale: "tk-TM", label: "Manat (m)" },
  { code: "AED", symbol: "د.إ",  name: "UAE Dirham",             locale: "ar-AE", label: "UAE Dirham (د.إ)" },
  { code: "UZS", symbol: "so'm", name: "Som",                    locale: "uz-UZ", label: "Som (so'm)" },
  { code: "VND", symbol: "₫",    name: "Dong",                   locale: "vi-VN", label: "Dong (₫)" },
  { code: "YER", symbol: "﷼",    name: "Yemeni Rial",            locale: "ar-YE", label: "Yemeni Rial (﷼)" },

  // ─── Europe ───
  { code: "ALL", symbol: "L",    name: "Lek",                    locale: "sq-AL", label: "Lek (L)" },
  { code: "BYN", symbol: "Br",   name: "Belarusian Ruble",       locale: "be-BY", label: "Belarusian Ruble (Br)" },
  { code: "BAM", symbol: "KM",   name: "Convertible Mark",       locale: "bs-BA", label: "Convertible Mark (KM)" },
  { code: "BGN", symbol: "лв",   name: "Bulgarian Lev",          locale: "bg-BG", label: "Bulgarian Lev (лв)" },
  { code: "CZK", symbol: "Kč",   name: "Czech Koruna",           locale: "cs-CZ", label: "Czech Koruna (Kč)" },
  { code: "DKK", symbol: "kr",   name: "Danish Krone",           locale: "da-DK", label: "Danish Krone (kr)" },
  { code: "HUF", symbol: "Ft",   name: "Forint",                 locale: "hu-HU", label: "Forint (Ft)" },
  { code: "ISK", symbol: "kr",   name: "Icelandic Króna",        locale: "is-IS", label: "Icelandic Króna (kr)" },
  { code: "CHF", symbol: "CHF",  name: "Swiss Franc",            locale: "de-CH", label: "Swiss Franc (CHF)" },
  { code: "MDL", symbol: "L",    name: "Moldovan Leu",           locale: "ro-MD", label: "Moldovan Leu (L)" },
  { code: "MKD", symbol: "ден",  name: "Denar",                  locale: "mk-MK", label: "Denar (ден)" },
  { code: "NOK", symbol: "kr",   name: "Norwegian Krone",        locale: "nb-NO", label: "Norwegian Krone (kr)" },
  { code: "PLN", symbol: "zł",   name: "Zloty",                  locale: "pl-PL", label: "Zloty (zł)" },
  { code: "RON", symbol: "lei",  name: "Romanian Leu",           locale: "ro-RO", label: "Romanian Leu (lei)" },
  { code: "RUB", symbol: "₽",    name: "Russian Ruble",          locale: "ru-RU", label: "Russian Ruble (₽)" },
  { code: "RSD", symbol: "дин.", name: "Serbian Dinar",          locale: "sr-RS", label: "Serbian Dinar (дин.)" },
  { code: "SEK", symbol: "kr",   name: "Swedish Krona",          locale: "sv-SE", label: "Swedish Krona (kr)" },
  { code: "UAH", symbol: "₴",    name: "Hryvnia",                locale: "uk-UA", label: "Hryvnia (₴)" },
  { code: "GBP", symbol: "£",    name: "British Pound",          locale: "en-GB", label: "British Pound (£)" },

  // ─── Oceania ───
  { code: "AUD", symbol: "A$",   name: "Australian Dollar",      locale: "en-AU", label: "Australian Dollar (A$)" },
  { code: "FJD", symbol: "$",    name: "Fijian Dollar",          locale: "en-FJ", label: "Fijian Dollar ($)" },
  { code: "WST", symbol: "T",    name: "Tala",                   locale: "sm-WS", label: "Tala (T)" },
  { code: "SBD", symbol: "$",    name: "Solomon Islands Dollar", locale: "en-SB", label: "Solomon Islands Dollar ($)" },
  { code: "TOP", symbol: "T$",   name: "Paʻanga",                locale: "to-TO", label: "Paʻanga (T$)" },
  { code: "VUV", symbol: "VT",   name: "Vatu",                   locale: "bi-VU", label: "Vatu (VT)" },
  { code: "PGK", symbol: "K",    name: "Kina",                   locale: "en-PG", label: "Kina (K)" },
  // Added with the per-user currency build: the registry was missing
  // the New Zealand Dollar (NZ, CK, NU, TK, PN all use it).
  { code: "NZD", symbol: "NZ$",  name: "New Zealand Dollar",     locale: "en-NZ", label: "New Zealand Dollar (NZ$)" },

  // ─── Territories ───
  { code: "HKD", symbol: "$",    name: "Hong Kong Dollar",       locale: "zh-HK", label: "Hong Kong Dollar ($)" },
  { code: "MOP", symbol: "MOP$", name: "Pataca",                 locale: "zh-MO", label: "Pataca (MOP$)" },
  { code: "KYD", symbol: "$",    name: "Cayman Islands Dollar",  locale: "en-KY", label: "Cayman Islands Dollar ($)" },
  { code: "GIP", symbol: "£",    name: "Gibraltar Pound",        locale: "en-GI", label: "Gibraltar Pound (£)" },
  { code: "XPF", symbol: "₣",    name: "CFP Franc",              locale: "fr-NC", label: "CFP Franc (₣)" },
];
const FALLBACK = CURRENCIES[0]; // USD
const LS_KEY   = "profit_selected_currency";
// Auto-detected currency (location / IP), cached separately from the
// explicit choice so a detected default never overwrites a saved one.
const DET_KEY  = "profit_detected_currency";

// The detection result type lives in @/lib/geo-detection (with the
// cache helpers); re-exported here so existing importers keep working.
export type { DetectedCurrency } from "@/lib/geo-detection";

// ── Context shape ─────────────────────────────────────────────────────────────

export interface CurrencyContextValue {
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /** Symbol string, e.g. "$" */
  symbol: string;
  /** Full definition object */
  currencyDef: CurrencyDef;
  /**
   * Change the active currency — SESSION-ONLY view currency, since the
   * onboarding build. It re-renders figures in the picked currency for
   * reference, and nothing is persisted: no PATCH /api/user, no
   * localStorage write. The locked display currency returns on reload
   * or navigation. `opts.persist` is accepted for backward
   * compatibility and ignored. Logged-out visitors get the same
   * in-memory behaviour.
   */
  setCurrency: (code: string, opts?: { persist?: boolean }) => void;
  /**
   * True when the currency currently shown is a session-only view
   * override (picked in the navbar converter) rather than the user's
   * locked display currency.
   */
  viewOnly: boolean;
  /**
   * Forget the explicit choice and re-resolve from the precedence
   * rule (used by Settings after the saved preference is cleared).
   * The next resolution run picks up the team setting / geo / store
   * default. Does not write anything server-side by itself.
   */
  resetCurrencyPreference: () => void;
  /**
   * The auto-detected currency (location / IP), or null when nothing
   * was detected. Shown in Settings so the user can see what their
   * location suggests. Never overwrites a saved preference.
   */
  detectedCurrency: DetectedCurrency | null;
  /**
   * Report base currency: the team's most common store currency (the
   * same rule the server uses when aggregating reports). Money figures
   * arrive in the client in this currency; formatMoney converts FROM
   * it into the display currency. "USD" until the stores list
   * resolves — see the convert() guard for why that is safe.
   */
  baseCurrency: string;
  /** ISO timestamp of the provider data behind the current rates, or null when unknown. */
  ratesAsOf: string | null;
  /** True once a rates table has loaded (refreshed every 60s while open). */
  ratesAvailable: boolean;
  /**
   * True while the first rates load is still outstanding. The converter
   * shows "Loading rates…" instead of "Rates unavailable" in this state,
   * so a signed-in user never sees an error for a fetch that simply
   * hasn't run yet (see the FX effect below).
   */
  ratesLoading: boolean;
  /**
   * Convert between any two currencies at the live rate — the
   * converter widget's engine. Fail-open like convert(): unknown
   * currencies or missing rates return the amount unchanged.
   */
  convertTo: (amount: number, fromCurrency: string, toCurrency: string) => number;
  /**
   * Convert an amount FROM the given currency INTO the display currency
   * using cached FX rates. Returns the amount unchanged when rates are
   * unavailable or the currencies match — never throws in the UI.
   */
  convert: (amount: number, fromCurrency: string) => number;
  /** convert() + formatCurrency() in one step. */
  formatMoney: (amount: number, fromCurrency: string) => string;
}

// Safe default used by createContext (never actually reaches consumers
// that are wrapped in <CurrencyProvider>)
export const CurrencyContext = createContext<CurrencyContextValue>({
  currency:    FALLBACK.code,
  symbol:      FALLBACK.symbol,
  currencyDef: FALLBACK,
  setCurrency: () => {},
  viewOnly: false,
  resetCurrencyPreference: () => {},
  detectedCurrency: null,
  baseCurrency: FALLBACK.code,
  ratesAsOf: null,
  ratesAvailable: false,
  ratesLoading: true,
  convertTo: (amount) => amount,
  convert: (amount) => amount,
  formatMoney: (amount, fromCurrency) => formatCurrency(amount, fromCurrency),
});

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCurrencyDef(code: string): CurrencyDef {
  return CURRENCIES.find((c) => c.code === code) ?? FALLBACK;
}

/**
 * A saved/remote currency code is usable only when it is a real
 * registry currency — stricter than isValidCurrencyCode (shape only),
 * so a stale or hand-edited value can never select a currency the
 * selector does not know. Returns the upper-cased code or null.
 */
export function normalizeSavedCurrency(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const upper = code.toUpperCase().trim();
  return CURRENCIES.some((c) => c.code === upper) ? upper : null;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // The signed-in user's saved preference, from the session (populated
  // by auth.config.ts from the JWT; refreshed by the jwt() backfill in
  // auth.ts). Null until the session loads, or when the user never set
  // a preference.
  const { data: session, status } = useSession();
  const sessionPref = normalizeSavedCurrency(session?.user?.displayCurrency);

  // Always start with the fallback so server and client render identically.
  // We read localStorage only after mount to avoid the SSR/client hydration
  // mismatch that occurs when the lazy useState initialiser runs immediately
  // on the client with a value the server never saw.
  const [currencyCode, setCurrencyCode] = useState<string>(FALLBACK.code);

  // Session-only VIEW currency (navbar converter, since the onboarding
  // build): an in-memory override that re-renders figures for reference.
  // It is never persisted (no PATCH, no localStorage) and never touches
  // the locked display currency — a reload or navigation drops it and
  // the locked currency returns. Null = show the resolved currency.
  const [viewCurrency, setViewCurrency] = useState<string | null>(null);

  // Report base currency: the team's most common active store currency
  // (the same rule the server uses when aggregating reports, see
  // getReportBaseCurrency). "USD" until the stores list resolves.
  // baseLoaded stays false until that fetch SUCCEEDS, so convert()
  // never converts from a guessed base (see the guard there).
  const [baseCurrency, setBaseCurrency] = useState<string>(FALLBACK.code);
  const [baseLoaded, setBaseLoaded] = useState(false);

  // ISO timestamp of the provider data behind the current rates —
  // the "Rates as of HH:MM" stamp. Null until the first rates load.
  const [ratesAsOf, setRatesAsOf] = useState<string | null>(null);

  // The precedence sources, each resolved independently (null until
  // its fetch/storage read settles). The single resolution effect
  // below combines them with resolveDisplayCurrency:
  //   user (session) > team workspace > browser (localStorage)
  //   > geo-detected > store/base > USD.
  const [serverCurrency, setServerCurrency] = useState<string | null>(null);
  const [serverResolved, setServerResolved] = useState(false);
  const [storedChoice, setStoredChoice] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedCurrency | null>(null);

  // Bumps to force the resolution effect to re-run (refs don't trigger
  // renders) — used by resetCurrencyPreference after a cleared save.
  const [resolutionTick, setResolutionTick] = useState(0);

  // Geo lookup attempted at most once per mount.
  const geoTriedRef = useRef(false);
  // An expired cached detection, kept only as a fail-open fallback
  // when the re-fetch fails — it must never satisfy the geo effect's
  // guard, or the re-fetch would never run (see geo-detection.ts).
  const staleDetectedRef = useRef<DetectedCurrency | null>(null);

  // On mount: hydrate the browser choices from localStorage
  // (client-only, runs after first render). The explicit choice goes
  // to storedChoice (a resolution source, not the final currency —
  // the resolution effect decides); a cached detection goes to
  // `detected` only while it is fresh (24 h TTL — see
  // geo-detection.ts), so repeat visits don't re-fetch the geo
  // endpoint. An expired (or pre-TTL, untimestamped) detection is
  // kept only as the fallback for a failed re-fetch — it must not
  // satisfy the geo effect's guard, or the re-fetch would never run.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      const storedCode = stored ? normalizeSavedCurrency(stored) : null;
      if (storedCode) {
        // One-time mount hydration, not a render cascade.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStoredChoice(storedCode);
      }
      const { fresh, stale } = parseDetectedCache(window.localStorage.getItem(DET_KEY));
      if (fresh && normalizeSavedCurrency(fresh.code)) {
        setDetected(fresh);
      } else if (stale && normalizeSavedCurrency(stale.code)) {
        staleDetectedRef.current = stale;
      }
    } catch {
      // Storage may be blocked in private browsing — fail silently
    }
  }, []);

  // On mount AND whenever the auth state changes: hydrate the display
  // currency from the team's saved workspace settings — the team
  // default for members who never picked a personal currency.
  //
  // Auth-state matters: this provider lives in the root layout, so it
  // does NOT remount on the client-side login navigation. A mount-only
  // fetch runs while the user is still signed out (401), marks the
  // team value "settled", and never re-runs after sign-in — so a team
  // that DID set a display currency would keep showing the
  // auto-detected one (the workspace value was never fetched). Hence
  // the fetch is keyed on `status`: it runs when the session becomes
  // authenticated, and resets when it is definitely logged out.
  // A 401 (signed out) or network failure leaves the other sources
  // to resolve; serverResolved still flips so the geo effect knows
  // the team value is settled.
  useEffect(() => {
    if (status === "unauthenticated") {
      // Definitely signed out: no team setting exists for this viewer,
      // and a stale one must not survive the sign-out. One-time
      // auth-state reset, not a render cascade.
      /* eslint-disable react-hooks/set-state-in-effect -- auth-state reset: clear the team currency when the session ends. */
      setServerCurrency(null);
      setServerResolved(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    if (status !== "authenticated") return; // still loading — keep the last value
    let cancelled = false;
    fetch("/api/settings/workspace")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        setServerCurrency(normalizeSavedCurrency(j?.settings?.displayCurrency));
      })
      .catch(() => {
        // Network failure — other sources resolve
      })
      .finally(() => {
        if (!cancelled) setServerResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // On mount: resolve the report base currency from the team's active
  // stores (most common store currency, USD when there is none).
  // A 401 (signed out) or network failure leaves baseLoaded false,
  // which keeps convert() fail-open rather than guessing.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const stores = Array.isArray(j?.stores) ? j.stores : null;
        if (!stores) return;
        setBaseCurrency(mostCommonCurrency(stores.map((s: { currency?: string }) => s?.currency)));
        setBaseLoaded(true);
      })
      .catch(() => {
        // Stores unknown — convert() stays fail-open
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The single resolution point: whenever any source settles, pick the
  // highest-precedence usable one. This resolves the LOCKED display
  // currency only — a session-only view override (viewCurrency) lives
  // outside this effect and is never overwritten by it. The reporting
  // currency is only passed once the stores list has loaded, so a "USD"
  // guess never short-circuits geo detection.
  useEffect(() => {
    const resolved = resolveDisplayCurrency({
      user: sessionPref,
      server: serverCurrency,
      stored: storedChoice,
      geo: detected?.code ?? null,
      reportingCurrency: baseLoaded ? baseCurrency : null,
    });
    // One-time resolution (not a render cascade): a state is the only
    // way to hand the resolved currency to every consumer at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resolved !== currencyCode) setCurrencyCode(resolved);
  }, [sessionPref, serverCurrency, storedChoice, detected, baseCurrency, baseLoaded, currencyCode, resolutionTick]);

  // Location auto-detect — runs only when nothing higher exists and
  // the team value is settled. Never overwrites a saved preference, a
  // team setting, or a browser choice: the guard below skips it
  // entirely in those cases. Server first (Vercel country header via
  // /api/geo/currency), browser-language region as the fallback.
  //
  // "Settled" is auth-aware: a signed-out visitor has no team to wait
  // for, so detection runs at once (it is the right default for them);
  // a signed-in user waits for the workspace fetch, so a team setting
  // (when one exists) is never beaten by a detection that fired while
  // the fetch was still in flight.
  useEffect(() => {
    const teamSettled = status !== "authenticated" || serverResolved;
    if (
      !teamSettled ||
      sessionPref || serverCurrency || storedChoice || detected ||
      geoTriedRef.current
    ) {
      return;
    }
    geoTriedRef.current = true;
    let cancelled = false;
    const cacheAndSet = (d: DetectedCurrency) => {
      try {
        window.localStorage.setItem(DET_KEY, serializeDetected(d));
      } catch {
        // Storage may be blocked — the in-memory value still applies
      }
      if (!cancelled) setDetected(d);
    };
    // A failed re-fetch falls back to the expired detection (a real
    // earlier Vercel result beats a language guess or nothing) — the
    // stored entry keeps its old timestamp, so the next visit still
    // retries the endpoint.
    const applyStaleFallback = () => {
      const stale = staleDetectedRef.current;
      if (!stale) return false;
      setDetected(stale);
      return true;
    };
    const languageFallback = () => {
      try {
        const region = (window.navigator.language || "").split("-")[1]?.toUpperCase() ?? "";
        const code = region ? currencyForCountry(region) : null;
        if (code) cacheAndSet({ code, country: region || null, source: "language" });
      } catch {
        // No detection — fall through to base/USD
      }
    };
    fetch("/api/geo/currency")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const code = normalizeSavedCurrency(j?.currency);
        if (code) {
          cacheAndSet({
            code,
            country: typeof j?.country === "string" ? j.country.toUpperCase() : null,
            source: "vercel-geo",
          });
          return;
        }
        if (!applyStaleFallback()) languageFallback();
      })
      .catch(() => {
        if (cancelled) return;
        if (!applyStaleFallback()) languageFallback();
      });
    return () => {
      cancelled = true;
    };
  }, [status, serverResolved, sessionPref, serverCurrency, storedChoice, detected]);

  const def = getCurrencyDef(viewCurrency ?? currencyCode);

  // Session-only view-currency pick (navbar converter). Sets the
  // in-memory override and nothing else: the display currency is
  // LOCKED after onboarding, so this must never PATCH /api/user and
  // never write localStorage — a persisted pick would survive a reload
  // and look like a changed preference. opts.persist is ignored.
  const setCurrency = (code: string) => {
    const resolved = getCurrencyDef(code).code; // validates & falls back
    setViewCurrency(resolved);
  };

  // Clear the view override (and the legacy stored browser choice, so
  // a pre-lock localStorage value cannot keep beating detection) and
  // re-resolve from the precedence rule. Writes nothing server-side.
  const resetCurrencyPreference = useCallback(() => {
    setViewCurrency(null);
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      // Storage may be blocked — the in-memory clear still applies
    }
    setStoredChoice(null);
    setResolutionTick((t) => t + 1);
  }, []);

  // FX rates for display conversion — re-fetched every 60 seconds while
  // the dashboard is open, matching /api/fx/rates' browser cache (60s),
  // so display conversion tracks live rates without a page reload.
  // Missing rates = no conversion. The provider's fetchedAt timestamp
  // is kept alongside the rates for the "Rates as of" stamp.
  //
  // Auth-aware (this provider lives in the root layout, so it does NOT
  // remount on the client-side login navigation): a mount-only fetch
  // runs while the user is still signed out, /api/fx/rates requires
  // auth so it 401s, rates stay null — and the effect never re-runs
  // after sign-in, so the converter shows "Rates unavailable" on first
  // load until the 60s tick happens to fire. The fetch is therefore
  // keyed on `status`: it runs the moment the session becomes
  // authenticated, never while signed out, and a failed first load
  // retries a few times at 5s instead of waiting a full minute.
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const fxRetryRef = useRef(0);
  useEffect(() => {
    if (status === "unauthenticated") {
      // Definitely signed out: /api/fx/rates would 401. Stop claiming
      // "loading" so the converter shows the honest "unavailable" state.
      /* eslint-disable react-hooks/set-state-in-effect -- auth-state reset: rates are not loading when there is no session to fetch them with. */
      setRatesLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    if (status !== "authenticated") return; // still loading — keep waiting
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    fxRetryRef.current = 0;
    const scheduleRetry = () => {
      if (cancelled || fxRetryRef.current >= 3) {
        if (!cancelled) setRatesLoading(false);
        return;
      }
      fxRetryRef.current += 1;
      retryTimer = setTimeout(() => {
        if (!cancelled) load();
      }, 5_000);
    };
    const load = () => {
      fetch("/api/fx/rates?base=USD")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled) return;
          const parsed = parseFxRatesPayload(j);
          if (parsed) {
            setFxRates(parsed.rates);
            setRatesAsOf(parsed.fetchedAt);
            fxRetryRef.current = 0;
            setRatesLoading(false);
          } else {
            // No usable payload — retry briefly, then give up honestly.
            scheduleRetry();
          }
        })
        .catch(() => {
          // Rates unavailable — retry briefly, then amounts render
          // unconverted (documented fallback).
          if (!cancelled) scheduleRetry();
        });
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [status]);

  const convert = useCallback(
    (amount: number, fromCurrency: string): number => {
      if (!fxRates) return amount;
      // The base currency is still a guess (stores list unresolved):
      // never convert FROM it — a "USD" guess for a PKR team would
      // inflate every figure ~278x. Showing the raw figure in the
      // display currency until the base resolves is the least wrong
      // rendering, and identical to the final one when display == base.
      if (!baseLoaded && fromCurrency.toUpperCase().trim() === baseCurrency) return amount;
      try {
        return convertCurrency(amount, fromCurrency, def.code, fxRates);
      } catch {
        return amount;
      }
    },
    [fxRates, def.code, baseCurrency, baseLoaded]
  );

  // Convert between any two currencies at the live rate — the
  // converter widget's engine. Fail-open like convert().
  const convertTo = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string): number => {
      if (!fxRates) return amount;
      try {
        return convertCurrency(amount, fromCurrency, toCurrency, fxRates);
      } catch {
        return amount;
      }
    },
    [fxRates]
  );

  const formatMoney = useCallback(
    (amount: number, fromCurrency: string): string =>
      formatCurrency(convert(amount, fromCurrency), def.code),
    [convert, def.code]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency:    def.code,
        symbol:      def.symbol,
        currencyDef: def,
        setCurrency,
        viewOnly:    viewCurrency !== null,
        resetCurrencyPreference,
        detectedCurrency: detected,
        baseCurrency,
        ratesAsOf,
        ratesAvailable: fxRates !== null,
        ratesLoading,
        convertTo,
        convert,
        formatMoney,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}
