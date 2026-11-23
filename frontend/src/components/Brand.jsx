import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

/** App logo and name. It links to the home page. */
function Brand({ className = "" }) {
  const { t } = useTranslation();

  return (
    <Link className={`brand ${className}`} to="/">
      <span className="brand__mark">
        <Icon name="shield" size={22} />
      </span>
      <span className="brand__name">{t("app.title")}</span>
    </Link>
  );
}

export default Brand;
