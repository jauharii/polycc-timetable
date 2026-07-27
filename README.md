# POLYCC Timetable

Next.js static export timetable viewer for Malaysian Polytechnics and Community Colleges (Politeknik & Kolej Komuniti).

## Features

- **50 agencies** — All Malaysian polytechnics and community colleges
- **Weekly auto-update** — GitHub Actions scrapes portal every Monday 03:00 GMT+8
- **Typeable search** — Agency, session, class, lab, lecturer filters with datalist autocomplete
- **Print-ready** — A4 landscape poster format with course description table
- **Static export** — No server needed, deployed to GitHub Pages

## Tech Stack

| Layer         | Technology                                       |
| ------------- | ------------------------------------------------ |
| Frontend      | Next.js 14 (static export), React 18, TypeScript |
| Styling       | Tailwind CSS                                     |
| Data pipeline | Python, SQLite                                   |
| Deployment    | GitHub Actions → GitHub Pages                    |

## Data Pipeline

```
Portal (mypolycc.edu.my)
    ↓ scrape (import_polycc.py)
SQLite (data/timetable.db)
    ↓ export (scripts/export_data.py)
JSON (public/data/*.json)
    ↓ build (next build)
Static HTML (out/)
```

### Parallel Scraping (GitHub Actions)

The workflow splits 50 agencies into 20 parallel jobs:

- **Job 1**: Ungku Omar (agency 5) — isolated due to too large to scrape
- **Jobs 2–20**: Remaining 49 agencies distributed evenly (2–3 per job)

## Deployment

### GitHub Pages (automatic)

1. Push to `main` branch
2. GitHub Actions runs weekly (Sunday 19:00 UTC = Monday 03:00 GMT+8)
3. Or trigger manually: **Actions → Deploy to GitHub Pages → Run workflow**

Site URL:
https://jauharii.github.io/polycc-timetable/

### Environment Variables

| Variable                | Description                        | Default |
| ----------------------- | ---------------------------------- | ------- |
| `NEXT_PUBLIC_BASE_PATH` | Base path for GitHub Pages subpath | `''`    |

Set automatically in workflow: `/${{ github.event.repository.name }}`

## Project Structure

```
├── app/
│   ├── page.tsx                    # Redirects to first timetable
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Tailwind + custom styles
│   └── t/[agencyid]/[sessioncode]/
│       ├── page.tsx                # Server component (SSG)
│       └── TimetableViewer.tsx     # Client component (interactive)
├── components/
│   ├── AgencySessionNav.tsx        # Agency/session picker (toolbar)
│   ├── FilterTabs.tsx              # Class/lab/lecturer tabs
│   ├── TimetableGrid.tsx           # Weekly timetable grid
│   └── CourseTable.tsx             # Course description table
├── lib/
│   ├── types.ts                    # TypeScript interfaces
│   └── grid.ts                     # Grid building logic
├── scripts/
│   ├── export_data.py              # SQLite → JSON export
│   └── split_agencies.py           # Split agencies for parallel scraping
├── import_polycc.py                # Portal scraper
├── public/data/                    # Exported JSON (generated)
└── .github/workflows/deploy.yml    # CI/CD pipeline
```

## Shortcode Generation

Course shortcodes are generated from course names:

- First letter of each word, uppercase
- Stop words filtered: `dan, and, of, &, for, untuk, dalam, the, a, an, di, ke, dari, pada, dengan, or, atau`
- Special case: `Kokurikulum` → `KOKU`

Examples:



| Course Name                  | Shortcode |
| ---------------------------- | --------- |
| Integrated Project           | IP        |
| Bahasa Melayu Komunikasi     | BMK       |
| Programming for Data Science | PDS       |
| Pengurusan Kokurikulum       | KOKU      |

## Data Source

- Portal: https://app.mypolycc.edu.my/polycctas/service/kelas/
- 50 agencies (polytechnics + community colleges)
- ~300,000 timetable entries
- ~11,000 classes, ~3,500 courses, ~4,600 lecturers

## Note

This code is AI generated.

## License

Data sourced from public Malaysian government portal. For educational use.
