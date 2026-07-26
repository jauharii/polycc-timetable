'use client';

interface Props {
  filterType: 'class' | 'lab' | 'lecturer';
  onFilterChange: (type: 'class' | 'lab' | 'lecturer') => void;
}

export default function FilterTabs({ filterType, onFilterChange }: Props) {
  return (
    <div className="filter-tabs" role="radiogroup" aria-label="Filter by">
      {(['class', 'lab', 'lecturer'] as const).map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={filterType === type}
          onClick={() => onFilterChange(type)}
          className={
            filterType === type
              ? 'bg-black text-white'
              : 'bg-white text-black border border-gray-300 hover:bg-gray-50'
          }
        >
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </button>
      ))}
    </div>
  );
}