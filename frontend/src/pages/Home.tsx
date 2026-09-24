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

const heroDoctorImage = "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=700&q=85";

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<{ categories: { id: string; name: string }[] }>("/categories")
      .then((result) => setSpecialties(result.categories || []))
      .catch(() => setSpecialties([]));
  }, []);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());
    if (category) searchParams.set("category", category);
    const queryString = searchParams.toString();
    navigate(`/search${queryString ? `?${queryString}` : ""}`);
  }
  return (
    <div className="home">
      <section className="hero hero-premium">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-copy">
          <p className="eyebrow eyebrow-light">Your health, your way</p>
          <h1>Healthcare that <em>puts you first.</em></h1>
          <p className="lead">Find the right doctor, book your appointment, and take care of your health — all in one place.</p>
          <div className="homepage-search">
            <div className="homepage-search-title"><strong>Find your doctor</strong><span>Personalized care starts here</span></div>
            <DoctorSearchForm query={query} category={category} categories={specialties} onQueryChange={setQuery} onCategoryChange={setCategory} onSubmit={search} buttonLabel="Search Doctors" doctorFieldLabel="Doctor search" bare />
          </div>
          <div className="hero-proof"><span className="proof-avatars"><i>MC</i><i>AP</i><i>LM</i></span><span>Care that feels personal, from first search to follow-up.</span></div>
        </div>
        <div className="hero-visual" aria-label="A doctor ready to help">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="doctor-portrait"><img src={heroDoctorImage} alt="Doctor smiling" /><span className="portrait-status"><b /> Find your care team</span></div>
          <div className="floating-stat stat-top"><span>✦</span><strong>Care, connected</strong><small>One simple experience</small></div>
          <div className="floating-stat stat-bottom"><strong>24/7</strong><small>Find support when you need it</small></div>
          <div className="visual-cross">+</div>
        </div>
      </section>
      <section className="trust-strip"><span>Designed around your everyday health</span><b>Find care</b><b>Manage appointments</b><b>Stay informed</b></section>
      <section className="home-section specialties-section" id="specialties">
        <div className="section-heading"><div><p className="eyebrow">Explore care</p><h2>Start with what<br /><em>matters to you.</em></h2></div><Link className="text-link" to="/search">View all specialties ↗</Link></div>
        <div className="specialty-grid">{specialties.slice(0, 6).map((specialty, index) => { const style = specialtyStyles[index % specialtyStyles.length]; return <Link className={`specialty-tile ${style.tone}`} to={`/search?category=${encodeURIComponent(specialty.name)}`} key={specialty.id}><span className="tile-icon">{style.icon}</span><span><strong>{specialty.name}</strong><small>Find doctors in this specialty</small></span><b>↗</b></Link>; })}</div>
      </section>
      <section className="home-section featured-section" id="doctors">
        <div className="section-heading"><div><p className="eyebrow">A clearer care journey</p><h2>From search to<br /><em>the next right step.</em></h2></div><Link className="text-link" to="/search">Find a doctor ↗</Link></div>
        <div className="care-steps"><article><span>01</span><h3>Search</h3><p>Find doctors by name or specialty using the live directory.</p></article><article><span>02</span><h3>Compare</h3><p>Review each doctor’s specialty, category, and contact details.</p></article><article><span>03</span><h3>Continue</h3><p>Sign in to keep moving through the care journey.</p></article></div>
      </section>
      <section className="cta-banner"><div><p className="eyebrow eyebrow-light">A better way to care for yourself</p><h2>Good care starts<br />with a simple step.</h2></div><Link className="button button-bright" to="/register">Create your account <span>↗</span></Link></section>
    </div>
  );
}
