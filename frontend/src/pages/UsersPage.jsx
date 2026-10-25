import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import CreateUserForm from "../users/CreateUserForm.jsx";
import { listUsers, updateUser } from "../users/usersApi.js";

function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser, token } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  // Id of the user whose button was just clicked, to disable it meanwhile.
  const [busyUserId, setBusyUserId] = useState(null);
  // Changing this number makes the effect below load the list again.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    listUsers(token, { includeInactive: showInactive, signal: controller.signal })
      .then((data) => {
        setUsers(data);
        setErrorCode(null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCode(errorCodeOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    // If the checkbox changes before the answer arrives, the old request is
    // cancelled, so an outdated list never replaces a newer one.
    return () => controller.abort();
  }, [token, showInactive, reloadCount]);

  function reload() {
    setReloadCount((count) => count + 1);
  }

  async function handleToggleActive(user) {
    setBusyUserId(user.id);
    setErrorCode(null);
    try {
      await updateUser(token, user.id, { is_active: !user.is_active });
      reload();
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    } finally {
      setBusyUserId(null);
    }
  }

  // Search is done in the browser: the list is small, so no extra API call.
  const searchText = search.trim().toLowerCase();
  const visibleUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchText) ||
      user.email.includes(searchText)
  );

  return (
    <section className="card card--wide">
      <h1 className="title">{t("users.title")}</h1>
      <p className="subtitle">{t("users.subtitle")}</p>

      <div className="users-toolbar">
        <label className="field users-toolbar__search">
          <span className="field__label">{t("users.search")}</span>
          <input
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          <span>{t("users.showInactive")}</span>
        </label>
      </div>

      <ErrorMessage code={errorCode} />

      {isLoading && users.length === 0 ? (
        <p className="loading" role="status">
          {t("users.loading")}
        </p>
      ) : visibleUsers.length === 0 ? (
        <p className="empty">{users.length === 0 ? t("users.empty") : t("users.noMatches")}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th scope="col">{t("users.fields.name")}</th>
              <th scope="col">{t("users.fields.email")}</th>
              <th scope="col">{t("users.fields.role")}</th>
              <th scope="col">{t("users.fields.status")}</th>
              <th scope="col">
                <span className="visually-hidden">{t("users.fields.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const isMe = user.id === currentUser.id;
              return (
                // data-label is shown next to each value when the table
                // turns into cards on narrow screens (see App.css).
                <tr key={user.id} className={user.is_active ? "" : "users-table__row--inactive"}>
                  <td data-label={t("users.fields.name")}>
                    <span>
                      {user.name}
                      {isMe && <span className="badge">{t("users.you")}</span>}
                    </span>
                  </td>
                  <td data-label={t("users.fields.email")} className="users-table__email">
                    {user.email}
                  </td>
                  <td data-label={t("users.fields.role")}>
                    {t(`roles.${user.role}`, { defaultValue: user.role })}
                  </td>
                  <td data-label={t("users.fields.status")}>
                    <span className={`badge badge--${user.is_active ? "active" : "inactive"}`}>
                      {user.is_active ? t("users.status.active") : t("users.status.inactive")}
                    </span>
                  </td>
                  <td className="users-table__actions">
                    <button
                      className="button button--secondary button--small"
                      type="button"
                      // An admin cannot deactivate themselves (the API also checks it).
                      disabled={isMe || busyUserId === user.id}
                      title={isMe ? t("errors.cannot_modify_self") : undefined}
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.is_active ? t("users.actions.deactivate") : t("users.actions.reactivate")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <CreateUserForm onCreated={reload} />
    </section>
  );
}

export default UsersPage;
