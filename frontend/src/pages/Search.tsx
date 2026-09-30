import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { useAuth } from "../context/AuthContext";
import { api, Doctor } from "../lib/api";
import { getDoctorPhoto } from "../lib/doctorImages";

export default function Search() {
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQuery] = useState(params.get("q") || "");
  const [category, setSelectedCategory] = useState(params.get("category") || "");
  const [office, setSelectedOffice] = useState(params.get("office") || "");
  const queryRef = useRef(q);
  const categoryRef = useRef(category);
  const officeRef = useRef(office);
  const setQ = (value: string) => { queryRef.current = value; setQuery(value); };
  const setCategory = (value: string) => { categoryRef.current = value; setSelectedCategory(value); };
  const setOffice = (value: string) => { officeRef.current = value; setSelectedOffice(value); };
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function search(event?: FormEvent) {
    event?.preventDefault();
    const currentQuery = queryRef.current;
    const currentCategory = categoryRef.current;
    const currentOffice = officeRef.current.trim();
    setLoading(true);
    setError("");
    setParams({ ...(currentQuery ? { q: currentQuery } : {}), ...(currentCategory ? { category: currentCategory } : {}), ...(currentOffice ? { office: currentOffice } : {}) });
    try {
      const result = await api<{ doctors: Doctor[] }>(`/doctors?q=${encodeURIComponent(currentQuery)}&category=${encodeURIComponent(currentCategory)}&office=${encodeURIComponent(currentOffice)}`);
      setDoctors(result.doctors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load doctors");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    api<{ categories: { id: string; name: string }[] }>("/categories").then((result) => setCategories(result.categories || [])).catch(() => {});
    search();
  }, []);
  return <div className="search-page">
    <section className="search-hero"><div><p className="eyebrow eyebrow-light">Your care, on your terms</p><h1>Find the right<br /><em>doctor for you.</em></h1><p>Search a growing network of specialists ready to listen, understand, and help.</p></div><div className="search-hero-orb"><span>+</span></div></section>
    <div className="search-content">
      <DoctorSearchForm query={q} category={category} office={office} categories={categories} onQueryChange={setQ} onCategoryChange={setCategory} onOfficeChange={setOffice} onSubmit={search} />
      <div className="search-toolbar"><div><p className="eyebrow">Care directory</p><h2>{loading ? "Finding your care team…" : `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} found`}</h2></div><div className="view-chip">All available doctors</div></div>
      {error && <div className="alert error" role="alert"><strong>We couldn’t load doctors</strong><span>{error}</span></div>}
      <div className="doctor-grid doctor-grid-premium">{loading ? [1, 2, 3].map((item) => <div className="doctor-card skeleton-card" key={item}><div className="skeleton skeleton-photo" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>) : doctors.map((doctor) => <article className="doctor-card doctor-card-premium" key={doctor.id}><div className="doctor-photo"><img src={getDoctorPhoto(doctor.id, doctor.user.email)} alt="" /><span className="online-dot">● Directory listing</span></div><div className="doctor-card-body"><div className="doctor-card-heading"><div><h2>Dr. {doctor.user.firstName} {doctor.user.lastName}</h2><p className="specialty">{doctor.category.name}</p></div></div><p className="muted">A HappyPatient doctor in our {doctor.category.name.toLowerCase()} directory.</p><div className="doctor-meta"><span>◉ {doctor.category.name}</span><span>◎ {doctor.user.email}</span><span>⌖ {doctor.office || "Office location not set"}</span></div><div className="doctor-actions">{user?.role === "PATIENT" && <Link className="button button-outline" to={`/doctors/${doctor.id}/schedule`} state={{ doctorName: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` }}>View schedule</Link>}{authLoading ? <span className="button button-outline" aria-live="polite">Checking access…</span> : user ? <Link className="button button-outline" to="/dashboard">{user.role === "PATIENT" ? "Patient dashboard" : "Open dashboard"}</Link> : <Link className="button button-outline" to="/login" state={{ from: `/search?q=${encodeURIComponent(q)}${category ? `&category=${encodeURIComponent(category)}` : ""}` }}>Sign in to continue</Link>}</div></div></article>)}{!loading && !doctors.length && <div className="empty empty-premium"><span>⌕</span><h2>No doctors found</h2><p>Try a different name, specialty, or office to discover your care team.</p><button className="text-link" onClick={() => { setQ(""); setCategory(""); setOffice(""); search(); }}>Clear filters</button></div>}</div>
    </div>
  </div>;
}
