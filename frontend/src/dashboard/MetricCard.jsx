import Icon from "../components/Icon.jsx";

/**
 * One number of the summary: icon, label, value and a short note.
 * `tone` (blue, green, red, amber) only colors the icon; the text says it all.
 */
function MetricCard({ icon, tone = "blue", label, value, note }) {
  return (
    <article className="panel metric-card">
      <span className={`metric-card__icon metric-card__icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <div>
        <p className="metric-card__label">{label}</p>
        <p className="metric-card__value">{value}</p>
        {note && <p className="metric-card__note">{note}</p>}
      </div>
    </article>
  );
}

export default MetricCard;
