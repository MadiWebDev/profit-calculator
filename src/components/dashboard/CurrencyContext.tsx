"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

// ── Currency registry ─────────────────────────────────────────────────────────

export interface CurrencyDef {
  code: string;        // ISO 4217 code, e.g. "USD"
  symbol: string;      // e.g. "$"
  name: string;        // e.g. "US Dollar"
  locale: string;      // BCP 47 locale for Intl.NumberFormat
  label: string;       // Display label in selector, e.g. "US Dollar ($)"
}

// All 147 unique currencies in use across 208 countries/territories.
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

  // ─── Territories ───
  { code: "HKD", symbol: "$",    name: "Hong Kong Dollar",       locale: "zh-HK", label: "Hong Kong Dollar ($)" },
  { code: "MOP", symbol: "MOP$", name: "Pataca",                 locale: "zh-MO", label: "Pataca (MOP$)" },
  { code: "KYD", symbol: "$",    name: "Cayman Islands Dollar",  locale: "en-KY", label: "Cayman Islands Dollar ($)" },
  { code: "GIP", symbol: "£",    name: "Gibraltar Pound",        locale: "en-GI", label: "Gibraltar Pound (£)" },
  { code: "XPF", symbol: "₣",    name: "CFP Franc",              locale: "fr-NC", label: "CFP Franc (₣)" },
];
const FALLBACK = CURRENCIES[0]; // USD
const LS_KEY   = "profit_selected_currency";

// ── Context shape ─────────────────────────────────────────────────────────────

export interface CurrencyContextValue {
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /** Symbol string, e.g. "$" */
  symbol: string;
  /** Full definition object */
  currencyDef: CurrencyDef;
  /** Change the active currency — persisted to localStorage */
  setCurrency: (code: string) => void;
}

// Safe default used by createContext (never actually reaches consumers
// that are wrapped in <CurrencyProvider>)
export const CurrencyContext = createContext<CurrencyContextValue>({
  currency:    FALLBACK.code,
  symbol:      FALLBACK.symbol,
  currencyDef: FALLBACK,
  setCurrency: () => {},
});

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCurrencyDef(code: string): CurrencyDef {
  return CURRENCIES.find((c) => c.code === code) ?? FALLBACK;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Always start with the fallback so server and client render identically.
  // We read localStorage only after mount to avoid the SSR/client hydration
  // mismatch that occurs when the lazy useState initialiser runs immediately
  // on the client with a value the server never saw.
  const [currencyCode, setCurrencyCode] = useState<string>(FALLBACK.code);

  // On mount: hydrate from localStorage (client-only, runs after first render)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored) {
        const resolved = getCurrencyDef(stored).code;
        if (resolved !== FALLBACK.code) {
          setCurrencyCode(resolved);
        }
      }
    } catch {
      // Storage may be blocked in private browsing — fail silently
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync to localStorage whenever the user picks a new currency
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, currencyCode);
    } catch {
      // Storage may be blocked in private browsing — fail silently
    }
  }, [currencyCode]);

  const def = getCurrencyDef(currencyCode);

  const setCurrency = (code: string) => {
    const resolved = getCurrencyDef(code).code; // validates & falls back
    setCurrencyCode(resolved);
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency:    def.code,
        symbol:      def.symbol,
        currencyDef: def,
        setCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}
