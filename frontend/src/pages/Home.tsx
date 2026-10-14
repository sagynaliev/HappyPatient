import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { api } from "../lib/api";

const specialtyStyles = [
  { icon: "◒", tone: "mint" },
  { icon: "♡", tone: "lavender" },
  { icon: "✦", tone: "peach" },
  { icon: "⌁", tone: "blue" },
];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [office, setOffice] = useState("");
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api<{ categories: { id: string; name: string }[] }>("/categories")
      .then((result) => setSpecialties(result.categories || []))
      .catch(() => setSpecialties([]));
  }, []);

  function navigateToSearch(searchQuery: string, searchCategory: string, searchOffice: string) {
    const searchParams = new URLSearchParams();
    if (searchQuery) searchParams.set("q", searchQuery);
    if (searchCategory) searchParams.set("category", searchCategory);
    if (searchOffice) searchParams.set("office", searchOffice);
    const queryString = searchParams.toString();
    navigate(`/search${queryString ? `?${queryString}` : ""}`);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToSearch(query.trim(), category, office.trim());
  }

  function selectSuggestion(suggestion: { kind: "specialty" | "doctor" | "clinic"; label: string }) {
    if (suggestion.kind === "specialty") navigateToSearch("", suggestion.label, "");
    else if (suggestion.kind === "clinic") navigateToSearch(suggestion.label, "", "");
    else navigateToSearch(suggestion.label, "", "");
  }

  return (
    <div className="home">
      <section className="hero-premium home-hero">
        <div className="hero-glow hero-glow-one" aria-hidden="true" />
        <div className="hero-glow hero-glow-two" aria-hidden="true" />
        <div className="hero-premium-layout">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-light">HappyPatient care directory</p>
            <h1><span>Find care that</span><em>fits your needs.</em></h1>
            <p className="lead">Search doctors by name, specialty, or location, then review available appointment times.</p>
            <div className="homepage-search">
              <div className="homepage-search-title">
                <strong>Find a doctor</strong>
                <span>Search the doctor directory</span>
              </div>
              <DoctorSearchForm
                query={query}
                category={category}
                office={office}
                categories={specialties}
                onQueryChange={setQuery}
                onCategoryChange={setCategory}
                onOfficeChange={setOffice}
                onSubmit={search}
                onSuggestionSelect={selectSuggestion}
                doctorFieldLabel="Doctor name, specialty, or location"
                bare
              />
            </div>
            <p className="home-search-hint">You can refine your search by specialty, location, and availability.</p>
          </div>
          <div className="home-search-panel" aria-label="Search tips">
            <span className="home-search-panel-icon" aria-hidden="true">⌕</span>
            <p className="eyebrow">Start with a search</p>
            <h2>Choose what matters to you.</h2>
            <ul>
              <li>Search by a doctor’s name</li>
              <li>Browse available specialties</li>
              <li>Filter by listed office location</li>
            </ul>
            <Link className="text-link" to="/search">Open doctor directory <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="home-section specialties-section" id="specialties" aria-labelledby="specialties-heading">
        <div className="section-heading">
          <div><p className="eyebrow">Browse the directory</p><h2 id="specialties-heading">Search by specialty</h2></div>
          <Link className="text-link" to="/search">View all doctors <span aria-hidden="true">↗</span></Link>
        </div>
        {specialties.length ? (
          <div className="specialty-grid">
            {specialties.map((specialty, index) => {
              const style = specialtyStyles[index % specialtyStyles.length];
              return (
                <Link className={`specialty-tile ${style.tone}`} to={`/search?category=${encodeURIComponent(specialty.name)}`} key={specialty.id}>
                  <span className="tile-icon" aria-hidden="true">{style.icon}</span>
                  <span><strong>{specialty.name}</strong><small>View doctors in this specialty</small></span>
                  <b aria-hidden="true">↗</b>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="muted">Specialties will appear here when the directory is available.</p>
        )}
      </section>
      <section className="home-directory-cta">
        <div><p className="eyebrow">Ready to continue?</p><h2>Explore the doctor directory.</h2></div>
        <Link className="button" to="/search">Find a doctor <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
