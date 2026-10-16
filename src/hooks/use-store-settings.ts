"use client";

import { useState } from "react";

interface StoreSettings {
  socialMedia?: {
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  storeName?: string;
  currency?: string;
}

const defaultSettings: StoreSettings = {
  socialMedia: {},
  storeName: "",
  currency: "USD",
};

export function useStoreSettings() {
  const [settings] = useState<StoreSettings>(defaultSettings);
  return { settings };
}
