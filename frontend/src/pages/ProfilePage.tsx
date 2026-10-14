import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authApi, DoctorProfile, ProfileUser } from "../lib/api";
import "../styles/appScreens.css";
import "../styles/profilePage.css";

function initials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toLocaleUpperCase();
}
function memberDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" }).format(new Date(value));
}

export default function ProfilePage() {
  const { user, refreshProfile, updateProfile } = useAuth();
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [locationDraft, setLocationDraft] = useState({ city: "", clinicName: "", streetAddress: "", officeNumber: "" });
  const [savingLocation, setSavingLocation] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ firstName: "", lastName: "", phone: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await refreshProfile();
      setProfile(result);
      setDraft({ firstName: result.firstName, lastName: result.lastName, phone: result.phone || "" });
      if (result.role === "DOCTOR") {
        const { doctor } = await authApi.doctorProfile();
        setDoctorProfile(doctor);
        setLocationDraft({
          city: doctor.city || "",
          clinicName: doctor.clinicName || "",
          streetAddress: doctor.streetAddress || "",
          officeNumber: doctor.officeNumber || "",
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load profile information. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [refreshProfile]);

  useEffect(() => { void load(); }, [load]);

  if (!user) return <Navigate to="/login" replace />;

  const roleName = user.role.charAt(0) + user.role.slice(1).toLocaleLowerCase();

  function beginEdit() {
    if (!profile) return;
    setMessage("");
    setError("");
    setDraft({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone || "" });
    setEditing(true);
  }

  function cancelEdit() {
    if (profile) setDraft({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone || "" });
    setEditing(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await updateProfile({ ...draft, phone: draft.phone.trim() || null });
      setProfile(result);
      setDraft({ firstName: result.firstName, lastName: result.lastName, phone: result.phone || "" });
      setEditing(false);
      setMessage("Profile updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingLocation(true);
    setError("");
    setMessage("");
    try {
      const { doctor } = await authApi.updateLocation({
        city: locationDraft.city.trim() || null,
        clinicName: locationDraft.clinicName.trim() || null,
        streetAddress: locationDraft.streetAddress.trim() || null,
        officeNumber: locationDraft.officeNumber.trim() || null,
      });
      setDoctorProfile(doctor);
      setLocationDraft({
        city: doctor.city || "",
        clinicName: doctor.clinicName || "",
        streetAddress: doctor.streetAddress || "",
        officeNumber: doctor.officeNumber || "",
      });
      setMessage("Clinic location updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update clinic location. Please try again.");
    } finally {
      setSavingLocation(false);
    }
  }

  const field = (id: string, label: string, value: string, type = "text", readOnly = true, onChange?: (next: string) => void) => (
    <label className="pp-field" htmlFor={id} key={id}>
      <span>{label}</span>
      <input id={id} type={type} value={value} readOnly={readOnly} aria-readonly={readOnly} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />
    </label>
  );

  return (
    <div className="patient-profile-page">
      <div className="pp-container">
        <Link className="bk-back" to={user.role === "DOCTOR" ? "/doctor/dashboard" : user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard"}>← Back to dashboard</Link>
        <header className="pp-heading"><h1>My Profile</h1><p>Your personal information and account preferences.</p></header>

        {error && !editing && !profile && <div className="pp-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}
        {error && (editing || profile) && <div className="pp-alert" role="alert">{error}</div>}
        {message && <div className="pp-success" role="status">{message}</div>}

        {loading ? <div className="pp-skeleton" role="status" aria-label="Loading profile"><span /><span /><span /><span /></div> : profile ? <>
          <section className="pp-summary" aria-labelledby="pp-name">
            <div className="pp-identity">
              <div className="pp-avatar" aria-hidden="true">{initials(profile.firstName, profile.lastName)}</div>
              <div className="pp-summary-copy">
                <h2 id="pp-name">{profile.firstName} {profile.lastName}</h2>
                <div className="pp-badges"><span className="pp-badge pp-role">{roleName}</span><span className="pp-badge pp-session">Signed in</span></div>
                <p>Member since {memberDate(profile.createdAt)}</p>
              </div>
            </div>
            {!editing && (
              <div className="pp-actions">
                <button className="pp-edit-button" type="button" aria-label="Edit personal profile" onClick={beginEdit}><span aria-hidden="true">✎</span> Edit Profile</button>
              </div>
            )}
          </section>

          {user.role === "DOCTOR" && doctorProfile && (
            <section className="pp-information" aria-labelledby="doctor-profile-heading">
              <div className="pp-section-heading"><div><h2 id="doctor-profile-heading">Professional information</h2><p>These details come from your doctor profile.</p></div></div>
              <form onSubmit={saveLocation}>
                <div className="pp-field-grid">
                  {field("pp-specialty", "Specialty", doctorProfile.category.name)}
                  {field("pp-consultation-fee", "Consultation fee", doctorProfile.consultationFee === undefined ? "Not provided" : `${doctorProfile.consultationFee.toLocaleString("en-US")} KZT`)}
                  {field("pp-city", "City", locationDraft.city, "text", false, (value) => setLocationDraft((current) => ({ ...current, city: value })))}
                  {field("pp-clinic-name", "Clinic name", locationDraft.clinicName, "text", false, (value) => setLocationDraft((current) => ({ ...current, clinicName: value })))}
                  {field("pp-street-address", "Street address", locationDraft.streetAddress, "text", false, (value) => setLocationDraft((current) => ({ ...current, streetAddress: value })))}
                  {field("pp-office-number", "Cabinet / office number", locationDraft.officeNumber, "text", false, (value) => setLocationDraft((current) => ({ ...current, officeNumber: value })))}
                </div>
                <div className="pp-form-actions">
                  <button
                    className="pp-save"
                    type="submit"
                    disabled={savingLocation || (
                      locationDraft.city === (doctorProfile.city || "")
                      && locationDraft.clinicName === (doctorProfile.clinicName || "")
                      && locationDraft.streetAddress === (doctorProfile.streetAddress || "")
                      && locationDraft.officeNumber === (doctorProfile.officeNumber || "")
                    )}
                  >
                    {savingLocation ? "Saving…" : "Save clinic location"}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="pp-information" aria-labelledby="pp-info-heading">
            <div className="pp-section-heading"><div><h2 id="pp-info-heading">Personal information</h2><p>{editing ? "Update your name or phone number." : "Your account details are shown below."}</p></div></div>
            <form onSubmit={save}>
              <div className="pp-field-grid">
                {field("pp-first-name", "First Name", editing ? draft.firstName : profile.firstName, "text", !editing, (value) => setDraft((current) => ({ ...current, firstName: value })))}
                {field("pp-last-name", "Last Name", editing ? draft.lastName : profile.lastName, "text", !editing, (value) => setDraft((current) => ({ ...current, lastName: value })))}
                <div className="pp-field-wrap">
                  {field("pp-iin", "IIN (Individual Identification Number)", profile.maskedIin || "Not provided", "text", true)}
                  <small>Masked by default. Only authorised identity checks may reveal this information.</small>
                </div>
                {field("pp-email", "Email Address", profile.email, "email", true)}
                {field("pp-phone", "Phone Number", editing ? draft.phone : profile.phone || "Not provided", "tel", !editing, (value) => setDraft((current) => ({ ...current, phone: value })))}
              </div>
              {editing && <p className="pp-edit-note">Email changes require a separate verification process and cannot be made here.</p>}
              <p className="pp-created">Account created: {memberDate(profile.createdAt)}</p>
              {editing && <div className="pp-form-actions"><button className="pp-cancel" type="button" disabled={saving} onClick={cancelEdit}>Cancel</button><button className="pp-save" type="submit" disabled={saving || !draft.firstName.trim() || !draft.lastName.trim()}>{saving ? "Saving…" : "Save changes"}</button></div>}
            </form>
          </section>
        </> : null}
      </div>
    </div>
  );
}
