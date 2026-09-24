import { FormEvent } from "react";

type Category = { id: string; name: string };

type DoctorSearchFormProps = {
  query: string;
  category: string;
  categories: Category[];
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  buttonLabel?: string;
  doctorFieldLabel?: string;
  bare?: boolean;
};

export default function DoctorSearchForm({
  query,
  category,
  categories,
  onQueryChange,
  onCategoryChange,
  onSubmit,
  buttonLabel = "Search",
  doctorFieldLabel = "Find your doctor",
  bare = false,
}: DoctorSearchFormProps) {
  return (
    <form className={`discovery-bar${bare ? " discovery-bar-bare" : ""}`} onSubmit={onSubmit}>
      <label>
        <span>{doctorFieldLabel}</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by doctor, specialty, or condition"
          aria-label="Find your doctor"
        />
      </label>
      <label>
        <span>Specialty</span>
        <select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Specialty"
        >
          <option value="">All specialties</option>
          {categories.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button" type="submit">
        {buttonLabel} <span>↗</span>
      </button>
    </form>
  );
}
