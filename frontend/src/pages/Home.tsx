import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { Icon, IconName } from "../components/Icons";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import "../styles/home.css";

const HERO_PHOTO = "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=900&q=85";

const specialtyIcons: IconName[] = ["heart", "stethoscope", "user", "shield", "spark", "file"];

const steps = [
  { title: "Find a doctor", text: "Search by name, specialty or city and compare consultation fees." },
  { title: "Pick a time", text: "Choose a free 30-minute slot that fits your day." },
  { title: "Get confirmation", text: "Your booking and every change appear under the bell." },
  { title: "Check in on arrival", text: "Confirm you are here from your phone or at the front desk." },
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [office, setOffice] = useState("");
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);

  useEffect(() => {
    api<{ categories: { id: string; name: string }[] }>("/categories")
      .then((result) => setSpecialties(result.categories || []))
      .catch(() => setSpecialties([]));
    api<{ doctors: unknown[] }>("/doctors")
      .then((result) => setDoctorCount(result.doctors?.length ?? null))
      .catch(() => setDoctorCount(null));
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
    else navigateToSearch(suggestion.label, "", "");
  }

  return (
    <div className="hm">
      <section className="hm-hero" aria-labelledby="hm-title">
        <div className="hm-hero-copy">
          <h1 id="hm-title">Your doctor, <span>a few clicks away</span></h1>
          <p className="hm-lead">Find a specialist in Almaty, book a free time slot and check in when you arrive — without queues at the front desk.</p>
          <div className="hm-search" id="hm-search">
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
              buttonLabel="Find a doctor"
              showSubmit
              bare
            />
          </div>
          <dl className="hm-stats">
            <div><dt>Doctors</dt><dd>{doctorCount ?? "—"}</dd></div>
            <div><dt>Specialties</dt><dd>{specialties.length || "—"}</dd></div>
            <div><dt>Visit length</dt><dd>30<small> min</small></dd></div>
          </dl>
        </div>

        <div className="hm-hero-visual">
          <span className="hm-location"><Icon name="pin" size={16} /> Almaty, Kazakhstan</span>
          <img src={HERO_PHOTO} alt="" loading="eager" />
          <span className="hm-tag hm-tag-1"><Icon name="shield" size={15} /> Verified doctors</span>
          <span className="hm-tag hm-tag-2"><Icon name="calendar" size={15} /> Online booking</span>
          <span className="hm-tag hm-tag-3"><Icon name="check" size={15} /> 1-tap check-in</span>
          <div className="hm-visual-note">
            <strong>Booking takes about a minute</strong>
            <span>Pick a doctor, choose a slot, confirm.</span>
          </div>
        </div>
      </section>

      <nav className="hm-jump" aria-label="On this page">
        <span className="hm-jump-title">On this page</span>
        {[
          { id: "hm-search", label: "Search a doctor", icon: "search" as const },
          { id: "specialties", label: "Medical services", icon: "stethoscope" as const },
          { id: "how-it-works", label: "How a visit works", icon: "clock" as const },
        ].map((item) => (
          <a key={item.id} className="hm-jump-link" href={`#${item.id}`} onClick={(event) => {
            const target = document.getElementById(item.id);
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: item.id === "hm-search" ? "center" : "start" });
            if (item.id === "hm-search") target.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
          }}>
            <Icon name={item.icon} size={16} /> {item.label}
          </a>
        ))}
      </nav>

      <section className="hm-section" id="specialties" aria-labelledby="specialties-heading">
        <header className="hm-section-head">
          <h2 id="specialties-heading">Our medical services</h2>
          <p>Choose a specialty to see the doctors who practise it and their next free times.</p>
          <Link className="hm-link" to="/search">See all doctors</Link>
        </header>
        {specialties.length ? (
          <div className="hm-services">
            {specialties.slice(0, 7).map((specialty, index) => (
              <Link className="hm-service" to={`/search?category=${encodeURIComponent(specialty.name)}`} key={specialty.id}>
                <span className="hm-service-icon"><Icon name={specialtyIcons[index % specialtyIcons.length]} size={22} /></span>
                <strong>{specialty.name}</strong>
                <span className="hm-service-cta">Make an appointment <Icon name="arrow-right" size={16} /></span>
              </Link>
            ))}
            <Link className="hm-service hm-service-feature" to="/search">
              <strong>{specialties.length > 7 ? `+${specialties.length - 7} more specialties` : "All specialties"}</strong>
              <span>Browse the full doctor directory with filters for city, price and availability.</span>
              <span className="hm-service-cta">Open directory <Icon name="arrow-right" size={16} /></span>
            </Link>
          </div>
        ) : (
          <p className="hm-muted">Specialties will appear here when the directory is available.</p>
        )}
      </section>

      <section className="hm-section hm-steps-section" id="how-it-works" aria-labelledby="steps-heading">
        <header className="hm-section-head">
          <h2 id="steps-heading">How a visit works</h2>
          <p>From search to the doctor’s office in four steps.</p>
          <Link className="hm-link" to={user ? "/search" : "/register"}>{user ? "Find a doctor" : "Create a free account"}</Link>
        </header>
        <ol className="hm-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="hm-step-number">{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

    </div>
  );
}
