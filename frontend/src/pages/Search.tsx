import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { useAuth } from "../context/AuthContext";
import { api, Doctor } from "../lib/api";

const photos = [
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=500&q=85",
];

export default function Search() {
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function search(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setParams({ ...(q ? { q } : {}), ...(category ? { category } : {}) });
    try {
      const result = await api<{ doctors: Doctor[] }>(`/doctors?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
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
      <DoctorSearchForm query={q} category={category} categories={categories} onQueryChange={setQ} onCategoryChange={setCategory} onSubmit={search} />
      <div className="search-toolbar"><div><p className="eyebrow">Care directory</p><h2>{loading ? "Finding your care team…" : `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} found`}</h2></div><div className="view-chip">All available doctors</div></div>
      {error && <div className="alert error" role="alert"><strong>We couldn’t load doctors</strong><span>{error}</span></div>}
      <div className="doctor-grid doctor-grid-premium">{loading ? [1, 2, 3].map((item) => <div className="doctor-card skeleton-card" key={item}><div className="skeleton skeleton-photo" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>) : doctors.map((doctor, index) => <article className="doctor-card doctor-card-premium" key={doctor.id}><div className="doctor-photo"><img src={photos[index % photos.length]} alt="" /><span className="online-dot">● Directory listing</span></div><div className="doctor-card-body"><div className="doctor-card-heading"><div><h2>Dr. {doctor.user.firstName} {doctor.user.lastName}</h2><p className="specialty">{doctor.category.name}</p></div></div><p className="muted">A HappyPatient doctor in our {doctor.category.name.toLowerCase()} directory.</p><div className="doctor-meta"><span>◉ {doctor.category.name}</span><span>◎ {doctor.user.email}</span></div><div className="doctor-actions">{authLoading ? <span className="button button-outline" aria-live="polite">Checking access…</span> : user ? <Link className="button button-outline" to="/dashboard">{user.role === "PATIENT" ? "Open patient dashboard" : "Open dashboard"}</Link> : <Link className="button button-outline" to="/login" state={{ from: `/search?q=${encodeURIComponent(q)}${category ? `&category=${encodeURIComponent(category)}` : ""}` }}>Sign in to continue</Link>}</div></div></article>)}{!loading && !doctors.length && <div className="empty empty-premium"><span>⌕</span><h2>No doctors found</h2><p>Try a different name or specialty to discover your care team.</p><button className="text-link" onClick={() => { setQ(""); setCategory(""); search(); }}>Clear filters</button></div>}</div>
    </div>
  </div>;
}
