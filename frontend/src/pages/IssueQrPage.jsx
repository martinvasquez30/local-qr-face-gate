import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { listUsers } from "../users/usersApi.js";

/**
 * "Issue QR": pick a person, then the existing QR page (/users/:id/qr) shows
 * the code. This page only adds the choice; the code itself is not new.
 */
function IssueQrPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [errorCode, setErrorCode] = useState(null);

  // Only active users: inactive ones cannot get a code.
  useEffect(() => {
    const controller = new AbortController();
    listUsers(token, { signal: controller.signal })
      .then(setUsers)
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
      });
    return () => controller.abort();
  }, [token]);

  function handleSubmit(event) {
    event.preventDefault();
    navigate(`/users/${userId}/qr`);
  }

  return (
    <section className="card">
      <h1 className="title">{t("issueQr.title")}</h1>
      <p className="subtitle">{t("issueQr.subtitle")}</p>

      <ErrorMessage code={errorCode} />

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">{t("issueQr.user")}</span>
          <select
            className="field__input"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            required
          >
            <option value="">{t("issueQr.choose")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </select>
        </label>
        <button className="button button--primary" type="submit" disabled={!userId}>
          {t("issueQr.submit")}
        </button>
      </form>
    </section>
  );
}

export default IssueQrPage;
