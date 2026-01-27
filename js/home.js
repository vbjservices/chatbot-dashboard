// home.js

(function () {
  const wheel = document.getElementById("successWheel");
  if (!wheel) return;

  if (!("IntersectionObserver" in window)) {
    wheel.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          wheel.classList.add("is-visible");
          observer.disconnect();
        }
      });
    },
    { threshold: 0.45 }
  );

  observer.observe(wheel);
})();

(function () {
  const dailyRange = document.getElementById("dailyCostRange");
  const convoRange = document.getElementById("conversationRange");
  const dailyValue = document.getElementById("dailyCostValue");
  const convoValue = document.getElementById("conversationValue");
  const outcomeValue = document.getElementById("outcomeValue");
  if (!dailyRange || !convoRange || !dailyValue || !convoValue || !outcomeValue) return;

  const AVG_CHATBOT_COST = 0.35;

  const formatMoney = (value) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  const formatNumber = (value) => value.toLocaleString("en-US");

  const update = () => {
    const dailyCost = Number(dailyRange.value);
    const conversations = Number(convoRange.value);

    dailyValue.textContent = `$${dailyCost}`;
    convoValue.textContent = formatNumber(conversations);

    const humanCost = dailyCost * conversations;
    const botCost = AVG_CHATBOT_COST * conversations;
    const outcome = humanCost - botCost;

    outcomeValue.textContent = formatMoney(outcome);
  };

  dailyRange.addEventListener("input", update);
  convoRange.addEventListener("input", update);
  update();
})();

(function () {
  const successEl = document.getElementById("gifSuccess");
  const escalationEl = document.getElementById("gifEscalation");
  const leadsEl = document.getElementById("gifLeads");
  if (!successEl || !escalationEl || !leadsEl) return;

  const metrics = [
    { el: successEl, min: 74, max: 88, speed: 0.55, phase: 0.0 },
    { el: escalationEl, min: 6, max: 14, speed: 0.7, phase: 1.8 },
    { el: leadsEl, min: 8, max: 22, speed: 0.62, phase: 3.2 },
  ];

  const lerp = (a, b, t) => a + (b - a) * t;

  const tick = (now) => {
    const t = now / 1000;
    for (const m of metrics) {
      const wave = 0.5 + 0.5 * Math.sin(t * m.speed + m.phase);
      const value = Math.round(lerp(m.min, m.max, wave));
      m.el.textContent = `${value}%`;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();
