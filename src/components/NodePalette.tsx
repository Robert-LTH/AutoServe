import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface PaletteItem {
  type: 'form-step' | 'decision-step';
  title: string;
  description: string;
  category: string;
  subcategory: string;
}

const items: PaletteItem[] = [
  {
    type: 'form-step',
    title: 'Formulärsteg',
    description: 'Samla in information från användaren.',
    category: 'Interaktion',
    subcategory: 'Formulär',
  },
  {
    type: 'decision-step',
    title: 'Beslutssteg',
    description: 'Grenar baserat på användarens val.',
    category: 'Logik',
    subcategory: 'Vägval',
  },
];

const ALL_VALUE = 'all';

export default function NodePalette() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_VALUE);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>(ALL_VALUE);

  const categories = useMemo(() => {
    const unique = new Set(items.map((item) => item.category));
    return [ALL_VALUE, ...unique];
  }, []);

  const availableSubcategories = useMemo(() => {
    const relevantItems = items.filter(
      (item) => categoryFilter === ALL_VALUE || item.category === categoryFilter,
    );
    const unique = new Set(relevantItems.map((item) => item.subcategory));
    return [ALL_VALUE, ...unique];
  }, [categoryFilter]);

  useEffect(() => {
    if (subcategoryFilter !== ALL_VALUE && !availableSubcategories.includes(subcategoryFilter)) {
      setSubcategoryFilter(ALL_VALUE);
    }
  }, [availableSubcategories, subcategoryFilter]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter !== ALL_VALUE && item.category !== categoryFilter) {
        return false;
      }

      if (subcategoryFilter !== ALL_VALUE && item.subcategory !== subcategoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${item.title} ${item.description}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [categoryFilter, subcategoryFilter, searchTerm]);

  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: PaletteItem['type']) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCategoryFilter(event.target.value);
  };

  const handleSubcategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSubcategoryFilter(event.target.value);
  };

  return (
    <aside className="palette">
      <h2>Byggstenar</h2>

      <div className="palette-controls">
        <input
          type="search"
          placeholder="Sök efter komponenter"
          value={searchTerm}
          onChange={handleSearchChange}
        />

        <div className="palette-filters">
          <label>
            <span>Kategori</span>
            <select value={categoryFilter} onChange={handleCategoryChange}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === ALL_VALUE ? 'Alla kategorier' : category}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Delkategori</span>
            <select value={subcategoryFilter} onChange={handleSubcategoryChange}>
              {availableSubcategories.map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory === ALL_VALUE ? 'Alla delkategorier' : subcategory}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="palette-empty-state">Inga komponenter matchar dina filter.</p>
      ) : (
        filteredItems.map((item) => (
          <div
            key={item.type}
            className="palette-item"
            onDragStart={(event) => onDragStart(event, item.type)}
            draggable
          >
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </div>
        ))
      )}

      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.75rem' }}>
        Dra en komponent och släpp den i arbetsytan för att skapa nya steg.
      </p>
    </aside>
  );
}
