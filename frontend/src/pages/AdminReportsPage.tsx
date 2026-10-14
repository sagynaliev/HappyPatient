export default function AdminReportsPage() {
  const reports = [
    { label: "Active patients", value: "121" },
    { label: "Verified doctors", value: "4" },
    { label: "Confirmed bookings", value: "54" },
    { label: "Pending reviews", value: "2" },
  ];

  return (
    <div className="admin-page">
      <header className="admin-header-panel">
        <div>
          <p className="admin-eyebrow">Operational summary</p>
          <h1>Reports</h1>
        </div>
      </header>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Platform summary</h2>
        </div>
        <div className="admin-report-grid">
          {reports.map((item) => (
            <article key={item.label} className="admin-report-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
