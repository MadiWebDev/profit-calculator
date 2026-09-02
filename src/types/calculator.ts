export type FieldType = "number" | "percent" | "currency" | "select";

export interface CalculatorField {
  name: string;
  label: string;
  type: FieldType;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  helpText?: string;
  /** If type is "select", provide options */
  options?: { value: string; label: string }[];
  /** Group fields visually */
  group?: string;
}

export interface OutputField {
  key: string;
  label: string;
  format: "currency" | "percent" | "number" | "multiplier";
  highlight?: boolean; // show as primary metric
  description?: string;
}

export interface SeoContent {
  intro: string;
  howToSteps: string[];
  faqs: { q: string; a: string }[];
  formula?: string;
  workedExample?: string;
}

export interface CalculatorConfig {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  icon: string; // emoji or icon name
  category: "ecommerce" | "advertising" | "freelance" | "general";
  fields: CalculatorField[];
  outputs: OutputField[];
  compute: (values: Record<string, number>) => Record<string, number>;
  chartKeys?: string[]; // which output keys to show in chart
  seoContent: SeoContent;
  relatedSlugs?: string[];
}
