// Localised SEO landing pages: the 5 core topics plus a locale home page,
// under /{locale}/{slug} — the same URL pattern as the competitor sitemap.
// Each locale carries fully translated page copy (title, description, hero,
// intro, features, steps, FAQs, CTAs). Copy is kept to short, simple
// sentences so translations stay accurate; a native-speaker review of brand
// voice is still recommended before paid campaigns point at these pages.
// No prices are asserted anywhere in this file.

export interface LocaleText {
  title: string;
  desc: string;
}

export interface LocalePageCopy {
  title: string;
  description: string;
  h1: string;
  intro: string;
}

export interface LocaleDict {
  name: string;
  ogLocale: string;
  eyebrow: string;
  breadcrumbHome: string;
  featuresHeading: string;
  stepsHeading: string;
  faqHeading: string;
  relatedHeading: string;
  ctaTitle: string;
  ctaText: string;
  ctaPrimary: string;
  ctaSecondary: string;
  home: LocalePageCopy;
  features: LocaleText[];
  steps: LocaleText[];
  faqs: { q: string; a: string }[];
  pages: Record<string, LocalePageCopy>;
}

export interface Locale {
  code: string;
  dict: LocaleDict;
}

export const CORE_LOCALE_SLUGS = [
  "shopify-profit-calculator",
  "shopify-profit-analytics",
  "shopify-cogs-tracker",
  "shopify-profit-and-loss-report",
  "shopify-ad-spend-profit-tracker",
];

export function getLocale(code: string): Locale | undefined {
  return LOCALES.find((l) => l.code === code);
}

export function getLocalePage(code: string, slug: string): LocalePageCopy | undefined {
  return getLocale(code)?.dict.pages[slug];
}

