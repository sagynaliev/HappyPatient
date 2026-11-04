import MedicalHistory from '../components/MedicalHistory';
import { Icon } from '../components/Icons';

export default function MedicalHistoryPage() {
  return (
    <section className="mh-page" aria-labelledby="mh-title">
      <header className="mh-banner">
        <div className="mh-banner-copy">
          <span className="mh-banner-chip"><Icon name="shield" size={16} /> Private to you and your doctors</span>
          <h1 id="mh-title">Health records</h1>
          <p>Notes from your doctors after each visit, in one timeline.</p>
        </div>
        <div className="mh-banner-art" aria-hidden="true">
          <span className="mh-orb mh-orb-1" />
          <span className="mh-orb mh-orb-2" />
          <span className="mh-art-card"><Icon name="file" size={46} /></span>
        </div>
      </header>
      <MedicalHistory />
    </section>
  );
}
