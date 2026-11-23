import { useTranslation } from "react-i18next";

/**
 * Bar chart of attempts per hour, drawn with plain HTML and CSS (no chart
 * library). Each bar's height is its count compared with the highest one.
 * Screen readers get the numbers as text, one per hour.
 */
function HourlyChart({ counts }) {
  const { t } = useTranslation();
  const highest = Math.max(1, ...counts);

  return (
    <ol className="hour-chart">
      {counts.map((count, hour) => (
        <li key={hour} className="hour-chart__item">
          <span className="hour-chart__bar" style={{ height: `${(count / highest) * 100}%` }} />
          {/* A label every 3 hours, so they fit on a phone. */}
          <span className="hour-chart__label" aria-hidden="true">
            {hour % 3 === 0 ? hour : ""}
          </span>
          <span className="visually-hidden">{t("dashboard.hourBar", { hour, count })}</span>
        </li>
      ))}
    </ol>
  );
}

export default HourlyChart;