export const LOCALES: Locale[] = [
  {
    code: "es",
    dict: {
      name: "Español",
      ogLocale: "es_ES",
      eyebrow: "Seguimiento de beneficios para Shopify",
      breadcrumbHome: "Inicio",
      featuresHeading: "Qué incluye GetProfitCalc",
      stepsHeading: "Cómo funciona",
      faqHeading: "Preguntas frecuentes",
      relatedHeading: "Páginas relacionadas",
      ctaTitle: "Conoce tu beneficio real, no solo tus ingresos",
      ctaText: "Conecta Shopify y consulta el beneficio por pedido con todos los costes incluidos.",
      ctaPrimary: "Empezar gratis",
      ctaSecondary: "Ver precios",
      home: {
        title: "GetProfitCalc — Beneficio real para Shopify",
        description: "Calcula tu beneficio real en Shopify: ingresos menos COGS, comisiones, envío, descuentos, devoluciones y publicidad, por pedido y por producto.",
        h1: "Tu beneficio real en Shopify, sin hojas de cálculo",
        intro: "Shopify muestra tus ingresos, pero no tu beneficio. GetProfitCalc sincroniza tus pedidos y descuenta todos los costes, para que veas lo que realmente ganaste en cada pedido y cada producto.",
      },
      features: [
        { title: "Beneficio por pedido y producto", desc: "Cada pedido muestra ingresos menos todos los costes, y los totales son la suma de los pedidos." },
        { title: "Todos los costes incluidos", desc: "COGS, envío, comisiones, descuentos, devoluciones y publicidad se descuentan antes del resultado." },
        { title: "Beneficio después de publicidad", desc: "El gasto en Meta, Google y TikTok se atribuye a los pedidos que generó." },
        { title: "Informes programados", desc: "Informes semanales y mensuales en PDF o CSV, listos para enviar a socios o contables." },
      ],
      steps: [
        { title: "Conecta Shopify", desc: "Conecta tu tienda con OAuth. Los pedidos se sincronizan automáticamente." },
        { title: "Añade tus costes reales", desc: "Define el COGS, el envío y las comisiones una vez. El historial se importa por CSV." },
        { title: "Consulta tu beneficio real", desc: "Cada pedido muestra lo que conservaste después de todos los costes." },
      ],
      faqs: [
        { q: "¿Cómo se calcula el beneficio neto real?", a: "Ingresos menos COGS, envío, comisiones, descuentos, devoluciones y publicidad asignada, por pedido. Los totales son la suma del beneficio por pedido." },
        { q: "¿Necesito una tarjeta para probar GetProfitCalc?", a: "No. Puedes crear una cuenta y conectar tu tienda primero; consulta la página de precios para ver los planes actuales." },
        { q: "¿Funciona solo con Shopify?", a: "La sincronización en vivo es solo para Shopify por diseño. Otras plataformas pueden importar pedidos históricos por CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Calculadora de beneficios Shopify — Beneficio neto real por pedido",
          description: "Calcula tu beneficio real en Shopify: ingresos menos COGS, comisiones, envío, descuentos, devoluciones y publicidad, por pedido y por producto.",
          h1: "Tu beneficio en Shopify, calculado de forma honesta",
          intro: "Shopify te muestra ingresos, no beneficio. GetProfitCalc calcula el beneficio neto real por pedido descontando COGS, comisiones, envío, descuentos, devoluciones y publicidad, automáticamente desde tus pedidos sincronizados.",
        },
        "shopify-profit-analytics": {
          title: "Analítica de beneficios Shopify — Por producto, país y canal",
          description: "Analítica de beneficios para Shopify más allá de los ingresos: beneficio por producto, país, canal y segmento de clientes, con tendencias y alertas.",
          h1: "Analítica que explica por qué cambió tu beneficio",
          intro: "La analítica de ingresos dice qué se vendió. La analítica de beneficios dice qué ganó dinero. Desglosa el beneficio por producto, país, tienda y segmento de clientes, y detecta los cambios a tiempo.",
        },
        "shopify-cogs-tracker": {
          title: "Seguimiento de COGS para Shopify — Costes precisos por producto",
          description: "Controla el COGS de Shopify por producto y variante, con envío y otros costes, para que cada cifra de beneficio se apoye en costes fiables.",
          h1: "El beneficio solo es preciso si tu COGS lo es",
          intro: "La mayoría de errores de beneficio son errores de COGS: un precio de proveedor desactualizado o una variante sin coste. El centro de COGS mantiene los costes en un solo lugar y los aplica a cada pedido automáticamente.",
        },
        "shopify-profit-and-loss-report": {
          title: "Informe de pérdidas y ganancias Shopify — P&L sin hojas de cálculo",
          description: "Genera un informe P&L de Shopify con ingresos, COGS, comisiones, envío, publicidad y beneficio neto, listo para compartir, exportar y programar.",
          h1: "Un informe P&L que tu contable puede usar",
          intro: "Un buen informe P&L debe cuadrar: ingresos, cada categoría de coste y el neto restante, para el periodo que elijas. GetProfitCalc lo construye desde tus pedidos y costes, y lo exporta en PDF o CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Seguimiento de beneficio tras publicidad en Shopify — Meta, Google y TikTok",
          description: "Controla el beneficio de Shopify después de publicidad en Meta, Google y TikTok, por campaña y por anuncio, para que el presupuesto siga al beneficio.",
          h1: "El beneficio después de publicidad es una decisión, no un dato",
          intro: "Un anuncio puede parecer rentable por ROAS y aun así perder dinero tras COGS, comisiones y envío. GetProfitCalc atribuye el gasto a los pedidos que generó y descuenta todos los costes, por campaña y por anuncio.",
        },
      },
    },
  },
  {
    code: "fr",
    dict: {
      name: "Français",
      ogLocale: "fr_FR",
      eyebrow: "Suivi des bénéfices pour Shopify",
      breadcrumbHome: "Accueil",
      featuresHeading: "Ce que GetProfitCalc inclut",
      stepsHeading: "Comment ça marche",
      faqHeading: "Questions fréquentes",
      relatedHeading: "Pages associées",
      ctaTitle: "Connaissez votre vrai bénéfice, pas seulement vos revenus",
      ctaText: "Connectez Shopify et consultez le bénéfice par commande, tous coûts inclus.",
      ctaPrimary: "Commencer gratuitement",
      ctaSecondary: "Voir les tarifs",
      home: {
        title: "GetProfitCalc — Le vrai bénéfice pour Shopify",
        description: "Calculez votre vrai bénéfice Shopify : revenus moins COGS, frais, livraison, remises, remboursements et publicité, par commande et par produit.",
        h1: "Votre vrai bénéfice Shopify, sans tableur",
        intro: "Shopify affiche vos revenus, pas votre bénéfice. GetProfitCalc synchronise vos commandes et déduit tous les coûts, pour que vous voyiez ce que vous avez vraiment gagné sur chaque commande et chaque produit.",
      },
      features: [
        { title: "Bénéfice par commande et produit", desc: "Chaque commande affiche les revenus moins tous les coûts, et les totaux sont la somme des commandes." },
        { title: "Tous les coûts inclus", desc: "COGS, livraison, frais, remises, remboursements et publicité sont déduits avant le résultat." },
        { title: "Bénéfice après publicité", desc: "Les dépenses Meta, Google et TikTok sont attribuées aux commandes qu'elles ont générées." },
        { title: "Rapports programmés", desc: "Rapports hebdomadaires et mensuels en PDF ou CSV, prêts à partager avec vos partenaires ou votre comptable." },
      ],
      steps: [
        { title: "Connectez Shopify", desc: "Connectez votre boutique via OAuth. Les commandes se synchronisent automatiquement." },
        { title: "Ajoutez vos vrais coûts", desc: "Définissez le COGS, la livraison et les frais une seule fois. L'historique s'importe par CSV." },
        { title: "Consultez votre vrai bénéfice", desc: "Chaque commande montre ce que vous avez conservé après tous les coûts." },
      ],
      faqs: [
        { q: "Comment le bénéfice net réel est-il calculé ?", a: "Revenus moins COGS, livraison, frais, remises, remboursements et publicité attribuée, par commande. Les totaux sont la somme des bénéfices par commande." },
        { q: "Faut-il une carte bancaire pour essayer GetProfitCalc ?", a: "Non. Vous pouvez créer un compte et connecter votre boutique d'abord, puis consulter la page des tarifs pour les offres actuelles." },
        { q: "Est-ce réservé à Shopify ?", a: "La synchronisation en direct est réservée à Shopify par conception. Les autres plateformes peuvent importer des commandes historiques par CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Calculateur de bénéfice Shopify — Bénéfice net réel par commande",
          description: "Calculez votre vrai bénéfice Shopify : revenus moins COGS, frais, livraison, remises, remboursements et publicité, par commande et par produit.",
          h1: "Votre bénéfice Shopify, calculé honnêtement",
          intro: "Shopify affiche vos revenus, pas votre bénéfice. GetProfitCalc calcule le bénéfice net réel par commande en déduisant le COGS, les frais, la livraison, les remises, les remboursements et la publicité, automatiquement depuis vos commandes synchronisées.",
        },
        "shopify-profit-analytics": {
          title: "Analytique des bénéfices Shopify — Par produit, pays et canal",
          description: "Une analytique des bénéfices Shopify au-delà des revenus : bénéfice par produit, pays, canal et segment de clients, avec tendances et alertes.",
          h1: "Une analytique qui explique pourquoi votre bénéfice a bougé",
          intro: "L'analytique des revenus dit ce qui s'est vendu. L'analytique des bénéfices dit ce qui a rapporté. Décomposez le bénéfice par produit, pays, boutique et segment de clients, et repérez les changements à temps.",
        },
        "shopify-cogs-tracker": {
          title: "Suivi du COGS pour Shopify — Des coûts précis par produit",
          description: "Suivez le COGS Shopify par produit et variante, avec livraison et autres coûts, pour que chaque chiffre de bénéfice repose sur des coûts fiables.",
          h1: "Le bénéfice n'est précis que si votre COGS l'est",
          intro: "La plupart des erreurs de bénéfice sont des erreurs de COGS : un prix fournisseur obsolète ou une variante sans coût. Le centre COGS regroupe les coûts et les applique automatiquement à chaque commande.",
        },
        "shopify-profit-and-loss-report": {
          title: "Compte de résultat Shopify — Un P&L sans tableur",
          description: "Générez un compte de résultat Shopify avec revenus, COGS, frais, livraison, publicité et bénéfice net, prêt à partager, exporter et programmer.",
          h1: "Un rapport P&L que votre comptable peut utiliser",
          intro: "Un bon rapport P&L doit s'équilibrer : revenus, chaque catégorie de coût et le net restant, pour la période choisie. GetProfitCalc le construit depuis vos commandes et vos coûts, et l'exporte en PDF ou CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Suivi du bénéfice après publicité sur Shopify — Meta, Google et TikTok",
          description: "Suivez le bénéfice Shopify après publicité sur Meta, Google et TikTok, par campagne et par création, pour que le budget suive le bénéfice.",
          h1: "Le bénéfice après publicité est une décision, pas un chiffre",
          intro: "Une publicité peut sembler rentable en ROAS et pourtant perdre de l'argent après COGS, frais et livraison. GetProfitCalc attribue les dépenses aux commandes générées et déduit tous les coûts, par campagne et par création.",
        },
      },
    },
  },
  {
    code: "de",
    dict: {
      name: "Deutsch",
      ogLocale: "de_DE",
      eyebrow: "Gewinn-Tracking für Shopify",
      breadcrumbHome: "Startseite",
      featuresHeading: "Was GetProfitCalc bietet",
      stepsHeading: "So funktioniert es",
      faqHeading: "Häufige Fragen",
      relatedHeading: "Verwandte Seiten",
      ctaTitle: "Kennen Sie Ihren echten Gewinn, nicht nur Ihren Umsatz",
      ctaText: "Verbinden Sie Shopify und sehen Sie den Gewinn pro Bestellung inklusive aller Kosten.",
      ctaPrimary: "Kostenlos starten",
      ctaSecondary: "Preise ansehen",
      home: {
        title: "GetProfitCalc — Echter Gewinn für Shopify",
        description: "Berechnen Sie Ihren echten Shopify-Gewinn: Umsatz minus COGS, Gebühren, Versand, Rabatte, Rückerstattungen und Werbung, pro Bestellung und pro Produkt.",
        h1: "Ihr echter Shopify-Gewinn, ohne Tabellenkalkulation",
        intro: "Shopify zeigt Ihren Umsatz, nicht Ihren Gewinn. GetProfitCalc synchronisiert Ihre Bestellungen und zieht alle Kosten ab, sodass Sie sehen, was Sie bei jeder Bestellung und jedem Produkt wirklich verdient haben.",
      },
      features: [
        { title: "Gewinn pro Bestellung und Produkt", desc: "Jede Bestellung zeigt Umsatz minus alle Kosten, und die Summen sind die Summe der Bestellungen." },
        { title: "Alle Kosten enthalten", desc: "COGS, Versand, Gebühren, Rabatte, Rückerstattungen und Werbung werden vor dem Ergebnis abgezogen." },
        { title: "Gewinn nach Werbung", desc: "Ausgaben für Meta, Google und TikTok werden den Bestellungen zugeordnet, die sie erzeugt haben." },
        { title: "Geplante Berichte", desc: "Wöchentliche und monatliche Berichte als PDF oder CSV, bereit zum Teilen mit Partnern oder Steuerberatern." },
      ],
      steps: [
        { title: "Shopify verbinden", desc: "Verbinden Sie Ihren Shop per OAuth. Bestellungen werden automatisch synchronisiert." },
        { title: "Echte Kosten hinterlegen", desc: "Legen Sie COGS, Versand und Gebühren einmal fest. Ältere Daten lassen sich per CSV importieren." },
        { title: "Echten Gewinn einsehen", desc: "Jede Bestellung zeigt, was nach allen Kosten übrig bleibt." },
      ],
      faqs: [
        { q: "Wie wird der echte Nettogewinn berechnet?", a: "Umsatz minus COGS, Versand, Gebühren, Rabatte, Rückerstattungen und zugeordnete Werbung, pro Bestellung. Die Summen sind die Summe der Gewinne pro Bestellung." },
        { q: "Brauche ich eine Kreditkarte zum Testen?", a: "Nein. Sie können zuerst ein Konto erstellen und Ihren Shop verbinden; aktuelle Tarife finden Sie auf der Preisseite." },
        { q: "Funktioniert es nur mit Shopify?", a: "Die Live-Synchronisation ist bewusst nur für Shopify gedacht. Andere Plattformen können ältere Bestellungen per CSV importieren." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-Gewinnrechner — Echter Nettogewinn pro Bestellung",
          description: "Berechnen Sie Ihren echten Shopify-Gewinn: Umsatz minus COGS, Gebühren, Versand, Rabatte, Rückerstattungen und Werbung, pro Bestellung und pro Produkt.",
          h1: "Ihr Shopify-Gewinn, ehrlich berechnet",
          intro: "Shopify zeigt Umsatz, nicht Gewinn. GetProfitCalc berechnet den echten Nettogewinn pro Bestellung, indem COGS, Gebühren, Versand, Rabatte, Rückerstattungen und Werbung automatisch von Ihren synchronisierten Bestellungen abgezogen werden.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-Gewinnanalyse — Nach Produkt, Land und Kanal",
          description: "Shopify-Gewinnanalyse jenseits des Umsatzes: Gewinn nach Produkt, Land, Kanal und Kundensegment, mit Trends und Warnungen.",
          h1: "Analysen, die erklären, warum sich Ihr Gewinn verändert hat",
          intro: "Umsatzanalysen sagen, was sich verkauft hat. Gewinnanalysen sagen, was Geld gebracht hat. Teilen Sie den Gewinn nach Produkt, Land, Shop und Kundensegment auf und erkennen Sie Veränderungen rechtzeitig.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-Tracker — Genaue Kosten pro Produkt",
          description: "Verfolgen Sie Shopify-COGS pro Produkt und Variante, inklusive Versand und weiterer Kosten, damit jede Gewinnzahl auf verlässlichen Kosten beruht.",
          h1: "Gewinn ist nur so genau wie Ihre COGS",
          intro: "Die meisten Gewinnfehler sind COGS-Fehler: ein veralteter Lieferantenpreis oder eine Variante ohne Kosten. Das COGS-Center hält alle Kosten an einem Ort und wendet sie automatisch auf jede Bestellung an.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-Gewinn-und-Verlust-Bericht — P&L ohne Tabellenkalkulation",
          description: "Erstellen Sie einen Shopify-P&L-Bericht mit Umsatz, COGS, Gebühren, Versand, Werbung und Nettogewinn — bereit zum Teilen, Exportieren und Planen.",
          h1: "Ein P&L-Bericht, mit dem Ihr Steuerberater arbeiten kann",
          intro: "Ein guter P&L-Bericht muss aufgehen: Umsatz, jede Kostenkategorie und der verbleibende Nettobetrag für den gewählten Zeitraum. GetProfitCalc erstellt ihn aus Ihren Bestellungen und Kosten und exportiert ihn als PDF oder CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-Werbegewinn-Tracker — Gewinn nach Werbung bei Meta, Google und TikTok",
          description: "Verfolgen Sie den Shopify-Gewinn nach Werbung bei Meta, Google und TikTok, nach Kampagne und Kreativmaterial, damit das Budget dem Gewinn folgt.",
          h1: "Gewinn nach Werbung ist eine Entscheidung, keine Zahl",
          intro: "Eine Anzeige kann nach ROAS profitabel wirken und nach COGS, Gebühren und Versand trotzdem Geld verlieren. GetProfitCalc ordnet Ausgaben den Bestellungen zu, die sie erzeugt haben, und zieht alle Kosten ab — nach Kampagne und Kreativmaterial.",
        },
      },
    },
  },
  {
    code: "pt",
    dict: {
      name: "Português",
      ogLocale: "pt_PT",
      eyebrow: "Acompanhamento de lucros para Shopify",
      breadcrumbHome: "Início",
      featuresHeading: "O que o GetProfitCalc inclui",
      stepsHeading: "Como funciona",
      faqHeading: "Perguntas frequentes",
      relatedHeading: "Páginas relacionadas",
      ctaTitle: "Conheça o seu lucro real, não apenas a receita",
      ctaText: "Ligue o Shopify e veja o lucro por pedido, com todos os custos incluídos.",
      ctaPrimary: "Começar grátis",
      ctaSecondary: "Ver preços",
      home: {
        title: "GetProfitCalc — Lucro real para Shopify",
        description: "Calcule o seu lucro real no Shopify: receita menos COGS, taxas, envio, descontos, reembolsos e publicidade, por pedido e por produto.",
        h1: "O seu lucro real no Shopify, sem folhas de cálculo",
        intro: "O Shopify mostra a receita, não o lucro. O GetProfitCalc sincroniza os seus pedidos e deduz todos os custos, para que veja o que realmente ganhou em cada pedido e em cada produto.",
      },
      features: [
        { title: "Lucro por pedido e produto", desc: "Cada pedido mostra a receita menos todos os custos, e os totais são a soma dos pedidos." },
        { title: "Todos os custos incluídos", desc: "COGS, envio, taxas, descontos, reembolsos e publicidade são deduzidos antes do resultado." },
        { title: "Lucro após publicidade", desc: "Os gastos com Meta, Google e TikTok são atribuídos aos pedidos que geraram." },
        { title: "Relatórios agendados", desc: "Relatórios semanais e mensais em PDF ou CSV, prontos a partilhar com parceiros ou contabilistas." },
      ],
      steps: [
        { title: "Ligue o Shopify", desc: "Ligue a sua loja com OAuth. Os pedidos sincronizam automaticamente." },
        { title: "Adicione os seus custos reais", desc: "Defina COGS, envio e taxas uma vez. O histórico importa-se por CSV." },
        { title: "Veja o seu lucro real", desc: "Cada pedido mostra o que ficou depois de todos os custos." },
      ],
      faqs: [
        { q: "Como é calculado o lucro líquido real?", a: "Receita menos COGS, envio, taxas, descontos, reembolsos e publicidade atribuída, por pedido. Os totais são a soma do lucro por pedido." },
        { q: "Preciso de cartão para experimentar o GetProfitCalc?", a: "Não. Pode criar uma conta e ligar a sua loja primeiro; consulte a página de preços para ver os planos atuais." },
        { q: "Funciona apenas com o Shopify?", a: "A sincronização em direto é apenas para Shopify, por design. Outras plataformas podem importar pedidos históricos por CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Calculadora de lucros Shopify — Lucro líquido real por pedido",
          description: "Calcule o seu lucro real no Shopify: receita menos COGS, taxas, envio, descontos, reembolsos e publicidade, por pedido e por produto.",
          h1: "O seu lucro no Shopify, calculado com honestidade",
          intro: "O Shopify mostra receita, não lucro. O GetProfitCalc calcula o lucro líquido real por pedido, deduzindo COGS, taxas, envio, descontos, reembolsos e publicidade, automaticamente a partir dos seus pedidos sincronizados.",
        },
        "shopify-profit-analytics": {
          title: "Análise de lucros Shopify — Por produto, país e canal",
          description: "Análise de lucros Shopify para além da receita: lucro por produto, país, canal e segmento de clientes, com tendências e alertas.",
          h1: "Análise que explica porque é que o seu lucro mudou",
          intro: "A análise de receita diz o que vendeu. A análise de lucros diz o que ganhou dinheiro. Divida o lucro por produto, país, loja e segmento de clientes, e detete mudanças a tempo.",
        },
        "shopify-cogs-tracker": {
          title: "Controlo de COGS para Shopify — Custos precisos por produto",
          description: "Acompanhe o COGS do Shopify por produto e variante, com envio e outros custos, para que cada valor de lucro assente em custos fiáveis.",
          h1: "O lucro só é preciso se o seu COGS for",
          intro: "A maioria dos erros de lucro são erros de COGS: um preço de fornecedor desatualizado ou uma variante sem custo. O centro de COGS mantém os custos num só lugar e aplica-os automaticamente a cada pedido.",
        },
        "shopify-profit-and-loss-report": {
          title: "Relatório de lucros e perdas Shopify — P&L sem folhas de cálculo",
          description: "Gere um relatório P&L do Shopify com receita, COGS, taxas, envio, publicidade e lucro líquido, pronto a partilhar, exportar e agendar.",
          h1: "Um relatório P&L que o seu contabilista pode usar",
          intro: "Um bom relatório P&L tem de fechar: receita, cada categoria de custo e o líquido restante, para o período escolhido. O GetProfitCalc constrói-o a partir dos seus pedidos e custos, e exporta-o em PDF ou CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Lucro após publicidade no Shopify — Meta, Google e TikTok",
          description: "Acompanhe o lucro do Shopify após publicidade na Meta, Google e TikTok, por campanha e por criativo, para que o orçamento siga o lucro.",
          h1: "O lucro após publicidade é uma decisão, não um número",
          intro: "Um anúncio pode parecer rentável em ROAS e mesmo assim perder dinheiro após COGS, taxas e envio. O GetProfitCalc atribui os gastos aos pedidos que geraram e deduz todos os custos, por campanha e por criativo.",
        },
      },
    },
  },
  {
    code: "nl",
    dict: {
      name: "Nederlands",
      ogLocale: "nl_NL",
      eyebrow: "Winsttracking voor Shopify",
      breadcrumbHome: "Home",
      featuresHeading: "Wat GetProfitCalc biedt",
      stepsHeading: "Hoe het werkt",
      faqHeading: "Veelgestelde vragen",
      relatedHeading: "Gerelateerde pagina's",
      ctaTitle: "Ken uw echte winst, niet alleen uw omzet",
      ctaText: "Koppel Shopify en bekijk de winst per bestelling, inclusief alle kosten.",
      ctaPrimary: "Gratis starten",
      ctaSecondary: "Prijzen bekijken",
      home: {
        title: "GetProfitCalc — Echte winst voor Shopify",
        description: "Bereken uw echte Shopify-winst: omzet minus COGS, kosten, verzending, kortingen, retouren en advertenties, per bestelling en per product.",
        h1: "Uw echte Shopify-winst, zonder spreadsheets",
        intro: "Shopify toont uw omzet, niet uw winst. GetProfitCalc synchroniseert uw bestellingen en trekt alle kosten af, zodat u ziet wat u per bestelling en per product echt heeft verdiend.",
      },
      features: [
        { title: "Winst per bestelling en product", desc: "Elke bestelling toont omzet minus alle kosten, en totalen zijn de som van de bestellingen." },
        { title: "Alle kosten inbegrepen", desc: "COGS, verzending, kosten, kortingen, retouren en advertenties worden vóór het resultaat afgetrokken." },
        { title: "Winst na advertenties", desc: "Uitgaven voor Meta, Google en TikTok worden toegeschreven aan de bestellingen die ze opleverden." },
        { title: "Geplande rapporten", desc: "Wekelijkse en maandelijkse rapporten als PDF of CSV, klaar om te delen met partners of accountants." },
      ],
      steps: [
        { title: "Koppel Shopify", desc: "Koppel uw winkel via OAuth. Bestellingen synchroniseren automatisch." },
        { title: "Voeg uw echte kosten toe", desc: "Stel COGS, verzending en kosten één keer in. Historie importeert u via CSV." },
        { title: "Bekijk uw echte winst", desc: "Elke bestelling toont wat er na alle kosten overblijft." },
      ],
      faqs: [
        { q: "Hoe wordt de echte nettowinst berekend?", a: "Omzet minus COGS, verzending, kosten, kortingen, retouren en toegeschreven advertenties, per bestelling. Totalen zijn de som van de winst per bestelling." },
        { q: "Heb ik een creditcard nodig om te proberen?", a: "Nee. U kunt eerst een account aanmaken en uw winkel koppelen; actuele abonnementen vindt u op de prijspagina." },
        { q: "Werkt het alleen met Shopify?", a: "Live-synchronisatie is bewust alleen voor Shopify. Andere platforms kunnen historische bestellingen via CSV importeren." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-winstcalculator — Echte nettowinst per bestelling",
          description: "Bereken uw echte Shopify-winst: omzet minus COGS, kosten, verzending, kortingen, retouren en advertenties, per bestelling en per product.",
          h1: "Uw Shopify-winst, eerlijk berekend",
          intro: "Shopify toont omzet, geen winst. GetProfitCalc berekent de echte nettowinst per bestelling door COGS, kosten, verzending, kortingen, retouren en advertenties automatisch af te trekken van uw gesynchroniseerde bestellingen.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-winstanalyse — Per product, land en kanaal",
          description: "Shopify-winstanalyse voorbij omzet: winst per product, land, kanaal en klantsegment, met trends en meldingen.",
          h1: "Analyse die uitlegt waarom uw winst veranderde",
          intro: "Omzetanalyse vertelt wat er verkocht is. Winstanalyse vertelt wat er geld opleverde. Splits winst uit per product, land, winkel en klantsegment, en signaleer veranderingen op tijd.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-tracker — Nauwkeurige kosten per product",
          description: "Volg Shopify-COGS per product en variant, inclusief verzending en overige kosten, zodat elk winstcijfer op betrouwbare kosten rust.",
          h1: "Winst is alleen nauwkeurig als uw COGS dat is",
          intro: "De meeste winstfouten zijn COGS-fouten: een verouderde leveranciersprijs of een variant zonder kosten. Het COGS-centrum houdt alle kosten op één plek en past ze automatisch op elke bestelling toe.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-winst-en-verliesrapport — P&L zonder spreadsheets",
          description: "Genereer een Shopify-P&L-rapport met omzet, COGS, kosten, verzending, advertenties en nettowinst — klaar om te delen, exporteren en plannen.",
          h1: "Een P&L-rapport dat uw accountant kan gebruiken",
          intro: "Een goed P&L-rapport moet kloppen: omzet, elke kostencategorie en het resterende nettobedrag, voor de gekozen periode. GetProfitCalc bouwt het uit uw bestellingen en kosten en exporteert het als PDF of CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-advertentiewinsttracker — Winst na advertenties bij Meta, Google en TikTok",
          description: "Volg Shopify-winst na advertenties bij Meta, Google en TikTok, per campagne en per advertentie, zodat budget winst volgt.",
          h1: "Winst na advertenties is een beslissing, geen getal",
          intro: "Een advertentie kan op ROAS winstgevend lijken en na COGS, kosten en verzending toch geld verliezen. GetProfitCalc schrijft uitgaven toe aan de bestellingen die ze opleverden en trekt alle kosten af — per campagne en per advertentie.",
        },
      },
    },
  },
  {
    code: "it",
    dict: {
      name: "Italiano",
      ogLocale: "it_IT",
      eyebrow: "Monitoraggio dei profitti per Shopify",
      breadcrumbHome: "Home",
      featuresHeading: "Cosa include GetProfitCalc",
      stepsHeading: "Come funziona",
      faqHeading: "Domande frequenti",
      relatedHeading: "Pagine correlate",
      ctaTitle: "Conosci il tuo profitto reale, non solo il fatturato",
      ctaText: "Collega Shopify e visualizza il profitto per ordine, con tutti i costi inclusi.",
      ctaPrimary: "Inizia gratis",
      ctaSecondary: "Vedi i prezzi",
      home: {
        title: "GetProfitCalc — Profitto reale per Shopify",
        description: "Calcola il tuo profitto reale su Shopify: ricavi meno COGS, commissioni, spedizione, sconti, resi e pubblicità, per ordine e per prodotto.",
        h1: "Il tuo profitto reale su Shopify, senza fogli di calcolo",
        intro: "Shopify mostra il fatturato, non il profitto. GetProfitCalc sincronizza i tuoi ordini e deduce tutti i costi, così vedi quanto hai davvero guadagnato su ogni ordine e ogni prodotto.",
      },
      features: [
        { title: "Profitto per ordine e prodotto", desc: "Ogni ordine mostra ricavi meno tutti i costi, e i totali sono la somma degli ordini." },
        { title: "Tutti i costi inclusi", desc: "COGS, spedizione, commissioni, sconti, resi e pubblicità vengono dedotti prima del risultato." },
        { title: "Profitto dopo la pubblicità", desc: "La spesa su Meta, Google e TikTok viene attribuita agli ordini che ha generato." },
        { title: "Report programmati", desc: "Report settimanali e mensili in PDF o CSV, pronti da condividere con partner o commercialisti." },
      ],
      steps: [
        { title: "Collega Shopify", desc: "Collega il tuo negozio con OAuth. Gli ordini si sincronizzano automaticamente." },
        { title: "Aggiungi i tuoi costi reali", desc: "Imposta COGS, spedizione e commissioni una sola volta. Lo storico si importa via CSV." },
        { title: "Visualizza il tuo profitto reale", desc: "Ogni ordine mostra quanto è rimasto dopo tutti i costi." },
      ],
      faqs: [
        { q: "Come viene calcolato il profitto netto reale?", a: "Ricavi meno COGS, spedizione, commissioni, sconti, resi e pubblicità attribuita, per ordine. I totali sono la somma del profitto per ordine." },
        { q: "Serve una carta per provare GetProfitCalc?", a: "No. Puoi creare un account e collegare il negozio prima; consulta la pagina dei prezzi per i piani attuali." },
        { q: "Funziona solo con Shopify?", a: "La sincronizzazione in tempo reale è solo per Shopify, per scelta. Altre piattaforme possono importare ordini storici via CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Calcolatore di profitto Shopify — Profitto netto reale per ordine",
          description: "Calcola il tuo profitto reale su Shopify: ricavi meno COGS, commissioni, spedizione, sconti, resi e pubblicità, per ordine e per prodotto.",
          h1: "Il tuo profitto su Shopify, calcolato onestamente",
          intro: "Shopify mostra il fatturato, non il profitto. GetProfitCalc calcola il profitto netto reale per ordine deducendo COGS, commissioni, spedizione, sconti, resi e pubblicità, automaticamente dagli ordini sincronizzati.",
        },
        "shopify-profit-analytics": {
          title: "Analisi dei profitti Shopify — Per prodotto, paese e canale",
          description: "Analisi dei profitti Shopify oltre il fatturato: profitto per prodotto, paese, canale e segmento di clienti, con trend e avvisi.",
          h1: "Analisi che spiega perché il tuo profitto è cambiato",
          intro: "L'analisi del fatturato dice cosa si è venduto. L'analisi dei profitti dice cosa ha guadagnato. Suddividi il profitto per prodotto, paese, negozio e segmento di clienti, e individua i cambiamenti in tempo.",
        },
        "shopify-cogs-tracker": {
          title: "Monitoraggio COGS per Shopify — Costi precisi per prodotto",
          description: "Monitora il COGS di Shopify per prodotto e variante, con spedizione e altri costi, così ogni cifra di profitto si basa su costi affidabili.",
          h1: "Il profitto è preciso solo se lo è il tuo COGS",
          intro: "La maggior parte degli errori di profitto sono errori di COGS: un prezzo fornitore obsoleto o una variante senza costo. Il centro COGS tiene tutti i costi in un unico luogo e li applica automaticamente a ogni ordine.",
        },
        "shopify-profit-and-loss-report": {
          title: "Report profitti e perdite Shopify — P&L senza fogli di calcolo",
          description: "Genera un report P&L di Shopify con ricavi, COGS, commissioni, spedizione, pubblicità e profitto netto, pronto da condividere, esportare e programmare.",
          h1: "Un report P&L che il tuo commercialista può usare",
          intro: "Un buon report P&L deve quadrare: ricavi, ogni categoria di costo e il netto restante, per il periodo scelto. GetProfitCalc lo costruisce dai tuoi ordini e costi, e lo esporta in PDF o CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Profitto dopo la pubblicità su Shopify — Meta, Google e TikTok",
          description: "Monitora il profitto Shopify dopo la pubblicità su Meta, Google e TikTok, per campagna e per creatività, così il budget segue il profitto.",
          h1: "Il profitto dopo la pubblicità è una decisione, non un numero",
          intro: "Un annuncio può sembrare redditizio in base al ROAS e perdere denaro dopo COGS, commissioni e spedizione. GetProfitCalc attribuisce la spesa agli ordini generati e deduce tutti i costi, per campagna e per creatività.",
        },
      },
    },
  },
  {
    code: "ja",
    dict: {
      name: "日本語",
      ogLocale: "ja_JP",
      eyebrow: "Shopifyの利益トラッキング",
      breadcrumbHome: "ホーム",
      featuresHeading: "GetProfitCalcの機能",
      stepsHeading: "使い方",
      faqHeading: "よくある質問",
      relatedHeading: "関連ページ",
      ctaTitle: "売上ではなく、本当の利益を知ろう",
      ctaText: "Shopifyを接続し、すべてのコストを差し引いた注文ごとの利益を確認できます。",
      ctaPrimary: "無料で始める",
      ctaSecondary: "料金を見る",
      home: {
        title: "GetProfitCalc — Shopifyの本当の利益",
        description: "Shopifyの本当の利益を計算します。売上から原価、手数料、送料、割引、返金、広告費を差し引き、注文ごと・商品ごとに表示します。",
        h1: "スプレッドシートなしで、Shopifyの本当の利益を",
        intro: "Shopifyが表示するのは売上であり、利益ではありません。GetProfitCalcは注文を同期し、すべてのコストを差し引くため、注文ごと・商品ごとの本当の利益が分かります。",
      },
      features: [
        { title: "注文ごと・商品ごとの利益", desc: "各注文は売上からすべてのコストを差し引いて表示され、合計は注文の合計です。" },
        { title: "すべてのコストを含む", desc: "原価、送料、手数料、割引、返金、広告費を結果の前に差し引きます。" },
        { title: "広告費控除後の利益", desc: "Meta、Google、TikTokの広告費を、それが生んだ注文に紐付けます。" },
        { title: "定期レポート", desc: "週次・月次レポートをPDFまたはCSVで自動送信し、パートナーや会計士と共有できます。" },
      ],
      steps: [
        { title: "Shopifyを接続", desc: "OAuthでストアを接続します。注文は自動的に同期されます。" },
        { title: "実際のコストを入力", desc: "原価、送料、手数料を一度だけ設定します。過去の注文はCSVで取り込めます。" },
        { title: "本当の利益を確認", desc: "各注文で、すべてのコストを差し引いた後に残った金額が分かります。" },
      ],
      faqs: [
        { q: "本当の純利益はどう計算されますか?", a: "注文ごとに、売上から原価、送料、手数料、割引、返金、紐付けられた広告費を差し引きます。合計は注文ごとの利益の合計です。" },
        { q: "試すのにクレジットカードは必要ですか?", a: "いいえ。まずアカウントを作成してストアを接続できます。現在のプランは料金ページで確認してください。" },
        { q: "Shopify専用ですか?", a: "ライブ同期は設計上Shopify専用です。他のプラットフォームの過去の注文はCSVで取り込めます。" },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify利益計算ツール — 注文ごとの本当の純利益",
          description: "Shopifyの本当の利益を計算します。売上から原価、手数料、送料、割引、返金、広告費を差し引き、注文ごと・商品ごとに表示します。",
          h1: "Shopifyの利益を、正直に計算する",
          intro: "Shopifyが表示するのは売上であり、利益ではありません。GetProfitCalcは同期された注文から原価、手数料、送料、割引、返金、広告費を自動的に差し引き、注文ごとの本当の純利益を計算します。",
        },
        "shopify-profit-analytics": {
          title: "Shopify利益分析 — 商品・国・チャネル別",
          description: "売上を超えたShopify利益分析。商品、国、チャネル、顧客セグメント別の利益を、トレンドとアラートとともに表示します。",
          h1: "利益が動いた理由を説明する分析",
          intro: "売上分析は「何が売れたか」を示します。利益分析は「何が儲かったか」を示します。利益を商品、国、ストア、顧客セグメント別に分解し、変化を早めに捉えます。",
        },
        "shopify-cogs-tracker": {
          title: "Shopify原価トラッカー — 商品ごとの正確なコスト",
          description: "Shopifyの原価を商品・バリエーションごとに追跡し、送料やその他のコストも含めるため、すべての利益数値が信頼できるコストに基づきます。",
          h1: "利益の正確さは、原価の正確さ次第",
          intro: "利益の誤りの多くは原価の誤りです。古い仕入価格やコスト未設定のバリエーションが原因です。原価センターはすべてのコストを一か所に集め、各注文に自動適用します。",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify損益レポート — スプレッドシートなしのP&L",
          description: "売上、原価、手数料、送料、広告費、純利益を含むShopifyのP&Lレポートを作成し、共有、出力、定期送信ができます。",
          h1: "会計士がそのまま使えるP&Lレポート",
          intro: "良いP&Lレポートは一致しなければなりません。売上、すべてのコスト区分、残りの純利益を、選んだ期間について表示します。GetProfitCalcは注文とコストからレポートを作成し、PDFまたはCSVで出力します。",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify広告費控除後利益トラッカー — Meta、Google、TikTok",
          description: "Meta、Google、TikTokの広告費控除後のShopify利益を、キャンペーン別・クリエイティブ別に追跡し、予算を利益に連動させます。",
          h1: "広告費控除後の利益は、数字ではなく判断材料",
          intro: "広告はROASでは利益が出ているように見えても、原価、手数料、送料を差し引くと赤字の場合があります。GetProfitCalcは広告費を生んだ注文に紐付け、すべてのコストを差し引きます。",
        },
      },
    },
  },
  {
    code: "ko",
    dict: {
      name: "한국어",
      ogLocale: "ko_KR",
      eyebrow: "Shopify 수익 추적",
      breadcrumbHome: "홈",
      featuresHeading: "GetProfitCalc 기능",
      stepsHeading: "사용 방법",
      faqHeading: "자주 묻는 질문",
      relatedHeading: "관련 페이지",
      ctaTitle: "매출이 아닌 진짜 수익을 확인하세요",
      ctaText: "Shopify를 연결하고 모든 비용을 제외한 주문별 수익을 확인하세요.",
      ctaPrimary: "무료로 시작하기",
      ctaSecondary: "요금 보기",
      home: {
        title: "GetProfitCalc — Shopify 진짜 수익",
        description: "Shopify 진짜 수익을 계산합니다. 매출에서 원가, 수수료, 배송비, 할인, 환불, 광고비를 제외하고 주문별·상품별로 표시합니다.",
        h1: "스프레드시트 없이 Shopify 진짜 수익 확인",
        intro: "Shopify는 매출을 보여주지 수익을 보여주지 않습니다. GetProfitCalc는 주문을 동기화하고 모든 비용을 제외하므로, 주문별·상품별 진짜 수익을 확인할 수 있습니다.",
      },
      features: [
        { title: "주문별·상품별 수익", desc: "각 주문은 매출에서 모든 비용을 제외한 금액으로 표시되며, 합계는 주문들의 합입니다." },
        { title: "모든 비용 포함", desc: "원가, 배송비, 수수료, 할인, 환불, 광고비를 결과 전에 제외합니다." },
        { title: "광고비 제외 후 수익", desc: "Meta, Google, TikTok 광고비를 해당 광고가 만든 주문에 연결합니다." },
        { title: "정기 리포트", desc: "주간·월간 리포트를 PDF 또는 CSV로 자동 발송하여 파트너나 회계사와 공유할 수 있습니다." },
      ],
      steps: [
        { title: "Shopify 연결", desc: "OAuth로 스토어를 연결합니다. 주문이 자동으로 동기화됩니다." },
        { title: "실제 비용 입력", desc: "원가, 배송비, 수수료를 한 번만 설정합니다. 과거 주문은 CSV로 가져올 수 있습니다." },
        { title: "진짜 수익 확인", desc: "각 주문에서 모든 비용을 제외하고 남은 금액을 확인할 수 있습니다." },
      ],
      faqs: [
        { q: "진짜 순수익은 어떻게 계산되나요?", a: "주문별로 매출에서 원가, 배송비, 수수료, 할인, 환불, 연결된 광고비를 제외합니다. 합계는 주문별 수익의 합입니다." },
        { q: "체험에 신용카드가 필요한가요?", a: "아닙니다. 먼저 계정을 만들고 스토어를 연결할 수 있습니다. 현재 요금제는 요금 페이지에서 확인하세요." },
        { q: "Shopify 전용인가요?", a: "실시간 동기화는 설계상 Shopify 전용입니다. 다른 플랫폼의 과거 주문은 CSV로 가져올 수 있습니다." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify 수익 계산기 — 주문별 진짜 순수익",
          description: "Shopify 진짜 수익을 계산합니다. 매출에서 원가, 수수료, 배송비, 할인, 환불, 광고비를 제외하고 주문별·상품별로 표시합니다.",
          h1: "Shopify 수익을 정직하게 계산하기",
          intro: "Shopify는 매출을 보여주지 수익을 보여주지 않습니다. GetProfitCalc는 동기화된 주문에서 원가, 수수료, 배송비, 할인, 환불, 광고비를 자동으로 제외하여 주문별 진짜 순수익을 계산합니다.",
        },
        "shopify-profit-analytics": {
          title: "Shopify 수익 분석 — 상품·국가·채널별",
          description: "매출을 넘어선 Shopify 수익 분석. 상품, 국가, 채널, 고객 세그먼트별 수익을 트렌드와 알림과 함께 표시합니다.",
          h1: "수익이 변한 이유를 설명하는 분석",
          intro: "매출 분석은 무엇이 팔렸는지 보여줍니다. 수익 분석은 무엇이 돈을 벌었는지 보여줍니다. 수익을 상품, 국가, 스토어, 고객 세그먼트별로 나누어 변화를 조기에 파악하세요.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify 원가 추적기 — 상품별 정확한 비용",
          description: "Shopify 원가를 상품·옵션별로 추적하고 배송비와 기타 비용을 포함하므로, 모든 수익 수치가 신뢰할 수 있는 비용에 기반합니다.",
          h1: "수익의 정확성은 원가의 정확성에 달려 있습니다",
          intro: "수익 오류의 대부분은 원가 오류입니다. 오래된 공급가나 비용이 없는 옵션이 원인입니다. 원가 센터는 모든 비용을 한곳에 모아 각 주문에 자동으로 적용합니다.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify 손익 리포트 — 스프레드시트 없는 P&L",
          description: "매출, 원가, 수수료, 배송비, 광고비, 순수익을 포함한 Shopify P&L 리포트를 만들고 공유, 내보내기, 정기 발송할 수 있습니다.",
          h1: "회계사가 그대로 사용할 수 있는 P&L 리포트",
          intro: "좋은 P&L 리포트는 맞아떨어져야 합니다. 선택한 기간의 매출, 모든 비용 항목, 남은 순수익을 표시합니다. GetProfitCalc는 주문과 비용으로 리포트를 만들고 PDF 또는 CSV로 내보냅니다.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify 광고비 제외 후 수익 추적기 — Meta, Google, TikTok",
          description: "Meta, Google, TikTok 광고비 제외 후 Shopify 수익을 캠페인별·소재별로 추적하여 예산이 수익을 따르게 합니다.",
          h1: "광고비 제외 후 수익은 숫자가 아니라 판단 자료입니다",
          intro: "광고는 ROAS로는 수익성이 있어 보여도 원가, 수수료, 배송비를 제외하면 손실일 수 있습니다. GetProfitCalc는 광고비를 해당 광고가 만든 주문에 연결하고 모든 비용을 제외합니다.",
        },
      },
    },
  },
  {
    code: "zh",
    dict: {
      name: "中文",
      ogLocale: "zh_CN",
      eyebrow: "Shopify 利润追踪",
      breadcrumbHome: "首页",
      featuresHeading: "GetProfitCalc 功能",
      stepsHeading: "使用方法",
      faqHeading: "常见问题",
      relatedHeading: "相关页面",
      ctaTitle: "了解真实利润，而不只是收入",
      ctaText: "连接 Shopify，查看每笔订单在扣除全部成本后的利润。",
      ctaPrimary: "免费开始",
      ctaSecondary: "查看价格",
      home: {
        title: "GetProfitCalc — Shopify 真实利润",
        description: "计算 Shopify 真实利润：收入减去成本、手续费、运费、折扣、退款和广告费，按订单和商品展示。",
        h1: "无需电子表格，了解 Shopify 真实利润",
        intro: "Shopify 显示的是收入，而不是利润。GetProfitCalc 同步您的订单并扣除全部成本，让您看到每笔订单和每个商品真正赚了多少钱。",
      },
      features: [
        { title: "按订单和商品统计利润", desc: "每笔订单显示收入减去全部成本，总计即各订单之和。" },
        { title: "包含全部成本", desc: "成本、运费、手续费、折扣、退款和广告费都在结果之前扣除。" },
        { title: "扣除广告费后的利润", desc: "Meta、Google 和 TikTok 的广告费归因到其带来的订单。" },
        { title: "定期报告", desc: "每周和每月报告以 PDF 或 CSV 自动发送，可与合作伙伴或会计共享。" },
      ],
      steps: [
        { title: "连接 Shopify", desc: "通过 OAuth 连接店铺，订单会自动同步。" },
        { title: "输入真实成本", desc: "只需设置一次成本、运费和手续费，历史订单可通过 CSV 导入。" },
        { title: "查看真实利润", desc: "每笔订单都会显示扣除全部成本后剩余的金额。" },
      ],
      faqs: [
        { q: "真实净利润是如何计算的？", a: "按订单计算：收入减去成本、运费、手续费、折扣、退款和归因的广告费。总计是各订单利润之和。" },
        { q: "试用需要信用卡吗？", a: "不需要。您可以先创建账户并连接店铺，当前套餐请查看价格页面。" },
        { q: "只支持 Shopify 吗？", a: "实时同步按设计仅支持 Shopify。其他平台的历史订单可通过 CSV 导入。" },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify 利润计算器 — 每笔订单的真实净利润",
          description: "计算 Shopify 真实利润：收入减去成本、手续费、运费、折扣、退款和广告费，按订单和商品展示。",
          h1: "诚实地计算 Shopify 利润",
          intro: "Shopify 显示的是收入，而不是利润。GetProfitCalc 会从同步的订单中自动扣除成本、手续费、运费、折扣、退款和广告费，计算每笔订单的真实净利润。",
        },
        "shopify-profit-analytics": {
          title: "Shopify 利润分析 — 按商品、国家和渠道",
          description: "超越收入的 Shopify 利润分析：按商品、国家、渠道和客户群体展示利润，并提供趋势和提醒。",
          h1: "解释利润为何变化的分析",
          intro: "收入分析告诉您卖出了什么，利润分析告诉您什么赚了钱。按商品、国家、店铺和客户群体拆分利润，及时发现变化。",
        },
        "shopify-cogs-tracker": {
          title: "Shopify 成本追踪器 — 每个商品的准确成本",
          description: "按商品和款式追踪 Shopify 成本，包括运费和其他成本，让每个利润数字都建立在可靠的成本之上。",
          h1: "利润的准确性取决于成本的准确性",
          intro: "大多数利润错误都是成本错误：过时的供应商价格或未设置成本的款式。成本中心将所有成本集中在一处，并自动应用到每笔订单。",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify 损益报告 — 无需电子表格的 P&L",
          description: "生成包含收入、成本、手续费、运费、广告费和净利润的 Shopify P&L 报告，可共享、导出和定期发送。",
          h1: "会计可以直接使用的 P&L 报告",
          intro: "一份好的 P&L 报告必须平衡：所选期间的收入、每个成本类别和剩余净利润。GetProfitCalc 根据订单和成本生成报告，并以 PDF 或 CSV 导出。",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify 扣除广告费后的利润追踪器 — Meta、Google、TikTok",
          description: "按广告系列和素材追踪 Meta、Google、TikTok 广告费扣除后的 Shopify 利润，让预算跟随利润。",
          h1: "扣除广告费后的利润是决策依据，而不只是一个数字",
          intro: "广告按 ROAS 看似盈利，但在扣除成本、手续费和运费后可能是亏损的。GetProfitCalc 将广告费归因到其带来的订单，并扣除全部成本，按广告系列和素材展示。",
        },
      },
    },
  },
  {
    code: "hi",
    dict: {
      name: "हिन्दी",
      ogLocale: "hi_IN",
      eyebrow: "Shopify के लिए लाभ ट्रैकिंग",
      breadcrumbHome: "होम",
      featuresHeading: "GetProfitCalc में क्या है",
      stepsHeading: "यह कैसे काम करता है",
      faqHeading: "अक्सर पूछे जाने वाले प्रश्न",
      relatedHeading: "संबंधित पृष्ठ",
      ctaTitle: "केवल राजस्व नहीं, अपना वास्तविक लाभ जानें",
      ctaText: "Shopify कनेक्ट करें और सभी लागतों सहित प्रति ऑर्डर लाभ देखें।",
      ctaPrimary: "मुफ़्त में शुरू करें",
      ctaSecondary: "कीमतें देखें",
      home: {
        title: "GetProfitCalc — Shopify के लिए वास्तविक लाभ",
        description: "अपना वास्तविक Shopify लाभ निकालें: राजस्व में से लागत, शुल्क, शिपिंग, छूट, रिफंड और विज्ञापन खर्च घटाकर, प्रति ऑर्डर और प्रति उत्पाद।",
        h1: "स्प्रेडशीट के बिना, Shopify का वास्तविक लाभ",
        intro: "Shopify राजस्व दिखाता है, लाभ नहीं। GetProfitCalc आपके ऑर्डर सिंक करता है और सभी लागतें घटाता है, ताकि आप देख सकें कि प्रत्येक ऑर्डर और उत्पाद पर वास्तव में कितना कमाया।",
      },
      features: [
        { title: "प्रति ऑर्डर और उत्पाद लाभ", desc: "प्रत्येक ऑर्डर राजस्व में से सभी लागतें घटाकर दिखाता है, और कुल योग ऑर्डरों का योग होता है।" },
        { title: "सभी लागतें शामिल", desc: "लागत, शिपिंग, शुल्क, छूट, रिफंड और विज्ञापन परिणाम से पहले घटाए जाते हैं।" },
        { title: "विज्ञापन के बाद लाभ", desc: "Meta, Google और TikTok का खर्च उन ऑर्डरों से जोड़ा जाता है जो उन्होंने बनाए।" },
        { title: "निर्धारित रिपोर्ट", desc: "साप्ताहिक और मासिक रिपोर्ट PDF या CSV में स्वतः भेजी जाती हैं, साझेदारों या लेखाकार के साथ साझा करने योग्य।" },
      ],
      steps: [
        { title: "Shopify कनेक्ट करें", desc: "OAuth से अपना स्टोर कनेक्ट करें। ऑर्डर स्वतः सिंक हो जाते हैं।" },
        { title: "अपनी वास्तविक लागतें डालें", desc: "लागत, शिपिंग और शुल्क एक बार सेट करें। पुराना इतिहास CSV से आयात किया जा सकता है।" },
        { title: "अपना वास्तविक लाभ देखें", desc: "प्रत्येक ऑर्डर सभी लागतों के बाद बची राशि दिखाता है।" },
      ],
      faqs: [
        { q: "वास्तविक शुद्ध लाभ कैसे निकाला जाता है?", a: "प्रति ऑर्डर: राजस्व में से लागत, शिपिंग, शुल्क, छूट, रिफंड और संबंधित विज्ञापन खर्च घटाकर। कुल योग प्रति ऑर्डर लाभ का योग होता है।" },
        { q: "आज़माने के लिए क्रेडिट कार्ड चाहिए?", a: "नहीं। आप पहले खाता बनाकर स्टोर कनेक्ट कर सकते हैं; वर्तमान प्लान मूल्य पृष्ठ पर देखें।" },
        { q: "क्या यह केवल Shopify के लिए है?", a: "लाइव सिंक डिज़ाइन के अनुसार केवल Shopify के लिए है। अन्य प्लेटफ़ॉर्म के पुराने ऑर्डर CSV से आयात किए जा सकते हैं।" },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify लाभ कैलकुलेटर — प्रति ऑर्डर वास्तविक शुद्ध लाभ",
          description: "अपना वास्तविक Shopify लाभ निकालें: राजस्व में से लागत, शुल्क, शिपिंग, छूट, रिफंड और विज्ञापन खर्च घटाकर, प्रति ऑर्डर और प्रति उत्पाद।",
          h1: "Shopify लाभ की ईमानदार गणना",
          intro: "Shopify राजस्व दिखाता है, लाभ नहीं। GetProfitCalc सिंक किए गए ऑर्डरों से लागत, शुल्क, शिपिंग, छूट, रिफंड और विज्ञापन खर्च स्वतः घटाकर प्रति ऑर्डर वास्तविक शुद्ध लाभ निकालता है।",
        },
        "shopify-profit-analytics": {
          title: "Shopify लाभ विश्लेषण — उत्पाद, देश और चैनल के अनुसार",
          description: "राजस्व से आगे Shopify लाभ विश्लेषण: उत्पाद, देश, चैनल और ग्राहक वर्ग के अनुसार लाभ, रुझान और अलर्ट सहित।",
          h1: "विश्लेषण जो बताता है कि लाभ क्यों बदला",
          intro: "राजस्व विश्लेषण बताता है कि क्या बिका। लाभ विश्लेषण बताता है कि किससे कमाई हुई। लाभ को उत्पाद, देश, स्टोर और ग्राहक वर्ग में बाँटें और बदलाव समय रहते पकड़ें।",
        },
        "shopify-cogs-tracker": {
          title: "Shopify लागत ट्रैकर — प्रति उत्पाद सटीक लागत",
          description: "Shopify लागत को उत्पाद और वेरिएंट के अनुसार ट्रैक करें, शिपिंग और अन्य लागतों सहित, ताकि हर लाभ आँकड़ा भरोसेमंद लागत पर टिका हो।",
          h1: "लाभ तभी सटीक है जब आपकी लागत सटीक हो",
          intro: "अधिकांश लाभ गलतियाँ लागत गलतियाँ होती हैं: पुराना आपूर्तिकर्ता मूल्य या बिना लागत वाला वेरिएंट। लागत केंद्र सभी लागतों को एक जगह रखता है और हर ऑर्डर पर स्वतः लागू करता है।",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify लाभ-हानि रिपोर्ट — स्प्रेडशीट के बिना P&L",
          description: "राजस्व, लागत, शुल्क, शिपिंग, विज्ञापन और शुद्ध लाभ सहित Shopify P&L रिपोर्ट बनाएँ, साझा करने, निर्यात करने और निर्धारित करने योग्य।",
          h1: "एक P&L रिपोर्ट जिसका आपका लेखाकार उपयोग कर सके",
          intro: "एक अच्छी P&L रिपोर्ट का मिलान होना चाहिए: चुनी अवधि के लिए राजस्व, हर लागत श्रेणी और बचा शुद्ध लाभ। GetProfitCalc इसे आपके ऑर्डरों और लागतों से बनाता है और PDF या CSV में निर्यात करता है।",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify विज्ञापन के बाद लाभ ट्रैकर — Meta, Google, TikTok",
          description: "Meta, Google और TikTok पर विज्ञापन के बाद Shopify लाभ को कैंपेन और क्रिएटिव के अनुसार ट्रैक करें, ताकि बजट लाभ का अनुसरण करे।",
          h1: "विज्ञापन के बाद लाभ एक निर्णय है, केवल संख्या नहीं",
          intro: "एक विज्ञापन ROAS पर लाभदायक लग सकता है, फिर भी लागत, शुल्क और शिपिंग के बाद घाटे में हो सकता है। GetProfitCalc खर्च को उन ऑर्डरों से जोड़ता है जो उसने बनाए और सभी लागतें घटाता है, कैंपेन और क्रिएटिव के अनुसार।",
        },
      },
    },
  },
  {
    code: "id",
    dict: {
      name: "Bahasa Indonesia",
      ogLocale: "id_ID",
      eyebrow: "Pelacakan laba untuk Shopify",
      breadcrumbHome: "Beranda",
      featuresHeading: "Apa yang ditawarkan GetProfitCalc",
      stepsHeading: "Cara kerja",
      faqHeading: "Pertanyaan umum",
      relatedHeading: "Halaman terkait",
      ctaTitle: "Ketahui laba asli Anda, bukan hanya pendapatan",
      ctaText: "Hubungkan Shopify dan lihat laba per pesanan, dengan semua biaya sudah termasuk.",
      ctaPrimary: "Mulai gratis",
      ctaSecondary: "Lihat harga",
      home: {
        title: "GetProfitCalc — Laba asli untuk Shopify",
        description: "Hitung laba asli Shopify Anda: pendapatan dikurangi COGS, biaya, pengiriman, diskon, pengembalian dana, dan iklan, per pesanan dan per produk.",
        h1: "Laba asli Shopify Anda, tanpa spreadsheet",
        intro: "Shopify menampilkan pendapatan, bukan laba. GetProfitCalc menyinkronkan pesanan Anda dan mengurangi semua biaya, sehingga Anda melihat berapa yang benar-benar Anda hasilkan dari setiap pesanan dan produk.",
      },
      features: [
        { title: "Laba per pesanan dan produk", desc: "Setiap pesanan menampilkan pendapatan dikurangi semua biaya, dan total adalah jumlah dari pesanan." },
        { title: "Semua biaya termasuk", desc: "COGS, pengiriman, biaya, diskon, pengembalian dana, dan iklan dikurangi sebelum hasil." },
        { title: "Laba setelah iklan", desc: "Pengeluaran Meta, Google, dan TikTok dikaitkan dengan pesanan yang dihasilkannya." },
        { title: "Laporan terjadwal", desc: "Laporan mingguan dan bulanan dalam PDF atau CSV, siap dibagikan kepada mitra atau akuntan." },
      ],
      steps: [
        { title: "Hubungkan Shopify", desc: "Hubungkan toko Anda dengan OAuth. Pesanan tersinkron otomatis." },
        { title: "Masukkan biaya asli Anda", desc: "Atur COGS, pengiriman, dan biaya sekali saja. Riwayat dapat diimpor lewat CSV." },
        { title: "Lihat laba asli Anda", desc: "Setiap pesanan menunjukkan sisa setelah semua biaya." },
      ],
      faqs: [
        { q: "Bagaimana laba bersih asli dihitung?", a: "Per pesanan: pendapatan dikurangi COGS, pengiriman, biaya, diskon, pengembalian dana, dan iklan yang dikaitkan. Total adalah jumlah laba per pesanan." },
        { q: "Apakah saya perlu kartu kredit untuk mencoba?", a: "Tidak. Anda dapat membuat akun dan menghubungkan toko terlebih dahulu; lihat halaman harga untuk paket saat ini." },
        { q: "Apakah ini hanya untuk Shopify?", a: "Sinkronisasi langsung memang dirancang hanya untuk Shopify. Platform lain dapat mengimpor pesanan lama lewat CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Kalkulator Laba Shopify — Laba Bersih Asli per Pesanan",
          description: "Hitung laba asli Shopify Anda: pendapatan dikurangi COGS, biaya, pengiriman, diskon, pengembalian dana, dan iklan, per pesanan dan per produk.",
          h1: "Laba Shopify Anda, dihitung dengan jujur",
          intro: "Shopify menampilkan pendapatan, bukan laba. GetProfitCalc menghitung laba bersih asli per pesanan dengan mengurangi COGS, biaya, pengiriman, diskon, pengembalian dana, dan iklan secara otomatis dari pesanan yang tersinkron.",
        },
        "shopify-profit-analytics": {
          title: "Analitik Laba Shopify — Per Produk, Negara, dan Saluran",
          description: "Analitik laba Shopify melampaui pendapatan: laba per produk, negara, saluran, dan segmen pelanggan, dengan tren dan peringatan.",
          h1: "Analitik yang menjelaskan mengapa laba Anda berubah",
          intro: "Analitik pendapatan memberi tahu apa yang terjual. Analitik laba memberi tahu apa yang menghasilkan uang. Bagi laba per produk, negara, toko, dan segmen pelanggan, dan tangkap perubahan tepat waktu.",
        },
        "shopify-cogs-tracker": {
          title: "Pelacak COGS Shopify — Biaya Akurat per Produk",
          description: "Lacak COGS Shopify per produk dan varian, termasuk pengiriman dan biaya lain, sehingga setiap angka laba bertumpu pada biaya yang dapat diandalkan.",
          h1: "Laba hanya akurat jika COGS Anda akurat",
          intro: "Sebagian besar kesalahan laba adalah kesalahan COGS: harga pemasok yang kedaluwarsa atau varian tanpa biaya. Pusat COGS menyimpan semua biaya di satu tempat dan menerapkannya otomatis ke setiap pesanan.",
        },
        "shopify-profit-and-loss-report": {
          title: "Laporan Laba Rugi Shopify — P&L Tanpa Spreadsheet",
          description: "Buat laporan P&L Shopify dengan pendapatan, COGS, biaya, pengiriman, iklan, dan laba bersih — siap dibagikan, diekspor, dan dijadwalkan.",
          h1: "Laporan P&L yang dapat digunakan akuntan Anda",
          intro: "Laporan P&L yang baik harus seimbang: pendapatan, setiap kategori biaya, dan sisa bersih, untuk periode yang dipilih. GetProfitCalc membangunnya dari pesanan dan biaya Anda, dan mengekspornya sebagai PDF atau CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Pelacak Laba Setelah Iklan Shopify — Meta, Google, TikTok",
          description: "Lacak laba Shopify setelah iklan di Meta, Google, dan TikTok, per kampanye dan per materi iklan, agar anggaran mengikuti laba.",
          h1: "Laba setelah iklan adalah keputusan, bukan sekadar angka",
          intro: "Sebuah iklan bisa terlihat menguntungkan dari ROAS namun merugi setelah COGS, biaya, dan pengiriman. GetProfitCalc mengaitkan pengeluaran dengan pesanan yang dihasilkannya dan mengurangi semua biaya, per kampanye dan per materi iklan.",
        },
      },
    },
  },
  {
    code: "pl",
    dict: {
      name: "Polski",
      ogLocale: "pl_PL",
      eyebrow: "Śledzenie zysków dla Shopify",
      breadcrumbHome: "Strona główna",
      featuresHeading: "Co oferuje GetProfitCalc",
      stepsHeading: "Jak to działa",
      faqHeading: "Częste pytania",
      relatedHeading: "Powiązane strony",
      ctaTitle: "Poznaj swój prawdziwy zysk, nie tylko przychody",
      ctaText: "Połącz Shopify i zobacz zysk na zamówienie, ze wszystkimi kosztami wliczonymi.",
      ctaPrimary: "Zacznij za darmo",
      ctaSecondary: "Zobacz ceny",
      home: {
        title: "GetProfitCalc — Prawdziwy zysk dla Shopify",
        description: "Oblicz swój prawdziwy zysk Shopify: przychody minus COGS, opłaty, wysyłka, rabaty, zwroty i reklama, na zamówienie i na produkt.",
        h1: "Twój prawdziwy zysk Shopify, bez arkuszy kalkulacyjnych",
        intro: "Shopify pokazuje przychody, nie zysk. GetProfitCalc synchronizuje Twoje zamówienia i odejmuje wszystkie koszty, dzięki czemu widzisz, ile naprawdę zarobiłeś na każdym zamówieniu i produkcie.",
      },
      features: [
        { title: "Zysk na zamówienie i produkt", desc: "Każde zamówienie pokazuje przychody minus wszystkie koszty, a sumy są sumą zamówień." },
        { title: "Wszystkie koszty wliczone", desc: "COGS, wysyłka, opłaty, rabaty, zwroty i reklama są odejmowane przed wynikiem." },
        { title: "Zysk po reklamie", desc: "Wydatki na Meta, Google i TikTok są przypisywane zamówieniom, które wygenerowały." },
        { title: "Raporty zaplanowane", desc: "Raporty tygodniowe i miesięczne w PDF lub CSV, gotowe do udostępnienia partnerom lub księgowemu." },
      ],
      steps: [
        { title: "Połącz Shopify", desc: "Połącz sklep przez OAuth. Zamówienia synchronizują się automatycznie." },
        { title: "Dodaj swoje prawdziwe koszty", desc: "Ustaw COGS, wysyłkę i opłaty raz. Historię można zaimportować przez CSV." },
        { title: "Zobacz swój prawdziwy zysk", desc: "Każde zamówienie pokazuje, ile zostało po wszystkich kosztach." },
      ],
      faqs: [
        { q: "Jak obliczany jest prawdziwy zysk netto?", a: "Na zamówienie: przychody minus COGS, wysyłka, opłaty, rabaty, zwroty i przypisana reklama. Sumy są sumą zysków na zamówienie." },
        { q: "Czy potrzebuję karty, aby wypróbować?", a: "Nie. Możesz najpierw utworzyć konto i połączyć sklep; aktualne plany znajdziesz na stronie cen." },
        { q: "Czy to działa tylko z Shopify?", a: "Synchronizacja na żywo jest z założenia tylko dla Shopify. Inne platformy mogą importować starsze zamówienia przez CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Kalkulator zysku Shopify — Prawdziwy zysk netto na zamówienie",
          description: "Oblicz swój prawdziwy zysk Shopify: przychody minus COGS, opłaty, wysyłka, rabaty, zwroty i reklama, na zamówienie i na produkt.",
          h1: "Twój zysk Shopify, obliczony uczciwie",
          intro: "Shopify pokazuje przychody, nie zysk. GetProfitCalc oblicza prawdziwy zysk netto na zamówienie, odejmując COGS, opłaty, wysyłkę, rabaty, zwroty i reklamę automatycznie z zsynchronizowanych zamówień.",
        },
        "shopify-profit-analytics": {
          title: "Analityka zysków Shopify — Według produktu, kraju i kanału",
          description: "Analityka zysków Shopify wykraczająca poza przychody: zysk według produktu, kraju, kanału i segmentu klientów, z trendami i alertami.",
          h1: "Analityka, która wyjaśnia, dlaczego zysk się zmienił",
          intro: "Analityka przychodów mówi, co się sprzedało. Analityka zysków mówi, co zarobiło. Podziel zysk według produktu, kraju, sklepu i segmentu klientów i wychwytuj zmiany na czas.",
        },
        "shopify-cogs-tracker": {
          title: "Śledzenie COGS dla Shopify — Dokładne koszty na produkt",
          description: "Śledź COGS Shopify na produkt i wariant, z wysyłką i innymi kosztami, aby każda liczba zysku opierała się na wiarygodnych kosztach.",
          h1: "Zysk jest dokładny tylko wtedy, gdy dokładny jest Twój COGS",
          intro: "Większość błędów zysku to błędy COGS: nieaktualna cena dostawcy lub wariant bez kosztu. Centrum COGS trzyma wszystkie koszty w jednym miejscu i stosuje je automatycznie do każdego zamówienia.",
        },
        "shopify-profit-and-loss-report": {
          title: "Raport zysków i strat Shopify — P&L bez arkuszy kalkulacyjnych",
          description: "Wygeneruj raport P&L Shopify z przychodami, COGS, opłatami, wysyłką, reklamą i zyskiem netto — gotowy do udostępnienia, eksportu i zaplanowania.",
          h1: "Raport P&L, z którego może korzystać Twój księgowy",
          intro: "Dobry raport P&L musi się zgadzać: przychody, każda kategoria kosztów i pozostała kwota netto, za wybrany okres. GetProfitCalc buduje go z Twoich zamówień i kosztów oraz eksportuje jako PDF lub CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Zysk po reklamie w Shopify — Meta, Google i TikTok",
          description: "Śledź zysk Shopify po reklamie na Meta, Google i TikTok, na kampanię i kreację, aby budżet podążał za zyskiem.",
          h1: "Zysk po reklamie to decyzja, nie tylko liczba",
          intro: "Reklama może wyglądać na opłacalną według ROAS, a mimo to tracić po COGS, opłatach i wysyłce. GetProfitCalc przypisuje wydatki zamówieniom, które wygenerowały, i odejmuje wszystkie koszty, na kampanię i kreację.",
        },
      },
    },
  },
  {
    code: "sv",
    dict: {
      name: "Svenska",
      ogLocale: "sv_SE",
      eyebrow: "Vinstspårning för Shopify",
      breadcrumbHome: "Hem",
      featuresHeading: "Vad GetProfitCalc erbjuder",
      stepsHeading: "Så fungerar det",
      faqHeading: "Vanliga frågor",
      relatedHeading: "Relaterade sidor",
      ctaTitle: "Känn till din verkliga vinst, inte bara din omsättning",
      ctaText: "Anslut Shopify och se vinsten per order, med alla kostnader inkluderade.",
      ctaPrimary: "Börja gratis",
      ctaSecondary: "Se priser",
      home: {
        title: "GetProfitCalc — Verklig vinst för Shopify",
        description: "Beräkna din verkliga Shopify-vinst: intäkter minus COGS, avgifter, frakt, rabatter, returer och annonsering, per order och per produkt.",
        h1: "Din verkliga Shopify-vinst, utan kalkylblad",
        intro: "Shopify visar omsättning, inte vinst. GetProfitCalc synkroniserar dina ordrar och drar av alla kostnader, så att du ser vad du verkligen tjänade på varje order och produkt.",
      },
      features: [
        { title: "Vinst per order och produkt", desc: "Varje order visar intäkter minus alla kostnader, och summorna är summan av ordrarna." },
        { title: "Alla kostnader inkluderade", desc: "COGS, frakt, avgifter, rabatter, returer och annonsering dras av före resultatet." },
        { title: "Vinst efter annonsering", desc: "Utgifter för Meta, Google och TikTok tillskrivs de ordrar de genererade." },
        { title: "Schemalagda rapporter", desc: "Vecko- och månadsrapporter som PDF eller CSV, redo att delas med partners eller revisorer." },
      ],
      steps: [
        { title: "Anslut Shopify", desc: "Anslut din butik via OAuth. Ordrar synkroniseras automatiskt." },
        { title: "Lägg till dina verkliga kostnader", desc: "Ställ in COGS, frakt och avgifter en gång. Historik kan importeras via CSV." },
        { title: "Se din verkliga vinst", desc: "Varje order visar vad som återstår efter alla kostnader." },
      ],
      faqs: [
        { q: "Hur beräknas den verkliga nettovinsten?", a: "Per order: intäkter minus COGS, frakt, avgifter, rabatter, returer och tillskriven annonsering. Summorna är summan av vinsten per order." },
        { q: "Behöver jag ett kort för att prova?", a: "Nej. Du kan först skapa ett konto och ansluta din butik; aktuella planer finns på prissidan." },
        { q: "Fungerar det bara med Shopify?", a: "Livesynkronisering är avsiktligt bara för Shopify. Andra plattformar kan importera äldre ordrar via CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-vinstkalkylator — Verklig nettovinst per order",
          description: "Beräkna din verkliga Shopify-vinst: intäkter minus COGS, avgifter, frakt, rabatter, returer och annonsering, per order och per produkt.",
          h1: "Din Shopify-vinst, ärligt beräknad",
          intro: "Shopify visar omsättning, inte vinst. GetProfitCalc beräknar den verkliga nettovinsten per order genom att automatiskt dra av COGS, avgifter, frakt, rabatter, returer och annonsering från dina synkroniserade ordrar.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-vinstanalys — Per produkt, land och kanal",
          description: "Shopify-vinstanalys bortom omsättning: vinst per produkt, land, kanal och kundsegment, med trender och aviseringar.",
          h1: "Analys som förklarar varför din vinst förändrades",
          intro: "Omsättningsanalys säger vad som såldes. Vinstanalys säger vad som tjänade pengar. Dela upp vinsten per produkt, land, butik och kundsegment, och fånga förändringar i tid.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-spårare — Exakta kostnader per produkt",
          description: "Spåra Shopify-COGS per produkt och variant, inklusive frakt och andra kostnader, så att varje vinstsiffra vilar på tillförlitliga kostnader.",
          h1: "Vinsten är bara exakt om din COGS är det",
          intro: "De flesta vinstfel är COGS-fel: ett föråldrat leverantörspris eller en variant utan kostnad. COGS-centret håller alla kostnader på ett ställe och tillämpar dem automatiskt på varje order.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-resultatrapport — P&L utan kalkylblad",
          description: "Skapa en Shopify-P&L-rapport med intäkter, COGS, avgifter, frakt, annonsering och nettovinst — redo att delas, exporteras och schemaläggas.",
          h1: "En P&L-rapport som din revisor kan använda",
          intro: "En bra P&L-rapport måste stämma: intäkter, varje kostnadskategori och det återstående nettot, för den valda perioden. GetProfitCalc bygger den från dina ordrar och kostnader och exporterar den som PDF eller CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-vinst efter annonsering — Meta, Google och TikTok",
          description: "Spåra Shopify-vinsten efter annonsering på Meta, Google och TikTok, per kampanj och annonsmaterial, så att budgeten följer vinsten.",
          h1: "Vinst efter annonsering är ett beslut, inte bara en siffra",
          intro: "En annons kan se lönsam ut enligt ROAS men ändå förlora pengar efter COGS, avgifter och frakt. GetProfitCalc tillskriver utgifter till de ordrar de genererade och drar av alla kostnader, per kampanj och annonsmaterial.",
        },
      },
    },
  },
  {
    code: "da",
    dict: {
      name: "Dansk",
      ogLocale: "da_DK",
      eyebrow: "Profitsporing til Shopify",
      breadcrumbHome: "Hjem",
      featuresHeading: "Hvad GetProfitCalc tilbyder",
      stepsHeading: "Sådan fungerer det",
      faqHeading: "Ofte stillede spørgsmål",
      relatedHeading: "Relaterede sider",
      ctaTitle: "Kend din reelle profit, ikke kun din omsætning",
      ctaText: "Tilslut Shopify og se profitten pr. ordre, med alle omkostninger inkluderet.",
      ctaPrimary: "Start gratis",
      ctaSecondary: "Se priser",
      home: {
        title: "GetProfitCalc — Reel profit til Shopify",
        description: "Beregn din reelle Shopify-profit: omsætning minus COGS, gebyrer, fragt, rabatter, returneringer og annoncering, pr. ordre og pr. produkt.",
        h1: "Din reelle Shopify-profit, uden regneark",
        intro: "Shopify viser omsætning, ikke profit. GetProfitCalc synkroniserer dine ordrer og trækker alle omkostninger fra, så du kan se, hvad du reelt tjente på hver ordre og hvert produkt.",
      },
      features: [
        { title: "Profit pr. ordre og produkt", desc: "Hver ordre viser omsætning minus alle omkostninger, og totalerne er summen af ordrerne." },
        { title: "Alle omkostninger inkluderet", desc: "COGS, fragt, gebyrer, rabatter, returneringer og annoncering trækkes fra før resultatet." },
        { title: "Profit efter annoncering", desc: "Udgifter til Meta, Google og TikTok tilskrives de ordrer, de genererede." },
        { title: "Planlagte rapporter", desc: "Ugentlige og månedlige rapporter som PDF eller CSV, klar til at dele med partnere eller revisorer." },
      ],
      steps: [
        { title: "Tilslut Shopify", desc: "Tilslut din butik via OAuth. Ordrer synkroniseres automatisk." },
        { title: "Tilføj dine reelle omkostninger", desc: "Indstil COGS, fragt og gebyrer én gang. Historik kan importeres via CSV." },
        { title: "Se din reelle profit", desc: "Hver ordre viser, hvad der er tilbage efter alle omkostninger." },
      ],
      faqs: [
        { q: "Hvordan beregnes den reelle nettoprofit?", a: "Pr. ordre: omsætning minus COGS, fragt, gebyrer, rabatter, returneringer og tilskrevet annoncering. Totalerne er summen af profitten pr. ordre." },
        { q: "Skal jeg bruge et kort for at prøve?", a: "Nej. Du kan først oprette en konto og tilslutte din butik; aktuelle planer findes på prissiden." },
        { q: "Virker det kun med Shopify?", a: "Live-synkronisering er bevidst kun til Shopify. Andre platforme kan importere ældre ordrer via CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-profitberegner — Reel nettoprofit pr. ordre",
          description: "Beregn din reelle Shopify-profit: omsætning minus COGS, gebyrer, fragt, rabatter, returneringer og annoncering, pr. ordre og pr. produkt.",
          h1: "Din Shopify-profit, beregnet ærligt",
          intro: "Shopify viser omsætning, ikke profit. GetProfitCalc beregner den reelle nettoprofit pr. ordre ved automatisk at trække COGS, gebyrer, fragt, rabatter, returneringer og annoncering fra dine synkroniserede ordrer.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-profitanalyse — Pr. produkt, land og kanal",
          description: "Shopify-profitanalyse ud over omsætning: profit pr. produkt, land, kanal og kundesegment, med tendenser og advarsler.",
          h1: "Analyse, der forklarer, hvorfor din profit ændrede sig",
          intro: "Omsætningsanalyse fortæller, hvad der blev solgt. Profitanalyse fortæller, hvad der tjente penge. Opdel profitten pr. produkt, land, butik og kundesegment, og fang ændringer i tide.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-tracker — Præcise omkostninger pr. produkt",
          description: "Spor Shopify-COGS pr. produkt og variant, inklusive fragt og andre omkostninger, så hvert profittal hviler på pålidelige omkostninger.",
          h1: "Profitten er kun præcis, hvis din COGS er det",
          intro: "De fleste profitfejl er COGS-fejl: en forældet leverandørpris eller en variant uden omkostning. COGS-centret holder alle omkostninger ét sted og anvender dem automatisk på hver ordre.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-resultatrapport — P&L uden regneark",
          description: "Opret en Shopify-P&L-rapport med omsætning, COGS, gebyrer, fragt, annoncering og nettoprofit — klar til at dele, eksportere og planlægge.",
          h1: "En P&L-rapport, som din revisor kan bruge",
          intro: "En god P&L-rapport skal stemme: omsætning, hver omkostningskategori og det resterende netto, for den valgte periode. GetProfitCalc bygger den ud fra dine ordrer og omkostninger og eksporterer den som PDF eller CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-profit efter annoncering — Meta, Google og TikTok",
          description: "Spor Shopify-profitten efter annoncering på Meta, Google og TikTok, pr. kampagne og kreativ, så budgettet følger profitten.",
          h1: "Profit efter annoncering er en beslutning, ikke bare et tal",
          intro: "En annonce kan se profitabel ud målt på ROAS og alligevel tabe penge efter COGS, gebyrer og fragt. GetProfitCalc tilskriver udgifter til de ordrer, de genererede, og trækker alle omkostninger fra, pr. kampagne og kreativ.",
        },
      },
    },
  },
  {
    code: "fi",
    dict: {
      name: "Suomi",
      ogLocale: "fi_FI",
      eyebrow: "Voiton seuranta Shopifysta varten",
      breadcrumbHome: "Etusivu",
      featuresHeading: "Mitä GetProfitCalc tarjoaa",
      stepsHeading: "Näin se toimii",
      faqHeading: "Usein kysytyt kysymykset",
      relatedHeading: "Aiheeseen liittyvät sivut",
      ctaTitle: "Tunne todellinen voittosi, älä vain liikevaihtoasi",
      ctaText: "Yhdistä Shopify ja näe voitto tilausta kohti, kaikki kustannukset mukaan lukien.",
      ctaPrimary: "Aloita ilmaiseksi",
      ctaSecondary: "Katso hinnat",
      home: {
        title: "GetProfitCalc — Todellinen voitto Shopifysta",
        description: "Laske todellinen Shopify-voittosi: liikevaihto miinus COGS, maksut, toimitus, alennukset, palautukset ja mainonta, tilausta ja tuotetta kohti.",
        h1: "Todellinen Shopify-voittosi ilman taulukoita",
        intro: "Shopify näyttää liikevaihdon, ei voittoa. GetProfitCalc synkronoi tilauksesi ja vähentää kaikki kustannukset, jotta näet, mitä todella ansaitsit jokaisesta tilauksesta ja tuotteesta.",
      },
      features: [
        { title: "Voitto tilausta ja tuotetta kohti", desc: "Jokainen tilaus näyttää liikevaihdon miinus kaikki kustannukset, ja summat ovat tilausten summa." },
        { title: "Kaikki kustannukset mukana", desc: "COGS, toimitus, maksut, alennukset, palautukset ja mainonta vähennetään ennen tulosta." },
        { title: "Voitto mainonnan jälkeen", desc: "Metan, Googlen ja TikTokin kulut kohdistetaan tilauksiin, jotka ne toivat." },
        { title: "Ajastetut raportit", desc: "Viikoittaiset ja kuukausittaiset raportit PDF- tai CSV-muodossa, valmiina jaettavaksi kumppaneille tai kirjanpitäjille." },
      ],
      steps: [
        { title: "Yhdistä Shopify", desc: "Yhdistä kauppasi OAuthin avulla. Tilaukset synkronoituvat automaattisesti." },
        { title: "Lisää todelliset kustannuksesi", desc: "Aseta COGS, toimitus ja maksut kerran. Historia voidaan tuoda CSV-tiedostolla." },
        { title: "Näe todellinen voittosi", desc: "Jokainen tilaus näyttää, mitä kaikkien kustannusten jälkeen jää jäljelle." },
      ],
      faqs: [
        { q: "Miten todellinen nettovoitto lasketaan?", a: "Tilausta kohti: liikevaihto miinus COGS, toimitus, maksut, alennukset, palautukset ja kohdistettu mainonta. Summat ovat tilauskohtaisten voittojen summa." },
        { q: "Tarvitsenko korttia kokeiluun?", a: "Et. Voit ensin luoda tilin ja yhdistää kauppasi; ajankohtaiset paketit löytyvät hintasivulta." },
        { q: "Toimiiko se vain Shopifyssa?", a: "Reaaliaikainen synkronointi on tarkoituksella vain Shopifylle. Muut alustat voivat tuoda vanhempia tilauksia CSV-tiedostolla." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-voittolaskuri — Todellinen nettovoitto tilausta kohti",
          description: "Laske todellinen Shopify-voittosi: liikevaihto miinus COGS, maksut, toimitus, alennukset, palautukset ja mainonta, tilausta ja tuotetta kohti.",
          h1: "Shopify-voittosi, rehellisesti laskettuna",
          intro: "Shopify näyttää liikevaihdon, ei voittoa. GetProfitCalc laskee todellisen nettovoiton tilausta kohti vähentämällä automaattisesti COGSin, maksut, toimituksen, alennukset, palautukset ja mainonnan synkronoiduista tilauksistasi.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-voittoanalyysi — Tuotteen, maan ja kanavan mukaan",
          description: "Shopify-voittoanalyysi liikevaihdon tuolla puolen: voitto tuotteen, maan, kanavan ja asiakassegmentin mukaan, trendeineen ja hälytyksineen.",
          h1: "Analyysi, joka selittää, miksi voittosi muuttui",
          intro: "Liikevaihtoanalyysi kertoo, mitä myytiin. Voittoanalyysi kertoo, mikä toi rahaa. Jaa voitto tuotteen, maan, kaupan ja asiakassegmentin mukaan ja havaitse muutokset ajoissa.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-seuranta — Tarkat kustannukset tuotetta kohti",
          description: "Seuraa Shopify-COGSia tuotetta ja varianttia kohti, toimitus ja muut kustannukset mukaan lukien, jotta jokainen voittoluku perustuu luotettaviin kustannuksiin.",
          h1: "Voitto on tarkka vain, jos COGSisi on tarkka",
          intro: "Useimmat voittovirheet ovat COGS-virheitä: vanhentunut toimittajahinta tai variantti ilman kustannusta. COGS-keskus pitää kaikki kustannukset yhdessä paikassa ja soveltaa ne automaattisesti jokaiseen tilaukseen.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-tulosraportti — P&L ilman taulukoita",
          description: "Luo Shopify-P&L-raportti, jossa on liikevaihto, COGS, maksut, toimitus, mainonta ja nettovoitto — valmis jaettavaksi, vietäväksi ja ajastettavaksi.",
          h1: "P&L-raportti, jota kirjanpitäjäsi voi käyttää",
          intro: "Hyvän P&L-raportin on täsmättävä: liikevaihto, jokainen kustannusluokka ja jäljelle jäävä netto valitulla ajanjaksolla. GetProfitCalc rakentaa sen tilauksistasi ja kustannuksistasi ja vie sen PDF- tai CSV-muodossa.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-voitto mainonnan jälkeen — Meta, Google ja TikTok",
          description: "Seuraa Shopify-voittoa mainonnan jälkeen Metassa, Googlessa ja TikTokissa, kampanjan ja mainosmateriaalin mukaan, jotta budjetti seuraa voittoa.",
          h1: "Voitto mainonnan jälkeen on päätös, ei vain luku",
          intro: "Mainos voi näyttää ROASin perusteella kannattavalta, mutta menettää rahaa COGSin, maksujen ja toimituksen jälkeen. GetProfitCalc kohdistaa kulut tilauksiin, jotka ne toivat, ja vähentää kaikki kustannukset kampanjan ja mainosmateriaalin mukaan.",
        },
      },
    },
  },
  {
    code: "nb",
    dict: {
      name: "Norsk",
      ogLocale: "nb_NO",
      eyebrow: "Profittsporing for Shopify",
      breadcrumbHome: "Hjem",
      featuresHeading: "Hva GetProfitCalc tilbyr",
      stepsHeading: "Slik fungerer det",
      faqHeading: "Ofte stilte spørsmål",
      relatedHeading: "Relaterte sider",
      ctaTitle: "Kjenn din reelle profitt, ikke bare omsetningen",
      ctaText: "Koble til Shopify og se profitten per ordre, med alle kostnader inkludert.",
      ctaPrimary: "Start gratis",
      ctaSecondary: "Se priser",
      home: {
        title: "GetProfitCalc — Reell profitt for Shopify",
        description: "Beregn din reelle Shopify-profitt: omsetning minus COGS, gebyrer, frakt, rabatter, returer og annonsering, per ordre og per produkt.",
        h1: "Din reelle Shopify-profitt, uten regneark",
        intro: "Shopify viser omsetning, ikke profitt. GetProfitCalc synkroniserer ordrene dine og trekker fra alle kostnader, slik at du ser hva du faktisk tjente på hver ordre og hvert produkt.",
      },
      features: [
        { title: "Profitt per ordre og produkt", desc: "Hver ordre viser omsetning minus alle kostnader, og summene er summen av ordrene." },
        { title: "Alle kostnader inkludert", desc: "COGS, frakt, gebyrer, rabatter, returer og annonsering trekkes fra før resultatet." },
        { title: "Profitt etter annonsering", desc: "Utgifter til Meta, Google og TikTok tilskrives ordrene de skapte." },
        { title: "Planlagte rapporter", desc: "Ukentlige og månedlige rapporter som PDF eller CSV, klare til å deles med partnere eller regnskapsførere." },
      ],
      steps: [
        { title: "Koble til Shopify", desc: "Koble til butikken din via OAuth. Ordrer synkroniseres automatisk." },
        { title: "Legg til dine reelle kostnader", desc: "Sett COGS, frakt og gebyrer én gang. Historikk kan importeres via CSV." },
        { title: "Se din reelle profitt", desc: "Hver ordre viser hva som er igjen etter alle kostnader." },
      ],
      faqs: [
        { q: "Hvordan beregnes den reelle nettoprofitten?", a: "Per ordre: omsetning minus COGS, frakt, gebyrer, rabatter, returer og tilskrevet annonsering. Summene er summen av profitten per ordre." },
        { q: "Trenger jeg kort for å prøve?", a: "Nei. Du kan først opprette en konto og koble til butikken; aktuelle planer finner du på prissiden." },
        { q: "Fungerer det bare med Shopify?", a: "Live-synkronisering er bevisst bare for Shopify. Andre plattformer kan importere eldre ordrer via CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify-profittkalkulator — Reell nettoprofitt per ordre",
          description: "Beregn din reelle Shopify-profitt: omsetning minus COGS, gebyrer, frakt, rabatter, returer og annonsering, per ordre og per produkt.",
          h1: "Din Shopify-profitt, beregnet ærlig",
          intro: "Shopify viser omsetning, ikke profitt. GetProfitCalc beregner den reelle nettoprofitten per ordre ved automatisk å trekke fra COGS, gebyrer, frakt, rabatter, returer og annonsering fra dine synkroniserte ordrer.",
        },
        "shopify-profit-analytics": {
          title: "Shopify-profittanalyse — Per produkt, land og kanal",
          description: "Shopify-profittanalyse utover omsetning: profitt per produkt, land, kanal og kundesegment, med trender og varsler.",
          h1: "Analyse som forklarer hvorfor profitten din endret seg",
          intro: "Omsetningsanalyse forteller hva som ble solgt. Profittanalyse forteller hva som tjente penger. Del profitten per produkt, land, butikk og kundesegment, og fang endringer i tide.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify-COGS-sporing — Nøyaktige kostnader per produkt",
          description: "Spor Shopify-COGS per produkt og variant, inkludert frakt og andre kostnader, slik at hvert profittall hviler på pålitelige kostnader.",
          h1: "Profitten er bare nøyaktig hvis COGSen din er det",
          intro: "De fleste profittfeil er COGS-feil: en utdatert leverandørpris eller en variant uten kostnad. COGS-senteret holder alle kostnader på ett sted og bruker dem automatisk på hver ordre.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify-resultatrapport — P&L uten regneark",
          description: "Lag en Shopify-P&L-rapport med omsetning, COGS, gebyrer, frakt, annonsering og nettoprofitt — klar til å deles, eksporteres og planlegges.",
          h1: "En P&L-rapport som regnskapsføreren din kan bruke",
          intro: "En god P&L-rapport må stemme: omsetning, hver kostnadskategori og det gjenværende netto, for den valgte perioden. GetProfitCalc bygger den fra ordrene og kostnadene dine og eksporterer den som PDF eller CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify-profitt etter annonsering — Meta, Google og TikTok",
          description: "Spor Shopify-profitten etter annonsering på Meta, Google og TikTok, per kampanje og kreativ, slik at budsjettet følger profitten.",
          h1: "Profitt etter annonsering er en beslutning, ikke bare et tall",
          intro: "En annonse kan se lønnsom ut målt i ROAS, men likevel tape penger etter COGS, gebyrer og frakt. GetProfitCalc tilskriver utgifter til ordrene de skapte og trekker fra alle kostnader, per kampanje og kreativ.",
        },
      },
    },
  },
  {
    code: "cs",
    dict: {
      name: "Čeština",
      ogLocale: "cs_CZ",
      eyebrow: "Sledování zisku pro Shopify",
      breadcrumbHome: "Domů",
      featuresHeading: "Co nabízí GetProfitCalc",
      stepsHeading: "Jak to funguje",
      faqHeading: "Časté dotazy",
      relatedHeading: "Související stránky",
      ctaTitle: "Poznejte svůj skutečný zisk, ne jen tržby",
      ctaText: "Připojte Shopify a zobrazte zisk na objednávku se všemi započítanými náklady.",
      ctaPrimary: "Začít zdarma",
      ctaSecondary: "Zobrazit ceny",
      home: {
        title: "GetProfitCalc — Skutečný zisk pro Shopify",
        description: "Spočítejte si svůj skutečný zisk na Shopify: tržby minus COGS, poplatky, doprava, slevy, vrácení a reklama, na objednávku i na produkt.",
        h1: "Váš skutečný zisk na Shopify, bez tabulek",
        intro: "Shopify ukazuje tržby, ne zisk. GetProfitCalc synchronizuje vaše objednávky a odečítá všechny náklady, takže vidíte, kolik jste skutečně vydělali na každé objednávce a produktu.",
      },
      features: [
        { title: "Zisk na objednávku a produkt", desc: "Každá objednávka ukazuje tržby minus všechny náklady a součty jsou součtem objednávek." },
        { title: "Všechny náklady započítány", desc: "COGS, doprava, poplatky, slevy, vrácení a reklama se odečítají před výsledkem." },
        { title: "Zisk po reklamě", desc: "Výdaje na Meta, Google a TikTok se přiřazují objednávkám, které vygenerovaly." },
        { title: "Naplánované reporty", desc: "Týdenní a měsíční reporty ve formátu PDF nebo CSV, připravené ke sdílení s partnery či účetními." },
      ],
      steps: [
        { title: "Připojte Shopify", desc: "Připojte obchod přes OAuth. Objednávky se synchronizují automaticky." },
        { title: "Přidejte své skutečné náklady", desc: "Nastavte COGS, dopravu a poplatky jednou. Historii lze importovat přes CSV." },
        { title: "Zobrazte si svůj skutečný zisk", desc: "Každá objednávka ukazuje, kolik zbývá po všech nákladech." },
      ],
      faqs: [
        { q: "Jak se počítá skutečný čistý zisk?", a: "Na objednávku: tržby minus COGS, doprava, poplatky, slevy, vrácení a přiřazená reklama. Součty jsou součtem zisků na objednávku." },
        { q: "Potřebuji k vyzkoušení kartu?", a: "Ne. Nejprve si můžete vytvořit účet a připojit obchod; aktuální plány najdete na stránce s cenami." },
        { q: "Funguje to jen se Shopify?", a: "Živá synchronizace je záměrně jen pro Shopify. Ostatní platformy mohou importovat starší objednávky přes CSV." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Kalkulačka zisku Shopify — Skutečný čistý zisk na objednávku",
          description: "Spočítejte si svůj skutečný zisk na Shopify: tržby minus COGS, poplatky, doprava, slevy, vrácení a reklama, na objednávku i na produkt.",
          h1: "Váš zisk na Shopify, spočítaný poctivě",
          intro: "Shopify ukazuje tržby, ne zisk. GetProfitCalc počítá skutečný čistý zisk na objednávku tak, že automaticky odečítá COGS, poplatky, dopravu, slevy, vrácení a reklamu ze synchronizovaných objednávek.",
        },
        "shopify-profit-analytics": {
          title: "Analýza zisku Shopify — Podle produktu, země a kanálu",
          description: "Analýza zisku Shopify nad rámec tržeb: zisk podle produktu, země, kanálu a segmentu zákazníků, s trendy a upozorněními.",
          h1: "Analýza, která vysvětlí, proč se váš zisk změnil",
          intro: "Analýza tržeb říká, co se prodalo. Analýza zisku říká, co vydělalo. Rozdělte zisk podle produktu, země, obchodu a segmentu zákazníků a zachyťte změny včas.",
        },
        "shopify-cogs-tracker": {
          title: "Sledování COGS pro Shopify — Přesné náklady na produkt",
          description: "Sledujte COGS na Shopify na produkt a variantu, včetně dopravy a dalších nákladů, aby každé číslo zisku stálo na spolehlivých nákladech.",
          h1: "Zisk je přesný jen tehdy, když je přesný váš COGS",
          intro: "Většina chyb v zisku jsou chyby v COGS: zastaralá cena dodavatele nebo varianta bez nákladu. Centrum COGS drží všechny náklady na jednom místě a automaticky je uplatňuje na každou objednávku.",
        },
        "shopify-profit-and-loss-report": {
          title: "Výkaz zisků a ztrát Shopify — P&L bez tabulek",
          description: "Vygenerujte P&L report Shopify s tržbami, COGS, poplatky, dopravou, reklamou a čistým ziskem — připravený ke sdílení, exportu i naplánování.",
          h1: "P&L report, který může použít váš účetní",
          intro: "Dobrý P&L report musí sedět: tržby, každá kategorie nákladů a zbývající čistá částka za zvolené období. GetProfitCalc jej sestaví z vašich objednávek a nákladů a exportuje jako PDF nebo CSV.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Zisk po reklamě na Shopify — Meta, Google a TikTok",
          description: "Sledujte zisk na Shopify po reklamě na Meta, Google a TikTok, na kampaň a kreativu, aby rozpočet sledoval zisk.",
          h1: "Zisk po reklamě je rozhodnutí, ne jen číslo",
          intro: "Reklama může podle ROAS vypadat ziskově, a přesto po COGS, poplatcích a dopravě prodělávat. GetProfitCalc přiřazuje výdaje objednávkám, které vygenerovaly, a odečítá všechny náklady, na kampaň i kreativu.",
        },
      },
    },
  },
  {
    code: "th",
    dict: {
      name: "ไทย",
      ogLocale: "th_TH",
      eyebrow: "ติดตามกำไรสำหรับ Shopify",
      breadcrumbHome: "หน้าแรก",
      featuresHeading: "สิ่งที่ GetProfitCalc มีให้",
      stepsHeading: "วิธีการทำงาน",
      faqHeading: "คำถามที่พบบ่อย",
      relatedHeading: "หน้าที่เกี่ยวข้อง",
      ctaTitle: "รู้จักกำไรที่แท้จริง ไม่ใช่แค่ยอดขาย",
      ctaText: "เชื่อมต่อ Shopify และดูกำไรต่อคำสั่งซื้อโดยรวมต้นทุนทั้งหมดแล้ว",
      ctaPrimary: "เริ่มฟรี",
      ctaSecondary: "ดูราคา",
      home: {
        title: "GetProfitCalc — กำไรที่แท้จริงสำหรับ Shopify",
        description: "คำนวณกำไรที่แท้จริงบน Shopify: รายได้ลบต้นทุนสินค้า ค่าธรรมเนียม ค่าจัดส่ง ส่วนลด การคืนเงิน และค่าโฆษณา ต่อคำสั่งซื้อและต่อสินค้า",
        h1: "กำไรที่แท้จริงบน Shopify โดยไม่ต้องใช้สเปรดชีต",
        intro: "Shopify แสดงยอดขาย ไม่ใช่กำไร GetProfitCalc ซิงก์คำสั่งซื้อของคุณและหักต้นทุนทั้งหมด คุณจึงเห็นว่าจริง ๆ แล้วได้กำไรเท่าไรในแต่ละคำสั่งซื้อและสินค้า",
      },
      features: [
        { title: "กำไรต่อคำสั่งซื้อและสินค้า", desc: "แต่ละคำสั่งซื้อแสดงรายได้ลบต้นทุนทั้งหมด และยอดรวมคือผลรวมของคำสั่งซื้อ" },
        { title: "รวมต้นทุนทั้งหมด", desc: "ต้นทุนสินค้า ค่าจัดส่ง ค่าธรรมเนียม ส่วนลด การคืนเงิน และค่าโฆษณาจะถูกหักก่อนผลลัพธ์" },
        { title: "กำไรหลังหักค่าโฆษณา", desc: "ค่าใช้จ่าย Meta, Google และ TikTok จะถูกเชื่อมโยงกับคำสั่งซื้อที่เกิดขึ้นจากโฆษณานั้น" },
        { title: "รายงานตามกำหนด", desc: "รายงานรายสัปดาห์และรายเดือนในรูปแบบ PDF หรือ CSV พร้อมแชร์ให้พันธมิตรหรือนักบัญชี" },
      ],
      steps: [
        { title: "เชื่อมต่อ Shopify", desc: "เชื่อมต่อร้านค้าด้วย OAuth คำสั่งซื้อจะซิงก์โดยอัตโนมัติ" },
        { title: "ใส่ต้นทุนจริงของคุณ", desc: "ตั้งต้นทุนสินค้า ค่าจัดส่ง และค่าธรรมเนียมเพียงครั้งเดียว ประวัติเก่านำเข้าผ่าน CSV ได้" },
        { title: "ดูกำไรที่แท้จริง", desc: "แต่ละคำสั่งซื้อแสดงจำนวนที่เหลือหลังหักต้นทุนทั้งหมด" },
      ],
      faqs: [
        { q: "กำไรสุทธิที่แท้จริงคำนวณอย่างไร?", a: "ต่อคำสั่งซื้อ: รายได้ลบต้นทุนสินค้า ค่าจัดส่ง ค่าธรรมเนียม ส่วนลด การคืนเงิน และค่าโฆษณาที่เชื่อมโยง ยอดรวมคือผลรวมของกำไรต่อคำสั่งซื้อ" },
        { q: "ทดลองใช้ต้องใช้บัตรหรือไม่?", a: "ไม่ต้อง คุณสามารถสร้างบัญชีและเชื่อมต่อร้านค้าก่อนได้ แผนปัจจุบันดูได้ที่หน้าราคา" },
        { q: "ใช้ได้เฉพาะ Shopify หรือไม่?", a: "การซิงก์แบบสดออกแบบมาเฉพาะ Shopify ส่วนแพลตฟอร์มอื่นนำเข้าคำสั่งซื้อเก่าผ่าน CSV ได้" },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "เครื่องคำนวณกำไร Shopify — กำไรสุทธิที่แท้จริงต่อคำสั่งซื้อ",
          description: "คำนวณกำไรที่แท้จริงบน Shopify: รายได้ลบต้นทุนสินค้า ค่าธรรมเนียม ค่าจัดส่ง ส่วนลด การคืนเงิน และค่าโฆษณา ต่อคำสั่งซื้อและต่อสินค้า",
          h1: "กำไรบน Shopify ที่คำนวณอย่างตรงไปตรงมา",
          intro: "Shopify แสดงยอดขาย ไม่ใช่กำไร GetProfitCalc คำนวณกำไรสุทธิที่แท้จริงต่อคำสั่งซื้อโดยหักต้นทุนสินค้า ค่าธรรมเนียม ค่าจัดส่ง ส่วนลด การคืนเงิน และค่าโฆษณาออกจากคำสั่งซื้อที่ซิงก์ไว้โดยอัตโนมัติ",
        },
        "shopify-profit-analytics": {
          title: "วิเคราะห์กำไร Shopify — ตามสินค้า ประเทศ และช่องทาง",
          description: "วิเคราะห์กำไร Shopify เกินกว่ายอดขาย: กำไรตามสินค้า ประเทศ ช่องทาง และกลุ่มลูกค้า พร้อมแนวโน้มและการแจ้งเตือน",
          h1: "การวิเคราะห์ที่อธิบายว่าทำไมกำไรของคุณเปลี่ยนไป",
          intro: "การวิเคราะห์ยอดขายบอกว่าขายอะไรได้ การวิเคราะห์กำไรบอกว่าอะไรทำเงิน แยกกำไรตามสินค้า ประเทศ ร้านค้า และกลุ่มลูกค้า และจับการเปลี่ยนแปลงได้ทันเวลา",
        },
        "shopify-cogs-tracker": {
          title: "ติดตามต้นทุนสินค้า Shopify — ต้นทุนที่แม่นยำต่อสินค้า",
          description: "ติดตามต้นทุนสินค้า Shopify ต่อสินค้าและตัวเลือกสินค้า รวมค่าจัดส่งและต้นทุนอื่น เพื่อให้ตัวเลขกำไรทุกตัวอยู่บนต้นทุนที่เชื่อถือได้",
          h1: "กำไรจะแม่นยำก็ต่อเมื่อต้นทุนของคุณแม่นยำ",
          intro: "ข้อผิดพลาดด้านกำไรส่วนใหญ่คือข้อผิดพลาดด้านต้นทุน: ราคาผู้จำหน่ายที่ล้าสมัยหรือตัวเลือกสินค้าที่ไม่มีต้นทุน ศูนย์ต้นทุนรวมต้นทุนทั้งหมดไว้ที่เดียวและนำไปใช้กับทุกคำสั่งซื้อโดยอัตโนมัติ",
        },
        "shopify-profit-and-loss-report": {
          title: "รายงานกำไรขาดทุน Shopify — P&L โดยไม่ต้องใช้สเปรดชีต",
          description: "สร้างรายงาน P&L ของ Shopify ที่มีรายได้ ต้นทุนสินค้า ค่าธรรมเนียม ค่าจัดส่ง ค่าโฆษณา และกำไรสุทธิ พร้อมแชร์ ส่งออก และตั้งเวลา",
          h1: "รายงาน P&L ที่นักบัญชีของคุณใช้ได้จริง",
          intro: "รายงาน P&L ที่ดีต้องตรงกัน: รายได้ ต้นทุนทุกประเภท และกำไรสุทธิที่เหลือ สำหรับช่วงเวลาที่เลือก GetProfitCalc สร้างจากคำสั่งซื้อและต้นทุนของคุณ และส่งออกเป็น PDF หรือ CSV",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "กำไรหลังหักค่าโฆษณาบน Shopify — Meta, Google, TikTok",
          description: "ติดตามกำไร Shopify หลังหักค่าโฆษณาบน Meta, Google และ TikTok ต่อแคมเปญและชิ้นงานโฆษณา เพื่อให้งบประมาณตามกำไร",
          h1: "กำไรหลังหักค่าโฆษณาคือการตัดสินใจ ไม่ใช่แค่ตัวเลข",
          intro: "โฆษณาอาจดูทำกำไรได้เมื่อวัดด้วย ROAS แต่ขาดทุนหลังหักต้นทุนสินค้า ค่าธรรมเนียม และค่าจัดส่ง GetProfitCalc เชื่อมโยงค่าใช้จ่ายกับคำสั่งซื้อที่เกิดขึ้นและหักต้นทุนทั้งหมด ต่อแคมเปญและชิ้นงานโฆษณา",
        },
      },
    },
  },
  {
    code: "tr",
    dict: {
      name: "Türkçe",
      ogLocale: "tr_TR",
      eyebrow: "Shopify için kâr takibi",
      breadcrumbHome: "Ana sayfa",
      featuresHeading: "GetProfitCalc neler sunuyor",
      stepsHeading: "Nasıl çalışır",
      faqHeading: "Sık sorulan sorular",
      relatedHeading: "İlgili sayfalar",
      ctaTitle: "Yalnızca ciroyu değil, gerçek kârınızı bilin",
      ctaText: "Shopify'ı bağlayın ve tüm maliyetler dahil sipariş başına kârı görün.",
      ctaPrimary: "Ücretsiz başlayın",
      ctaSecondary: "Fiyatları görün",
      home: {
        title: "GetProfitCalc — Shopify için gerçek kâr",
        description: "Gerçek Shopify kârınızı hesaplayın: ciro eksi COGS, ücretler, kargo, indirimler, iadeler ve reklam, sipariş ve ürün başına.",
        h1: "E-tablo olmadan gerçek Shopify kârınız",
        intro: "Shopify ciroyu gösterir, kârı değil. GetProfitCalc siparişlerinizi senkronize eder ve tüm maliyetleri düşer, böylece her siparişte ve üründe gerçekten ne kazandığınızı görürsünüz.",
      },
      features: [
        { title: "Sipariş ve ürün başına kâr", desc: "Her sipariş, ciro eksi tüm maliyetler olarak gösterilir ve toplamlar siparişlerin toplamıdır." },
        { title: "Tüm maliyetler dahil", desc: "COGS, kargo, ücretler, indirimler, iadeler ve reklam sonuçtan önce düşülür." },
        { title: "Reklam sonrası kâr", desc: "Meta, Google ve TikTok harcamaları, oluşturdukları siparişlere bağlanır." },
        { title: "Zamanlanmış raporlar", desc: "Haftalık ve aylık raporlar PDF veya CSV olarak, ortaklarla veya muhasebecilerle paylaşmaya hazırdır." },
      ],
      steps: [
        { title: "Shopify'ı bağlayın", desc: "Mağazanızı OAuth ile bağlayın. Siparişler otomatik olarak senkronize edilir." },
        { title: "Gerçek maliyetlerinizi girin", desc: "COGS, kargo ve ücretleri bir kez ayarlayın. Geçmiş CSV ile içe aktarılabilir." },
        { title: "Gerçek kârınızı görün", desc: "Her sipariş, tüm maliyetlerden sonra kalanı gösterir." },
      ],
      faqs: [
        { q: "Gerçek net kâr nasıl hesaplanır?", a: "Sipariş başına: ciro eksi COGS, kargo, ücretler, indirimler, iadeler ve bağlanan reklam. Toplamlar, sipariş başına kârın toplamıdır." },
        { q: "Denemek için karta ihtiyacım var mı?", a: "Hayır. Önce hesap oluşturup mağazanızı bağlayabilirsiniz; güncel planlar için fiyat sayfasına bakın." },
        { q: "Yalnızca Shopify ile mi çalışır?", a: "Canlı senkronizasyon tasarım gereği yalnızca Shopify içindir. Diğer platformlar eski siparişleri CSV ile içe aktarabilir." },
      ],
      pages: {
        "shopify-profit-calculator": {
          title: "Shopify Kâr Hesaplayıcı — Sipariş Başına Gerçek Net Kâr",
          description: "Gerçek Shopify kârınızı hesaplayın: ciro eksi COGS, ücretler, kargo, indirimler, iadeler ve reklam, sipariş ve ürün başına.",
          h1: "Shopify kârınız, dürüstçe hesaplanmış",
          intro: "Shopify ciroyu gösterir, kârı değil. GetProfitCalc, senkronize edilen siparişlerden COGS, ücretler, kargo, indirimler, iadeler ve reklamı otomatik olarak düşerek sipariş başına gerçek net kârı hesaplar.",
        },
        "shopify-profit-analytics": {
          title: "Shopify Kâr Analizi — Ürün, Ülke ve Kanala Göre",
          description: "Cironun ötesinde Shopify kâr analizi: ürün, ülke, kanal ve müşteri segmentine göre kâr, trendler ve uyarılarla.",
          h1: "Kârınızın neden değiştiğini açıklayan analiz",
          intro: "Ciro analizi neyin satıldığını söyler. Kâr analizi neyin para kazandırdığını söyler. Kârı ürün, ülke, mağaza ve müşteri segmentine göre bölün ve değişiklikleri zamanında yakalayın.",
        },
        "shopify-cogs-tracker": {
          title: "Shopify COGS Takipçisi — Ürün Başına Doğru Maliyetler",
          description: "Shopify COGS'unu ürün ve varyant başına, kargo ve diğer maliyetler dahil takip edin, böylece her kâr rakamı güvenilir maliyetlere dayanır.",
          h1: "Kâr, ancak COGS'unuz doğruysa doğrudur",
          intro: "Kâr hatalarının çoğu COGS hatasıdır: güncelliğini yitirmiş tedarikçi fiyatı veya maliyeti olmayan varyant. COGS merkezi tüm maliyetleri tek yerde tutar ve her siparişe otomatik olarak uygular.",
        },
        "shopify-profit-and-loss-report": {
          title: "Shopify Kâr ve Zarar Raporu — E-tablosuz P&L",
          description: "Ciro, COGS, ücretler, kargo, reklam ve net kâr içeren bir Shopify P&L raporu oluşturun — paylaşmaya, dışa aktarmaya ve zamanlamaya hazır.",
          h1: "Muhasebecinizin kullanabileceği bir P&L raporu",
          intro: "İyi bir P&L raporu tutarlı olmalıdır: seçilen dönem için ciro, her maliyet kategorisi ve kalan net tutar. GetProfitCalc bunu siparişlerinizden ve maliyetlerinizden oluşturur ve PDF veya CSV olarak dışa aktarır.",
        },
        "shopify-ad-spend-profit-tracker": {
          title: "Shopify Reklam Sonrası Kâr Takipçisi — Meta, Google, TikTok",
          description: "Meta, Google ve TikTok'ta reklam sonrası Shopify kârını kampanya ve kreatif başına takip edin, böylece bütçe kârı izler.",
          h1: "Reklam sonrası kâr bir karardır, yalnızca bir sayı değil",
          intro: "Bir reklam ROAS'a göre kârlı görünebilir ama COGS, ücretler ve kargo sonrasında zarar edebilir. GetProfitCalc harcamaları oluşturdukları siparişlere bağlar ve tüm maliyetleri düşer, kampanya ve kreatif başına.",
        },
      },
    },
  },
];
