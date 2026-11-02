import MedicalHistory from '../components/MedicalHistory';

export default function MedicalHistoryPage() {
  return (
    <section className="mh-page" aria-labelledby="mh-title">
      <div className="mh-container">
        <header className="mh-page-heading">
          <h1 id="mh-title">Health records</h1>
          <p>Notes from your doctors after each visit, in one timeline.</p>
        </header>
        <MedicalHistory />
      </div>
    </section>
  );
}
