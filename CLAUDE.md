# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Douban data synchronization repository that automatically fetches movie/book marking records from Douban (all statuses: done/doing/mark) and processes them for use in a Hugo static site via GitHub Pages.

## Commands

### Data Processing
- `node scripts/process-csv-movies.js` - Process raw CSV data from `data/raw/movie-{done,doing,mark}.csv` into `data/movies.json`
- `node scripts/process-csv-books.js` - Process raw CSV data from `data/raw/book-{done,doing,mark}.csv` into `data/books.json`

### Manual Workflow Triggers
- GitHub Actions → "Sync Douban Movies Data" → "Run workflow"
- GitHub Actions → "Sync Douban Books Data" → "Run workflow"

## Architecture

### Data Flow

1. **GitHub Actions Workflows** run weekly (Sunday UTC 16:00 movies, UTC 17:00 books)
2. **Doumark Action** (`lizheming/doumark-action`) fetches data for each status (done/doing/mark) into separate CSVs
3. **Data Processing Scripts** merge CSVs, do incremental updates, output unified JSON
4. **Image Management** - Downloads posters/covers for 5-star items, serves via jsDelivr CDN
5. **Auto-commit** pushes all data to repository

### Key Files

- `data/movies.json` - All movie marking data (all statuses, all ratings)
- `data/books.json` - All book marking data (all statuses, all ratings)
- `data/movie-stats.json` / `data/book-stats.json` - Sync metadata and statistics
- `data/raw/movie-{done,doing,mark}.csv` - Raw CSV data per status
- `data/raw/book-{done,doing,mark}.csv` - Raw CSV data per status
- `scripts/process-csv-movies.js` - Movie data processing script
- `scripts/process-csv-books.js` - Book data processing script
- `images/movies/` / `images/books/` - Downloaded poster/cover images

### Data Structure

**Movies** (`data/movies.json`):
- Fields: `title`, `year`, `rating`, `status`, `directors`, `genres`, `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`
- `poster_url` uses jsDelivr CDN for 5-star movies with downloaded posters

**Books** (`data/books.json`):
- Fields: `title`, `year`, `rating`, `status`, `author`, `publisher`, `genres`, `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`
- Note: `author` (not `authors`) and `poster_url` (not `cover_url`) for Hugo template compatibility

### External Dependencies
- **Douban User ID**: 59715677
- **GitHub Actions**: lizheming/doumark-action for Douban data fetching
- **Hugo Site**: Data consumed at `https://raw.githubusercontent.com/luli-lula/douban-data/main/data/{movies,books}.json`
- **Hugo Templates**: `douban-movies.html` and `douban-books.html` shortcodes in luli-lula.github.io repo

## Development Notes

- Pure Node.js scripts, no external npm dependencies
- **Incremental Updates**: Only processes new items, avoids reprocessing
- **Data Migration**: Scripts handle old field names (authors→author, cover_url→poster_url) on load
- **Backward Compatibility**: Field names match Hugo template expectations
- Scripts fall back to legacy `movie.csv`/`book.csv` if new per-status CSVs don't exist