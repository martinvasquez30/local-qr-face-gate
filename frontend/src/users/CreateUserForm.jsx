import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorCodeOf } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { createUser } from "./usersApi.js";

const EMPTY_FORM = { name: "", email: "", role: "member" };

/** Form to add a user. Calls onCreated(user) after a successful save. */
function CreateUserForm({ onCreated }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errorCode, setErrorCode] = useState(null);
  const [createdName, setCreatedName] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // One handler for every field: the input's `name` says which value changes.
  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setCreatedName(null);
    if (!form.name.trim() || !form.email.trim()) {
      setErrorCode("missing_user_fields");
      return;
    }

    setErrorCode(null);
    setIsSaving(true);
    try {
      const user = await createUser(token, form);
      setForm(EMPTY_FORM);
      setCreatedName(user.name);
      onCreated(user);
    } catch (error) {
      setErrorCode(errorCodeOf(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="form create-user" onSubmit={handleSubmit} noValidate>
      <h2 className="section-title">{t("users.create.title")}</h2>

      <div className="create-user__fields">
        <label className="field">
          <span className="field__label">{t("users.fields.name")}</span>
          <input
            className="field__input"
            name="name"
            autoComplete="off"
            value={form.name}
            onChange={handleChange}
          />
        </label>

        <label className="field">
          <span className="field__label">{t("users.fields.email")}</span>
          <input
            className="field__input"
            type="email"
            name="email"
            autoComplete="off"
            value={form.email}
            onChange={handleChange}
          />
        </label>

        <label className="field">
          <span className="field__label">{t("users.fields.role")}</span>
          <select className="field__input" name="role" value={form.role} onChange={handleChange}>
            <option value="member">{t("roles.member")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
        </label>
      </div>

      <ErrorMessage code={errorCode} />
      {createdName && (
        <p className="form__success" role="status">
          {t("users.create.success", { name: createdName })}
        </p>
      )}

      <button className="button button--primary" type="submit" disabled={isSaving}>
        {isSaving ? t("users.create.saving") : t("users.create.submit")}
      </button>
    </form>
  );
}

export default CreateUserForm;
