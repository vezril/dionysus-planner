import { getResolvedTargets } from "@/data/nutritionTargets";
import { TargetsEditor } from "./_components/TargetsEditor";

/**
 * openspec: nutrition-targets-guide — the nutrition guide + targets
 * editor. Content and defaults are sourced in the nutrition-reference
 * skill (Health Canada DRIs, CCSA 2023 alcohol guidance).
 */
export const dynamic = "force-dynamic";

const ALCOHOL_TIERS = [
  { drinks: "0 / week", risk: "No risk", tone: "text-status-cookable" },
  { drinks: "1–2 / week", risk: "Low risk", tone: "text-status-cookable" },
  { drinks: "3–6 / week", risk: "Moderate risk — cancer risk rises", tone: "text-status-near" },
  { drinks: "7+ / week", risk: "Increasingly high risk", tone: "text-destructive" },
];

export default async function GuidePage() {
  const targets = await getResolvedTargets();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">Guide</h1>

      <section className="flex flex-col gap-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium">How to read your numbers</h2>
        <p>
          <span className="font-medium">Calories</span> are a budget: maintenance for most adults sits
          between 2,000 and 3,000 kcal depending on size and activity — set yours below.{" "}
          <span className="font-medium">Protein</span> is a floor: the RDA is 0.8 g per kg of body weight,
          and 1.2–2.0 g/kg if you train. <span className="font-medium">Carbs and fat</span> are flexible
          within the AMDR ranges (45–65% and 20–35% of calories).
        </p>
        <p>
          <span className="font-medium">Fiber</span> is the most commonly missed goal — 38 g/day for men
          under 50. Keep <span className="font-medium">sodium</span> under 2,300 mg (the Health Canada
          chronic-disease-risk threshold), <span className="font-medium">free sugars</span> under 10% of
          calories, <span className="font-medium">saturated fat</span> under 10% of calories, and{" "}
          <span className="font-medium">trans fat</span> as close to zero as you can get.
        </p>
        <p>
          Recipes show each serving as a percentage of your daily targets; the Dashboard judges whole
          days and weeks. Caps read <span className="text-status-cookable">ok</span> up to 90%,{" "}
          <span className="text-status-near">near</span> to 100%, then{" "}
          <span className="text-destructive">over</span>. Goals read met / partial / low.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Alcohol — Canada&apos;s 2023 guidance</h2>
        <p className="text-sm text-muted-foreground">
          One standard drink = 17 mL of ethanol (a 355 mL beer at 5% is 1.04). Weekly risk tiers per the
          Canadian Centre on Substance Use and Addiction — and never more than 2 drinks on any single day:
        </p>
        <ul data-testid="alcohol-tiers" className="flex flex-col gap-1 rounded-md border border-border p-4 text-sm">
          {ALCOHOL_TIERS.map((tier) => (
            <li key={tier.drinks} className="flex justify-between gap-4">
              <span className="font-mono tabular-nums">{tier.drinks}</span>
              <span className={tier.tone}>{tier.risk}</span>
            </li>
          ))}
        </ul>
      </section>

      <TargetsEditor targets={targets} />

      <section className="flex flex-col gap-2 text-xs text-muted-foreground">
        <h2 className="text-sm font-medium text-foreground">Sources</h2>
        <p>
          Health Canada, Dietary Reference Intakes tables · Canadian Centre on Substance Use and
          Addiction, Canada&apos;s Guidance on Alcohol and Health (2023) · WHO free-sugars guideline.
          General guidance, not medical advice — adjust with your own clinician.
        </p>
      </section>
    </div>
  );
}
