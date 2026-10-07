import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, Doctor } from "../lib/api";
import { getDoctorPhoto } from "../lib/doctorImages";
import { createPortal } from "react-dom";

interface Category {
  id: string;
  name: string;
}

export default function Search() {
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();

  // Состояния для полей ввода
  const [q, setQuery] = useState(() => params.get("q") || "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    () => {
      const catParam = params.get("category");
      return catParam ? catParam.split(",") : [];
    },
  );
  const [office, setSelectedOffice] = useState(
    () => params.get("office") || "",
  );

  // Состояния категорий и модалки
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");

  // Основные состояния
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Функция выполнения поиска
  const executeSearch = useCallback(
    async (
      searchQuery: string,
      categoriesList: string[],
      officeLocation: string,
    ) => {
      setLoading(true);
      setError("");

      const categoriesParam = categoriesList.join(",");

      // Синхронизация с URL
      const newParams: Record<string, string> = {};
      if (searchQuery.trim()) newParams.q = searchQuery.trim();
      if (categoriesParam) newParams.category = categoriesParam;
      if (officeLocation.trim()) newParams.office = officeLocation.trim();
      setParams(newParams);

      try {
        const queryParams = new URLSearchParams({
          q: searchQuery.trim(),
          category: categoriesParam,
          office: officeLocation.trim(),
        }).toString();

        const result = await api<{ doctors: Doctor[] }>(
          `/doctors?${queryParams}`,
        );
        setDoctors(result.doctors || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load doctors");
      } finally {
        setLoading(false);
      }
    },
    [setParams],
  );

  // 1. LIVE SEARCH: Debounce для поисковых полей (400 мс)
  useEffect(() => {
    const timer = setTimeout(() => {
      void executeSearch(q, selectedCategoryIds, office);
    }, 400);

    return () => clearTimeout(timer);
  }, [q, selectedCategoryIds, office, executeSearch]);

  // Первоначальная загрузка списка всех категорий
  useEffect(() => {
    api<{ categories: Category[] }>("/categories")
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  // Переключение галочек в модальном окне
  const handleCategoryToggle = (id: string) => {
    // Выбирает категорию, или снимает выбор при повторном клике
    setSelectedCategoryIds((prev) => (prev.includes(id) ? [] : [id]));
  };

  // Сброс всех фильтров
  const handleClearFilters = () => {
    setQuery("");
    setSelectedCategoryIds([]);
    setSelectedOffice("");
  };

  // Фильтрация категорий внутри модального окна в реальном времени
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(categorySearchQuery.toLowerCase()),
  );

  const hasActiveFilters = Boolean(
    q || selectedCategoryIds.length > 0 || office,
  );

  return (
    <div className="search-page">
      <section className="search-hero">
        <div>
          <p className="eyebrow eyebrow-light">Your care, on your terms</p>
          <h1>
            Find the right
            <br />
            <em>doctor for you.</em>
          </h1>
          <p>
            Search a growing network of specialists ready to listen, understand,
            and help.
          </p>
        </div>
        <div className="search-hero-orb" aria-hidden="true">
          <span>+</span>
        </div>
      </section>

      <div className="search-content">
        {/* Форма поиска c Live Search */}
        <form className="search-form-bar" onSubmit={(e) => e.preventDefault()}>
          <div className="search-input-group">
            <input
              type="text"
              placeholder="Search by doctor name or keyword…"
              value={q}
              onChange={(e) => setQuery(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="search-input-group">
            <input
              type="text"
              placeholder="Filter by office/location…"
              value={office}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="input-field"
            />
          </div>

          {/* Кнопка открытия модального окна категорий */}
          <button
            type="button"
            className="button button-outline category-modal-trigger"
            onClick={() => setIsCategoryModalOpen(true)}
          >
            {selectedCategoryIds.length > 0
              ? `Categories (${selectedCategoryIds.length})`
              : "Select Specialties"}
          </button>
        </form>

        {/* Панель статуса и сброса */}
        <div className="search-toolbar">
          <div>
            <p className="eyebrow">Care directory</p>
            <h2>
              {loading
                ? "Finding your care team…"
                : `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} found`}
            </h2>
          </div>

          <div className="toolbar-actions">
            <span className="view-chip">All available doctors</span>
            {hasActiveFilters && (
              <button
                className="text-link"
                type="button"
                onClick={handleClearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="alert error" role="alert">
            <strong>We couldn’t load doctors.</strong>
            <span>{error}</span>
          </div>
        )}

        {/* Список результатов */}
        <div className="doctor-list">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div className="doctor-result-card skeleton-card" key={index}>
                <div className="skeleton skeleton-photo" />
                <div className="skeleton-block">
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                  <div className="skeleton skeleton-line" />
                </div>
              </div>
            ))
          ) : doctors.length > 0 ? (
            doctors.map((doctor) => {
              const doctorFullName = `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`;
              const officeLocation =
                doctor.office || "Location available on request";

              return (
                <article className="doctor-result-card" key={doctor.id}>
                  <div className="doctor-photo-wrap">
                    <img
                      src={getDoctorPhoto(doctor.id, doctor.user.email)}
                      alt={doctorFullName}
                    />
                    <span className="doctor-status-tag">Directory listing</span>
                  </div>

                  <div className="doctor-card-body">
                    <div className="doctor-card-header">
                      <div>
                        <h3>{doctorFullName}</h3>
                      </div>
                      <span className="availability-pill">Open schedule</span>
                    </div>

                    <div className="doctor-card-meta">
                      <span>{doctor.category.name}</span>
                      <span>{doctor.office || "Office location not set"}</span>
                    </div>

                    <p className="doctor-summary">
                      A HappyPatient doctor in our{" "}
                      {doctor.category.name.toLowerCase()} directory.
                    </p>

                    <div className="doctor-detail-grid">
                      <div className="detail-item">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M10 10C9.08334 10 8.29862 9.67362 7.64584 9.02084C6.99307 8.36807 6.66668 7.58334 6.66668 6.66668C6.66668 5.75001 6.99307 4.96529 7.64584 4.31251C8.29862 3.65973 9.08334 3.33334 10 3.33334C10.9167 3.33334 11.7014 3.65973 12.3542 4.31251C13.007 4.96529 13.3333 5.75001 13.3333 6.66668C13.3333 7.58334 13.007 8.36807 12.3542 9.02084C11.7014 9.67362 10.9167 10 10 10ZM3.33334 16.6667V14.3333C3.33334 13.8611 3.45487 13.4271 3.69793 13.0313C3.94098 12.6354 4.2639 12.3333 4.66668 12.125C5.52779 11.6945 6.40279 11.3715 7.29168 11.1563C8.18057 10.941 9.08334 10.8333 10 10.8333C10.9167 10.8333 11.8195 10.941 12.7083 11.1563C13.5972 11.3715 14.4722 11.6945 15.3333 12.125C15.7361 12.3333 16.059 12.6354 16.3021 13.0313C16.5451 13.4271 16.6667 13.8611 16.6667 14.3333V16.6667H3.33334ZM5.00001 15H15V14.3333C15 14.1806 14.9618 14.0417 14.8854 13.9167C14.809 13.7917 14.7083 13.6945 14.5833 13.625C13.8333 13.25 13.0764 12.9688 12.3125 12.7813C11.5486 12.5938 10.7778 12.5 10 12.5C9.22223 12.5 8.4514 12.5938 7.68751 12.7813C6.92362 12.9688 6.16668 13.25 5.41668 13.625C5.29168 13.6945 5.19098 13.7917 5.11459 13.9167C5.0382 14.0417 5.00001 14.1806 5.00001 14.3333V15ZM10 8.33334C10.4583 8.33334 10.8507 8.17015 11.1771 7.84376C11.5035 7.51737 11.6667 7.12501 11.6667 6.66668C11.6667 6.20834 11.5035 5.81598 11.1771 5.48959C10.8507 5.1632 10.4583 5.00001 10 5.00001C9.54168 5.00001 9.14932 5.1632 8.82293 5.48959C8.49654 5.81598 8.33334 6.20834 8.33334 6.66668C8.33334 7.12501 8.49654 7.51737 8.82293 7.84376C9.14932 8.17015 9.54168 8.33334 10 8.33334Z"
                            fill="#1D1B20"
                          />
                        </svg>
                        <span>{doctor.category.name}</span>
                      </div>
                      <div className="detail-item">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <g clip-path="url(#clip0_7_252)">
                            <path
                              d="M14 6.66669C14 11.3334 8 15.3334 8 15.3334C8 15.3334 2 11.3334 2 6.66669C2 5.07539 2.63214 3.54926 3.75736 2.42405C4.88258 1.29883 6.4087 0.666687 8 0.666687C9.5913 0.666687 11.1174 1.29883 12.2426 2.42405C13.3679 3.54926 14 5.07539 14 6.66669Z"
                              stroke="#1E1E1E"
                              stroke-width="1.6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                            <path
                              d="M8 8.66669C9.10457 8.66669 10 7.77126 10 6.66669C10 5.56212 9.10457 4.66669 8 4.66669C6.89543 4.66669 6 5.56212 6 6.66669C6 7.77126 6.89543 8.66669 8 8.66669Z"
                              stroke="#1E1E1E"
                              stroke-width="1.6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_7_252">
                              <rect width="16" height="16" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                        <span>{officeLocation}</span>
                      </div>
                    </div>

                    <div className="doctor-actions">
                      {user?.role === "PATIENT" ? (
                        <Link
                          className="button button-outline"
                          to={`/doctors/${doctor.id}/schedule`}
                          state={{
                            doctorName: doctorFullName,
                            specialty: doctor.category.name,
                            office: officeLocation,
                          }}
                        >
                          Book appointment
                        </Link>
                      ) : authLoading ? (
                        <span
                          className="button button-outline"
                          aria-live="polite"
                        >
                          Checking access…
                        </span>
                      ) : user ? (
                        <Link className="button button-outline" to="/dashboard">
                          Open dashboard
                        </Link>
                      ) : (
                        <Link
                          className="button button-outline"
                          to="/login"
                          state={{
                            from: `/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(
                              selectedCategoryIds.join(","),
                            )}`,
                          }}
                        >
                          Sign in to continue
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty empty-premium">
              <span>⌕</span>
              <h2>No doctors found</h2>
              <p>
                Try a different name, specialty, or office to discover your care
                team.
              </p>
              <button
                className="text-link"
                type="button"
                onClick={handleClearFilters}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ЧЕРЕЗ PORTAL */}
      {isCategoryModalOpen &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={() => setIsCategoryModalOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="modal-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Select Specialties</h3>
                <button
                  type="button"
                  className="modal-close-button"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-search-box">
                <input
                  type="text"
                  placeholder="Search specialty…"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="input-field"
                  autoFocus
                />
              </div>

              <div className="category-checkbox-list">
                {filteredCategories.length > 0 ? (
                  filteredCategories.map((cat) => {
                    const isChecked = selectedCategoryIds.includes(cat.id);
                    return (
                      <label key={cat.id} className="category-checkbox-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCategoryToggle(cat.id)}
                        />
                        <span>{cat.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="modal-empty-text">
                    No specialties match your search.
                  </p>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSelectedCategoryIds([])}
                >
                  Reset selection
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  Apply ({selectedCategoryIds.length})
                </button>
              </div>
            </div>
          </div>,
          document.body, // Рендерим модалку прямо в body
        )}
    </div>
  );
}
