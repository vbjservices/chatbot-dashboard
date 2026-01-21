export function generateMockEvents({ days = 30, seed = 42 } = {}) {
  // simpele deterministic RNG
  let s = seed >>> 0;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  const now = new Date();
  const channels = ["web", "whatsapp", "email"];
  const types = ["product", "policy", "general", "unknown"];
  const topics = {
    product: ["maat", "compatibiliteit", "budget", "installatie", "accessoires", "alternatief"],
    policy: ["retour", "verzending", "garantie", "betaling", "annuleren"],
    general: ["openingstijden", "contact", "over ons", "locatie", "handleiding"],
    unknown: ["??", "vage vraag", "onduidelijk", "mis-typo", "context mist"]
  };

  const productPool = [
    { id: "sku_1001", name: "Product A", url: "#", image: "https://via.placeholder.com/64" },
    { id: "sku_1002", name: "Product B", url: "#", image: "https://via.placeholder.com/64" },
    { id: "sku_1003", name: "Product C", url: "#", image: "https://via.placeholder.com/64" },
    { id: "sku_1004", name: "Product D", url: "#", image: "https://via.placeholder.com/64" },
  ];

  const events = [];
  const conversations = [];
  const dailyCounts = [];

  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0,0,0,0);

  let convoIdCounter = 1;

  for (let d = 0; d < days; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);

    // volume per dag
    const base = 12 + Math.floor(rand() * 18); // 12-29
    const weekendBoost = (day.getDay() === 0 || day.getDay() === 6) ? -4 : 0;
    const n = Math.max(6, base + weekendBoost);
    dailyCounts.push({ date: new Date(day), count: n });

    for (let i = 0; i < n; i++) {
      const conversation_id = `c_${convoIdCounter++}`;
      const channel = channels[Math.floor(rand() * channels.length)];
      const type = types[Math.floor(rand() * types.length)];
      const topicList = topics[type];
      const topic = topicList[Math.floor(rand() * topicList.length)];

      // timing
      const t = new Date(day);
      t.setHours(Math.floor(rand() * 24), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);

      // success logic (demo)
      let successProb = 0.78;
      if (type === "unknown") successProb = 0.35;
      if (type === "product") successProb = 0.82;
      if (type === "policy") successProb = 0.86;

      const success = rand() < successProb;

      // escalation when fail OR some policy edge cases
      const escalated = !success ? (rand() < 0.55) : (rand() < 0.05);

      // lead captured when escalated (demo)
      const lead = escalated ? (rand() < 0.35) : false;

      // confidence (0..1)
      let confidence = success ? (0.68 + rand() * 0.30) : (0.20 + rand() * 0.45);
      if (type === "unknown") confidence -= 0.15;
      confidence = Math.max(0.01, Math.min(0.99, confidence));

      // latency ms
      const latency_ms = Math.round(450 + rand() * 1300 + (escalated ? 150 : 0));

      // tokens (fake)
      const tokens = Math.round(250 + rand() * 900);

      const user_q = makeQuestion(type, topic, rand);
      const bot_a = makeAnswer(type, topic, success, rand);

      // product match for product type when success
      const products = (type === "product" && success && rand() < 0.85)
        ? pickProducts(productPool, rand)
        : [];

      // click-outs (demo)
      const clicked_product = products.length ? (rand() < 0.28) : false;

      const reason = success ? null : pickFailReason(type, rand);

      const prompt_version = rand() < 0.85 ? "v1" : "v2";

      const convo = {
        conversation_id,
        created_at: t.toISOString(),
        channel,
        type,
        topic,
        user_id_hash: `u_${Math.floor(rand() * 9000) + 1000}`,
        prompt_version,
        outcome: {
          success,
          escalated,
          lead,
          reason,
          products,
          clicked_product
        },
        metrics: { confidence, latency_ms, tokens },
        messages: [
          { role: "user", at: t.toISOString(), content: user_q },
          { role: "bot", at: new Date(t.getTime() + latency_ms).toISOString(), content: bot_a },
          ...(escalated ? [{
            role: "system",
            at: new Date(t.getTime() + latency_ms + 200).toISOString(),
            content: lead
              ? "Handover initiated. Lead captured."
              : "Handover initiated. Requested customer details."
          }] : [])
        ]
      };

      conversations.push(convo);
    }
  }

  // flatten events-style if you wil later
  conversations.forEach(c => {
    events.push({
      type: "conversation",
      ...c
    });
  });

  return { events, conversations, dailyCounts };
}

function pickProducts(pool, rand) {
  const n = 1 + Math.floor(rand() * 3); // 1-3
  const copy = [...pool].sort(() => rand() - 0.5);
  return copy.slice(0, n);
}

function pickFailReason(type, rand) {
  const reasons = {
    product: ["Missing product data", "Compatibiliteit onduidelijk", "Te weinig eisen", "Geen match gevonden"],
    policy: ["Policy content ontbreekt", "Edge case (betaling/chargeback)", "Onzeker antwoord — bron ontbreekt"],
    general: ["Bedrijfsinfo ontbreekt", "Onvoldoende context", "Onbekende vraag"],
    unknown: ["Onbegrijpelijke input", "Te vaag", "Taal/typo", "Intent niet herkend"]
  };
  const list = reasons[type] || reasons.unknown;
  return list[Math.floor(rand() * list.length)];
}

function makeQuestion(type, topic, rand) {
  const qs = {
    product: [
      `Welke ${topic} moet ik kiezen?`,
      `Ik zoek iets voor ${topic}, wat raad je aan?`,
      `Heb je een match voor ${topic} onder de €100?`,
      `Wat heb ik nodig voor ${topic} bij mijn setup?`
    ],
    policy: [
      `Hoe werkt jullie ${topic}?`,
      `Wat is het ${topic} beleid?`,
      `Kun je uitleggen over ${topic} en voorwaarden?`,
      `Wanneer geldt ${topic} en hoe snel?`
    ],
    general: [
      `Wat zijn jullie ${topic}?`,
      `Kun je iets vertellen over ${topic}?`,
      `Hoe neem ik contact op over ${topic}?`,
      `Waar vind ik info over ${topic}?`
    ],
    unknown: [
      `huh ${topic} ???`,
      `werkt dit ook met dat ding`,
      `kan ik dat ermee doen ofzo`,
      `???`
    ]
  };
  const list = qs[type] || qs.unknown;
  return list[Math.floor(rand() * list.length)];
}

function makeAnswer(type, topic, success, rand) {
  if (!success) {
    const fails = [
      "Ik wil je goed helpen, maar ik mis wat informatie. Kun je je situatie iets specifieker maken?",
      "Ik kan dit niet met zekerheid beantwoorden op basis van de beschikbare info. Ik kan je doorzetten naar support.",
      "Ik weet dit niet zeker. Als je wilt, kan ik je in contact brengen met onze customer service."
    ];
    return fails[Math.floor(rand() * fails.length)];
  }

  if (type === "product") {
    return `Op basis van je vraag over **${topic}** raad ik aan om te starten met een match uit onze selectie. Als je je wensen (budget/maat/compatibiliteit) deelt, maak ik het nog preciezer.`;
  }
  if (type === "policy") {
    return `Over **${topic}**: in de meeste gevallen geldt ons standaardbeleid. Als je ordernummer hebt kan ik dit specifieker maken.`;
  }
  return `Over **${topic}**: dit is algemene informatie. Als je me vertelt wat je precies bedoelt, kan ik het concreter maken.`;
}