/**
 * A row of buttons where one is chosen ("All / Active / Inactive").
 * `options` is a list of { value, label }. aria-pressed tells screen readers
 * which one is on; it is also shown with a filled background, not only color.
 */
function FilterTabs({ label, options, value, onChange }) {
  return (
    <div className="filter-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className="filter-tabs__button"
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default FilterTabs;
